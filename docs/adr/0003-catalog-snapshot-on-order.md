---
status: accepted
---

# Orders snapshot catalog and address data instead of referencing live records

_(Filename kept as `0003-catalog-snapshot-on-order.md`; the address extension below was added by ticket 33 and is the same decision applied to a second entity.)_

A **Product** in the catalog is a single, editable row ("current truth"). When a customer submits an Order, each Order line item **copies** the Product's name, `price_type`, and price (`unit_price`, or `price_per_kg` + `weight_step_grams`) as they stand at submission. Historical Orders read from that copy, never from the live Product — so a later catalog edit (price change, rename, availability toggle, even soft-delete) can never rewrite what a customer already agreed to.

The rejected alternative was **catalog versioning**: make Product rows immutable, spawn a new version on every edit, and have Order line items point at the specific version they were placed against.

Both models protect placed Orders from later edits. Snapshotting was chosen because:

- **The snapshot is load-bearing for pricing anyway.** By-weight Products can't have a final price until physically packed, so ticket 27's Order line item *must* carry its own captured rate (provisional at submission, final at packing) regardless of this decision. The captured rate is a snapshot by another name — versioning would add a parallel mechanism alongside a copy the line item already holds.
- **It keeps catalog and order ledger as independent aggregates.** The Product stays a single mutable row the dispatcher edits freely; the Order is a self-contained record of what was agreed. Neither has to reason about the other's history.
- **Less to own.** No version table, no "which version was current on this date" queries, no cascade of version rows behind each edit. A stable `id` plus copied fields on the line item is the whole mechanism.

## Rejected alternatives

- **Immutable Product versions.** Every edit creates a new row; line items reference a version id. Gives a full audit of the catalog's own evolution — which nothing in this effort requires — at the cost of a growing version table and version-aware catalog queries. Rejected as machinery for an unrequested capability.
- **Live reference with no snapshot.** Line items point at the mutable Product and render its current fields. Simplest to write, but a price edit would silently rewrite historical Orders and a settlement record — unacceptable for a settlement-ready Order model (ticket 20's guardrail).

## Consequences

- Order line items keep a `product_id` **reference in addition to** the snapshot — for "buy again", analytics, and linking back to the current listing. Because that reference can outlive the Product, the Product is **soft-deleted** (`deleted_at`), not hard-deleted, so the pointer never dangles.
- The snapshot fixes *price* at submission for per-unit items; for by-weight items the snapshot fixes the *rate*, and the final line total is set at packing (ticket 27). "Agreed" means agreed-at-submission — an in-flight cart holding a since-changed Product is re-quoted fresh at checkout (ticket 29), never silently.
- The catalog carries no history of its own. If a future need arises to audit past catalog states (e.g. "what did this Product cost last month" independent of any Order), that is a fresh decision — this ADR deliberately stores no such trail.

## Extension: delivery addresses (ticket 33)

The same rule applies to the customer's **delivery address**. An Order copies the whole address at submission — the pin, the written address, unit/floor, landmark note, and the contact name and number — and keeps an `address_id` reference beside it. Historical Orders read the copy, never the live saved Address.

This is deliberately *not* a separate ADR, because the reasoning above transfers wholesale: the customer agreed to these items, at this price, **to this door**, and a later edit must not rewrite any part of that. One argument is genuinely new and worth recording:

- **An in-flight Delivery must not have its destination moved.** The catalog case is about historical accuracy. The address case is also operational — a customer editing "Home" while a driver is en route would otherwise redirect a van mid-run. Snapshotting makes that impossible by construction, so no guard rule is needed and the customer is free to edit or delete a saved Address at any time.

Consequences specific to the address:

- The copy lives **on the Order**, not the Delivery, keeping the destination beside the delivery fee that ticket 27 also put on the Order — what was charged for the trip and where the trip goes are one fact. The 1:1 Delivery reads it across the join.
- Saved Addresses are **soft-deleted** (`deleted_at`), for the same dangling-pointer reason Products are.
- The narrow mutable exception is a dispatcher correcting **non-gating fields on one Order's copy** (contact name/phone, landmark note, unit/floor) when a driver can't find the door — never the pin, never the saved record. Editing the pin would silently reopen ticket 23's delivery-radius gate on an already-accepted Order, which `docs/adr/0005-packed-weight-price-approval-gate.md` and ticket 28's post-submission-editing boundary rule out. A genuinely wrong pin is a cancel and a fresh Order.
