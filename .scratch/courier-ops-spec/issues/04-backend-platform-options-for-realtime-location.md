# Backend platform options for realtime location

Type: research
Status: resolved
Blocked by: —
Map: ../map.md
Asset: ../research/backend-platform-options.md

## Question

What are the credible backend platform options for ingesting a stream of driver positions and fanning them out live to customer and dispatcher clients, and how do they compare?

This is the fact-gathering that ticket 05 (Backend platform decision) waits on. It gathers options; it does not choose.

Cover both shapes:

- **Managed / BaaS:** Supabase (Postgres + Realtime + PostGIS), Firebase (Firestore/RTDB), Convex, and dedicated realtime transports such as Ably, Pusher, or PartyKit paired with a separate database.
- **Custom TypeScript server:** Node or Bun with WebSockets or SSE, on a host that supports persistent connections — noting which popular hosts do *not* (serverless platforms with short function timeouts are a trap here).

For each, establish:

- How it handles frequent small writes from many clients — the location-update pattern is write-heavy and unusual for a BaaS.
- Fan-out model: can N customer clients subscribe to one driver's position stream cheaply, and what is the per-connection or per-message cost.
- Geospatial querying support, since the dispatcher console needs "drivers near this pickup" even without route optimisation.
- Pricing shape at small scale, and specifically what a continuously-connected client costs — realtime pricing usually bills connections and messages, which is exactly what this workload maximises.
- React Native client support and connection resilience on mobile networks (backgrounding, reconnection, auth token refresh).
- TypeScript end-to-end type-safety story, given TS is a fixed constraint.
- Auth capabilities, since three distinct actor types need different access — this feeds ticket 09.

Deliver a comparison with the trade-offs made explicit. Write findings to `.scratch/courier-ops-spec/research/backend-platform-options.md`.

## Answer

Full findings: [`research/backend-platform-options.md`](../research/backend-platform-options.md). **No winner picked** — that is ticket 05's job. Nine options, priced against one shared anchor so the numbers compare: 20 drivers × 1 position/5s × 8h × 22 days ≈ **2.5M inbound writes/month**, **~7.6M outbound deliveries** at ~3 recipients each, peak ~75 hour-long connections, ~200-byte payloads.

| Shape | Options and monthly cost at anchor |
|---|---|
| Managed / BaaS | Supabase ~$38 · Firestore ~$8–10 · Firebase RTDB ~$1–3 · Convex ~$17–25 |
| Transport + separate DB | Ably ~$56 · Pusher $49 flat · Cloudflare Durable Objects ~$20 (maybe $5) · PartyKit — see below |
| Custom TS server | ~$5–15 on Fly / Railway / Render / DO / Hetzner |

### The pricing hypothesis in this ticket was half wrong

I charted this expecting **connection billing** to dominate. It doesn't — at 75 concurrent connections it is a rounding error: under $1 on Ably, free on Supabase, Firestore, RTDB, Convex, and Durable Objects. **Message count** is what separates a $2 option from a $56 one.

The real sorting axis is what each platform *meters*. Per-delivered-message pricing (Ably, Supabase, Firestore) scales linearly with recipients-per-position; duration-or-bytes pricing (Durable Objects, RTDB, a plain VM) does not. At 10 watchers per driver instead of 3, Ably roughly triples while Durable Objects is unchanged. **"How many people watch one driver at once" is therefore a pricing question, not only a UX one** — it belongs in ticket 06.

### Geospatial is the sharpest discriminator

Only **Supabase** and a **custom server on Postgres** have a current, indexed spatial story. Firestore's official geohash library (`geofire-common`) last published 2022-07-13; Convex's geospatial component is explicitly beta; all four transports have none — so choosing a transport implicitly forces a separate database decision.

### No option is both cheap at fan-out and gives you resilience

**Ably alone** solves reconnect message-continuity (~2 min auto-resume) — and bills per delivery. Durable Objects and a custom server make fan-out effectively free and make reconnection, backfill, presence, and auth-token refresh **your code**. That is the central trade in this decision.

### Auth fails closed or fails open — and that matters here

Supabase RLS, Firebase Rules, and Ably capability tokens can all express ticket 09's crux (a customer reads a driver's position *only* during their own job) and **fail closed**. Convex explicitly rejects RLS in favour of in-function checks; a custom server is the same. Both **fail open** on a forgotten check — over live human location data.

### The serverless trap has changed shape

The framing in the ticket is out of date. Vercel **now supports** WebSockets via Fluid compute — then closes the connection at max function duration (300s Hobby, 800s Pro), roughly **36 forced reconnects per driver per day**, while billing provisioned memory for the connection's whole life. AWS API Gateway WebSocket: hard 2-hour connection cap, hard 10-minute idle timeout, and you own the connection registry. Both make you absorb custom-server complexity *and* pay per connection-minute. Netlify offers nothing usable; plain Cloudflare Workers cannot coordinate across connections.

### Two corrections to widely-repeated folklore

- Firestore's "1 sustained write/sec per document" limit is **retired** from current docs.
- Supabase's own docs recommend **Broadcast, not Postgres Changes** — the latter authorises per-subscriber and is single-threaded.

### Not primary-sourced (26 items; three that could move the decision)

- **Convex publishes no first-party definition of a "function call"** — its entire estimate rests on a community-forum rule and could be off by 2–3×.
- **Cloudflare does not document the hibernation idle threshold** — a 4× swing ($5 vs $20) that needs a load test to settle.
- **PartyKit appears dormant** (`partykit` last published 2025-09-11, superseded by `partyserver` / `agents`) with **no official deprecation notice**, and its docs still read as current. That is the hazard, and it is why it carries no price above.

Also: Render and Hetzner prices could not be read from live pages, and Hetzner raised prices on 2026-06-15.
