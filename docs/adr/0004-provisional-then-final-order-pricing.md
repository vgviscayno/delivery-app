---
status: accepted
---

# An Order's price is provisional at submission and final at packing

Per-weight Products (ribeye at a rate per kilogram, cut to order) cannot be priced exactly until staff physically pack them, so an Order's price cannot be fixed at submission. Every Order line item therefore carries **three** money fields — `provisional_total` (agreed at submission), `final_total` (set when packed), and `money_delta` (the difference) — and per-weight lines additionally carry `estimated_weight_grams`, `packed_weight_grams` and `weight_delta_grams`. The record is written and kept; **no money moves on the delta** in this version.

The rejected alternative was the **fixed-price Order**: quote the estimate at submission, treat it as the price, and settle any difference outside the system (cash at the door, a note in a ledger, a verbal correction). That is how the shop works today without software.

Provisional-then-final was chosen because:

- **The difference is not incidental.** A 1 kg ribeye order that packs at 1.35 kg is a 35% price change on that line. A model that hides it inside "the estimate" would misreport what the customer owes on a large share of Orders.
- **The shape is the settlement-ready Order model** that the MVP scope guardrail requires (map ticket 20). A future payments track needs to know what was agreed, what was actually supplied, and the gap — and needs it recorded at the time, not reconstructed afterwards.
- **A shortfall must be visible too.** The delta is signed. Packing 700 g against a 1 kg estimate is a service failure even though the customer pays less; a fixed-price model would show nothing wrong.

## Consequences

- **Uniform totals, discriminated inputs.** All line items carry the same three money fields — a per-unit line simply has `final_total == provisional_total` and a zero delta, set at submission. Only the *inputs* follow ticket 26's `price_type` union (`unit_price` + `quantity` versus `price_per_kg` + weights). So only the code that computes a line total branches on price type; everything downstream reads one shape.
- **`Ready` gains a data precondition.** Prep status cannot advance to `Ready` until every per-weight line has a packed weight. `Ready` consequently means "packed *and* priced" — the firm hook the packed-weight approval flow needs.
- **The record freezes on a physical fact.** A packed weight stays correctable until the courier status becomes `Picked up`; once the goods leave the shop nothing can change. Prep status stays one-directional — there is no un-ready step.
- **Corrections leave a trail.** The first weight typed writes no history; every later change appends one row (line, person, time, old weight, new weight). Most Orders write no rows. This exists so that a weight changed *after* a customer approved a price is not silent.
- **The tolerance is captured, not referenced.** Each per-weight line copies the Product's `tolerance_grams` at submission, for the same reason it copies the rate (see `0003-catalog-snapshot-on-order.md`) — the tolerance is part of what the customer agreed to, and a later catalog edit must not move it.
- **Money is exact.** All amounts are whole centavos (₱1 = 100 centavos). A per-weight line total is `price_per_kg × grams ÷ 1000`, rounded to the nearest centavo **once**, at the end. Rates are never converted to a per-gram figure, which would not divide cleanly and would lose money on every line.
- **The delivery fee sits outside the machinery.** It is captured on the Order at submission and never moves, so it is stored beside the goods totals rather than inside them — keeping the delta a statement about the meat alone. It is a flat amount today; a distance-based fee later writes the same field and changes no shape.
- **Order-level totals are derived, not stored.** They are sums over line items, which are themselves frozen at `Picked up`.

## The settlement boundary

This decision covers **recording** only: the provisional price, the final price, both deltas, and freezing them at the right moment. Charging, refunding, or any movement of money on a delta remains out of scope, and no field on this record states whether anything was paid. The approval flow that a large delta triggers is a separate decision (map ticket 28); it reads this record and does not extend it.
