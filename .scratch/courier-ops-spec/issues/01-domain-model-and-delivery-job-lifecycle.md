# Domain model and delivery job lifecycle

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

What are the core entities of this domain, what is each one called, and what states does a delivery job move through from creation to completion?

Settle at minimum:

- The entity naming — is the central noun a Job, a Delivery, an Order, or a Consignment? Pick one term and hold it; the whole spec, API, and three UIs inherit it.
- The full state machine: which states exist, which transitions are legal, and who or what triggers each one (dispatcher action, driver action, system event).
- Where the boundaries of a job sit: does it start at booking or at assignment, and does "delivered" end it or is there a settled/closed state after.
- Which states the customer sees, and whether that's the same vocabulary the dispatcher and driver see. Internal and customer-facing state names are frequently different on purpose.
- The relationship between a job, a driver, and a customer, given manual dispatch with one active job per driver — what enforces that constraint, and what happens to a job when a driver becomes unavailable mid-run.

Record the settled vocabulary in a root `CONTEXT.md` via `/domain-modeling`. This ticket is the vocabulary source for every later ticket, so drift here is expensive.

## Answer

Two entities, not one: **Order** (the commercial transaction — items, price, placed by the customer) and **Delivery** (the courier-side unit — a driver carrying one Order from pickup to drop-off). A Delivery exists from the moment its Order is submitted, before any driver is assigned.

A Delivery tracks two independent statuses, not one flat state machine:
- **Prep status**: `Received → Preparing → Ready`, dispatcher-controlled, describes whether the physical order is packed.
- **Courier status**: `Unassigned → Assigned → Picked up → Delivered → (Disputed) → Closed`, with `Cancelled` reachable from `Unassigned` (customer or dispatcher) or `Assigned`/`Picked up` (dispatcher only), never after `Delivered`.

Assignment and prep advance independently — a dispatcher can assign a driver before prep finishes. Customer-facing labels are derived from both tracks combined (e.g. `Picked up` always shows as "on its way," regardless of prep status).

Two scope items were reopened during this ticket and folded back into `map.md`: customer order-taking (item selection/cart), and multi-stop dispatch — a driver may now hold several Deliveries in `Picked up` at once, picking the next by straight-line distance (see `docs/adr/0001-multi-stop-dispatch.md`). Deliberately deferred, not designed: the product-quality dispute/review-window flow, and what happens when a driver goes unavailable mid-run.

Full vocabulary lives in root `CONTEXT.md`.
