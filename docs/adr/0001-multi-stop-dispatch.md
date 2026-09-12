---
status: accepted
---

# Multi-stop dispatch allowed per driver

The original map scoped out "route optimisation and multi-stop runs," assuming a driver carries exactly one Delivery at a time. Reopened during ticket 01: a driver can hold several Deliveries in `Picked up` simultaneously, choosing which to drop off next themselves — the app shows straight-line distance from the driver's current position to each held Delivery's drop-off, not a computed route or ETA. No stop-sequencing algorithm, no capacity limit, and no routing engine are introduced by this decision; ETA prediction and route optimisation remain out of scope. This only removes the "one active Delivery per driver" constraint at the assignment level — each Delivery's own lifecycle (`Unassigned → Assigned → Picked up → Delivered`) is unaffected.

Still open, not resolved by this ADR: proof-of-delivery capture while other Deliveries remain in transit, any van capacity limit, and what the customer tracking screen shows when their Delivery isn't the driver's next stop.
