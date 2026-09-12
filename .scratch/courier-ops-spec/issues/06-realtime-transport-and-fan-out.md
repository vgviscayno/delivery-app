# Realtime transport and fan-out

Type: grilling
Status: resolved
Blocked by: 05 (03 resolved)
Map: ../map.md

## Question

How does a position leave the driver's device and reach the customer's and dispatcher's screens?

Define the pipeline end to end:

- The ingest contract: what the driver app sends (single point or batched breadcrumbs), over what protocol, how often, and what the server does on receipt.
- The fan-out mechanism: WebSocket, SSE, platform-native realtime subscription, or polling. Justify against the actual latency requirement rather than assuming push is mandatory — a customer watching a van does not need 100ms.
- Subscription topology: does a customer subscribe to their job, to a driver, or to a channel keyed on something else. This determines authorisation granularity.
- What the dispatcher subscribes to — all active drivers at once is a different fan-out problem from one customer watching one driver.
- Reconnection semantics: on reconnect, does a client get the latest position only, or a backfill of what it missed, and does that differ for the dispatcher versus the customer.
- Backpressure and cost control: what stops a chatty driver app from multiplying messages across every subscriber.
- Whether ingest and fan-out share a path or are deliberately decoupled through storage.

**Watchers-per-driver is a pricing decision, not only a UX one.** Ticket 04 found that per-delivered-message platforms (Ably, Supabase, Firestore) scale linearly with how many clients watch one driver, while duration-or-bytes platforms (Durable Objects, RTDB, a plain VM) are flat. Going from 3 watchers per driver to 10 roughly triples the bill on one shape and changes nothing on the other. So "can the whole office watch a driver" must be answered here, deliberately, and fed back against whatever ticket 05 picked.

**Reconnection is the resilience crux.** Only Ably provides message-continuity on reconnect off the shelf (~2 min auto-resume). On every other option, deciding "latest position only" vs "backfill what was missed" also decides how much plumbing gets written by hand.

Blocked on ticket 03 because the achievable update frequency sets the pipeline's input rate, and on ticket 05 because the platform determines which transports are even available.

## Answer

**Push via Supabase Realtime Broadcast, decoupled from a persisted "latest position" row, with two separate fan-out channels — one per Delivery for customers, one global "all-drivers" channel for the dispatcher.** No backfill on reconnect; no batching on ingest.

### Pipeline, end to end

1. **Ingest**: the driver app sends one position per HTTP call to a single Edge Function — never batched, even when the offline SQLite buffer (ticket 03) replays a backlog after a gap. Keeping the ingest contract single-shaped avoids a batch/non-batch branch in the one place all positions arrive, and at ~20 drivers a burst of buffered fixes is trivial load.
2. **On receipt, the Edge Function**:
   - Rate-limits: drops (200 OK, no-op) any fix arriving less than ~5s after the last *accepted* fix for that driver, checked against the same latest-position row below. This is the sole backpressure control, and it caps fan-out cost at a fixed ceiling regardless of how a misbehaving client sends.
   - Upserts a single "latest position" row per driver into Postgres — durable state for the dispatcher's geospatial queries (ticket 04) and for reconnection (below). This write is a side effect, not a dependency of the broadcast.
   - Broadcasts the fix via Supabase Realtime **Broadcast**, not Postgres Changes (per ticket 05's handoff — Postgres Changes tails the WAL and authorizes per-subscriber on a single-threaded stream, which doesn't scale to this fan-out). The broadcast goes to two destinations: every currently-active Delivery channel for that driver, and the one dispatcher-only "all-drivers" channel.
3. **Subscription topology**: customers subscribe to their own **Delivery's** channel, not the driver's. This matches the domain vocabulary (`CONTEXT.md`) and keeps authorization static per Delivery — it doesn't need recomputing when a driver picks up unrelated stops (multi-stop dispatch, `docs/adr/0001-multi-stop-dispatch.md`). The dispatcher instead subscribes to a single global channel carrying every driver's positions, sidestepping the duplication that per-Delivery subscriptions would cause for a driver holding several concurrent Deliveries.
4. **Reconnection**: both actor types re-fetch the persisted latest-position row(s) on reconnect and resume listening live — no missed-message backfill for either. True continuity (Ably-style auto-resume) was already ruled out when ticket 05 picked Supabase over Ably; latest-position-only is sufficient because the UX requirement is "where is it now," not a full trajectory replay.

### Reasoning highlights

- **Push, not poll**, even though the ~10-15s driver cadence (ticket 03) would tolerate polling: Realtime is already part of the ticket-05 platform choice, and N clients polling every few seconds is more DB load than one write fanned out to N live subscribers.
- **Decoupled ingest/fan-out**: Broadcast fan-out never blocks on or requires the Postgres write; the write exists only to serve geospatial lookups and reconnection, not to drive the live channel.
- **Dispatcher fan-out is a genuinely different shape** from customer fan-out, as the ticket anticipated — one global channel rather than N per-Delivery subscriptions, avoiding both subscription churn as Deliveries open/close and duplicate messages when one driver holds multiple stops.
- **Watchers-per-driver cost note (ticket 04)**: Broadcast fan-out is per-message-delivered, so cost still scales with subscribers-per-channel. This design keeps that bounded — a customer's channel has few watchers (their own Delivery), and the dispatcher's channel, while broad, is a single subscriber type (one console) rather than N per-customer connections multiplying.
