# Driver goes dark: offline assignment, in-flight failure, and dispatcher visibility

Type: grilling
Status: open
Blocked by: 32, 34
Map: ../map.md

## Question

Merges three fog patches that turned out to be one question: the residue of **offline and poor-signal behaviour**, **failure modes for a job in flight**, and **driver-unavailable-mid-run**. Each was deferred pending the lifecycle; all their inputs are now settled.

Already solved, and not to be re-litigated: position queuing survives dead zones (ticket 03's SQLite buffer + replay, force-quit survival); proof-of-delivery survives them too (ticket 11's optimistic close + background photo upload); the customer's tracking screen degrades through a three-tier staleness UI and freezes rather than extrapolates (07, 14).

What remains open:

- **Receiving an assignment while offline.** Ticket 12's push is fire-and-forget with **no retry**, backstopped by "the dispatcher console and the driver's own list" — but a driver in a dead zone gets neither the push nor a list refresh. What does the driver's app do when it reconnects and finds a job assigned twenty minutes ago, possibly since reassigned?
- **What the dispatcher sees while a driver is dark.** Ticket 15 shows a stale state; ticket 07 defines Live/Stale/Lost tiers. Does `Lost` (>3 min) surface as an actionable alert, and does it differ for an `Assigned` driver versus a `Picked up` one carrying goods?
- **Reassignment of an in-flight Delivery.** Phone dies, driver calls in sick, van breaks down. Ticket 12 already sends a reassignment push, so reassignment is assumed to exist — but nothing says what happens to a Delivery at `Picked up`, where a *different* driver now physically lacks the product. Is that a reassignment, a cancellation, or a state the map doesn't have?
- **Abandoned mid-run.** Is there a terminal state distinct from `Cancelled` for "never completed, nobody knows"? Ticket 01's lifecycle has `Cancelled` reachable from `Assigned`/`Picked up` by a dispatcher only — check whether that is sufficient or whether this forces a lifecycle amendment.
- **The one hard constraint to respect:** ticket 10 persists **no location history at all**, so a post-hoc "where did they go" reconstruction is unavailable by design. Any answer that depends on a breadcrumb trail is reopening ticket 10 — say so explicitly rather than assuming it.

**Domain-modeling impact:** may amend ticket 01's courier-status lifecycle in `CONTEXT.md` and warrant an ADR if a new state is added.
