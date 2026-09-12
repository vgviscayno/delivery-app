# Order-acceptance time window

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

The client wants to restrict *when* the store accepts orders — a window of time outside which the customer app should not let an order through. New requirement, not previously in the domain model or map.

Sharpen with `/grilling` and `/domain-modeling`:

- **Shape of the window.** A single fixed daily window, or does it vary by day of week? Any closed days or holiday exceptions? (Single business, single pickup location per `CONTEXT.md` — no per-location variation to worry about.)
- **Where is it enforced.** Purely a customer-app gate before an Order can be submitted, or does the dispatcher console need to see/override it too (e.g. a manual "we're closing early today")? Client-side check alone isn't authoritative — does submission need a server-side guard (Postgres check / RLS-style constraint) so a stale client can't submit outside the window regardless of what the UI shows?
- **What the customer sees outside the window.** Ordering disabled entirely (app shows a "closed, opens at HH:MM" state) vs. browsing allowed but checkout blocked vs. allowing submission with a deferred fulfilment time. Given the domain model's `Received → Preparing → Ready` prep track, does an out-of-window attempt ever become an Order at all, or is it stopped before one exists?
- **Configuration surface.** Where do the store's hours live and who edits them — a config table the dispatcher can update, or a static value for MVP? No admin/settings surface exists yet anywhere in the map; this may be the ticket that introduces one.
- **Edge behaviour.** A cutoff buffer near close (e.g. no new orders in the last N minutes so prep/dispatch isn't left holding a last-minute Order at closing), and what a customer mid-checkout when the window closes experiences.

Deliver: the exact rule the customer app and (if needed) backend enforce, where the config lives, and whether this needs a new domain concept or is a pure gate in front of Order submission.

## Answer

- **Shape:** per-day-of-week `store_hours` (open/close per weekday) plus a `store_closures` table for one-off holiday/exception dates.
- **Enforcement:** customer-app UI gate (disables checkout, shows reopen time) backed by a server-side guard at Order-submission time, validated against server clock — never trusts client state. No separate per-order override; dispatch controls availability purely by editing the hours/closures data.
- **Customer experience outside the window:** browsing and cart always allowed; blocked only at checkout/submission. No deferred/queued fulfilment — an Order simply doesn't get created outside the window.
- **Config surface:** new custom settings UI in the dispatcher console for editing `store_hours` and `store_closures` — this is the ticket that introduces the first admin/settings surface in the app.
- **Last-call buffer:** a configurable, global 15-minute buffer before posted close (`last_order_buffer_minutes` or similar) — effective cutoff is close time minus 15 min.
- **Mid-checkout edge case:** hard re-validation at submit time — a customer mid-checkout when the cutoff passes gets a clear rejection, no grace period.
- **Domain impact:** this is a pure gate in front of Order submission, not a new domain concept — no change to the `Received → Preparing → Ready` prep track or courier-status lifecycle.

### Amendment — [ticket 34](34-driver-shift-and-availability-model.md)

**Values set, and the meaning of `store_hours` clarified. No mechanism changes.**

The business owner's cutoff strategy turned out to be exactly this ticket's machinery: drivers finish
at **16:00**, and orders should stop ~30 minutes earlier so the last one can still go out. So
`store_hours` closes at **16:00** and `last_order_buffer_minutes` is **30** (was 15), yielding a 15:30
effective cutoff. Nothing new is built.

**Naming clarification, now load-bearing:** `store_hours` means the **delivery *ordering* window**,
bounded by **driver availability** — *not* the shop's trading hours. The physical meat counter is very
likely open past 16:00 for walk-in customers, and none of that belongs in this field. Recorded because
the field name invites exactly the wrong reading, and the two numbers now diverge for a real reason.

**Open, and not this ticket's to answer:** the owner also stated that **orders can be placed a day
before**. Everything above governs **same-day** delivery only. What a cutoff means for an order placed
in advance — and whether an Order needs a requested delivery date at all — is
[ticket 42](42-advance-ordering-and-delivery-date.md).
