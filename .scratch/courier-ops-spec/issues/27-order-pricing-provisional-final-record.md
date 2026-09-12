# Order pricing model: provisional → final packed-weight record

Type: grilling
Status: resolved
Blocked by: 26
Map: ../map.md

## Question

`CONTEXT.md` currently defines an **Order** as "the items chosen and their price," implicitly treating price as fixed from submission. The user's confirmed catalog decision breaks that: by-weight Products (ticket 26's `price_type`) can't have a final price until the item is physically packed. This ticket settles the **Order pricing record** — the load-bearing schema that ticket 20's "settlement-ready Order model" guardrail points at.

Charting framing (confirmed during graduation): the Order total is **provisional at submission → final when packed** (during the `Preparing` prep state), and **no money moves** (payments stay Out-of-scope). Resolve with `/grilling` and `/domain-modeling`:

- **Line-item shape.** What does an Order line item store? At minimum: a reference to the Product (stable id from ticket 26), the price_type snapshot, the unit price or per-kg rate **captured at submission** (so a later catalog edit doesn't rewrite the Order), the estimated quantity/weight, and the provisional line total.
- **Provisional total at submission.** For per-unit items the line total is exact; for by-weight items it's `estimated_weight × captured_rate`. Confirm the Order's submission-time total is the sum, and that this is what the customer sees at checkout (ticket 29).
- **Final total at packing.** When a by-weight item is packed, the actual weight sets the final line total. What records the packed weight, and when (a dispatcher/prep action during `Preparing`)? The record stores **provisional total, final total, and delta** per line and per Order — this is the settlement-ready shape.
- **The settlement boundary.** Storing provisional/final/delta is in-scope (ticket 20's guardrail); *acting* on the delta — charging, refunding, any money movement — is Out-of-scope. Draw this line explicitly in the answer so ticket 28's approval flow and any future payments track inherit it cleanly.
- **Immutability & audit.** Once final, is the record frozen? Can a dispatcher correct a mis-keyed weight, and does that leave an audit trail?

**Domain-modeling impact:** amends the **Order** definition in `CONTEXT.md` (price is provisional-then-final, not fixed at submission). This is a strong **ADR candidate** — the provisional/final/delta record is hard to reverse (it's in the Order schema), surprising to a future reader, and a real trade-off against the simpler immutable-Order model. Offer an ADR under `docs/adr/` on resolution if the three tests hold.

Deliver: the Order line-item and total schema (provisional/final/delta), where and when the final weight is captured, the explicit settlement boundary, and the amended `CONTEXT.md` (+ ADR if warranted).

## Answer

An Order's price is **provisional at submission → final at packing**. The record lives on the **line item**, with **uniform totals and discriminated inputs**. ADR written: `docs/adr/0004-provisional-then-final-order-pricing.md`.

**Currency (new standing fact, added to the map's Notes):** the business operates in the **Philippines**. All money is **Philippine pesos**, stored as whole **centavos** (₱1 = 100). Weights are grams/kilograms.

### Line-item schema

Every line item, regardless of `price_type`:

| Field | Notes |
|---|---|
| `product_id` | Reference to the Product. Never read for pricing (ADR 0003). |
| `product_name` | Snapshot at submission. |
| `price_type` | Snapshot: `per_unit` \| `per_weight`. |
| `provisional_total` | Centavos. Agreed at submission. Never changes. |
| `final_total` | Centavos. Set at packing. |
| `money_delta` | `final_total − provisional_total`. Signed. |

`per_unit` variant adds `unit_price` (centavos, captured) + `quantity` (count).

`per_weight` variant adds `price_per_kg` (centavos per **kilogram**, captured), `estimated_weight_grams` (what the customer asked for — never changes), `tolerance_grams` (captured from the Product), `packed_weight_grams` (null until packed), `weight_delta_grams` (`packed − estimated`, signed).

**Uniform totals, discriminated inputs** was the load-bearing choice. A `per_unit` line gets `final_total = provisional_total` and `money_delta = 0` **at submission** — a packed item can't change. So only line-total *computation* branches on `price_type`; every consumer (Order totals, ticket 28's approval, any future settlement) reads one shape. Rejected: putting the triple only on by-weight lines (forces every consumer to branch), and putting it only on the Order (loses which item drove the delta — exactly what ticket 28 must show the customer).

### Order-level

`delivery_fee` (centavos, captured at submission, **never moves**) is the only new Order field. **Flat rate for MVP**, set on ticket 22's settings surface; a distance-based fee later writes the same field using ticket 23's road distance — additive, no shape change (ticket 20's forward-compatible-subset guardrail).

The four totals — goods provisional, goods final, grand provisional, grand final — are **derived by summing line items**, not stored. Line items freeze at `Picked up`, so the sums are stable.

The fee sits **beside** the goods totals, not inside them, so `money_delta` means one thing: how much the meat moved.

### Calculation & rounding

- `per_unit`: `unit_price × quantity`.
- `per_weight`: `price_per_kg × grams ÷ 1000`, rounded to the nearest centavo **once, at the end**.
- Rates are **never** converted to per-gram. ₱450/kg → 0.45 centavo/g doesn't divide cleanly for most rates; converting would either lose money on every line or break the integer-centavo rule.

### Where and when the packed weight is captured

The **dispatcher** types `packed_weight_grams` per per-weight line in the dispatcher console during prep status `Preparing`. No new actor — `CONTEXT.md` already has the dispatcher marking staff as packing.

**New lifecycle constraint:** prep status **cannot advance to `Ready`** until every per-weight line has a packed weight. `Ready` therefore means *packed **and** priced*. This is the first data precondition on a prep transition, and it's the firm hook ticket 28's gate needs. It does **not** couple the prep and courier tracks — that coupling stays ticket 28's to make.

### Immutability & audit

- A packed weight is **correctable until courier status `Picked up`**; then the whole pricing record **freezes**. The boundary is a physical fact (the goods left the shop), not an administrative one.
- **Prep status stays one-directional** — rejected the alternative of un-readying back to `Preparing` to correct, which would have made prep status non-monotonic and forced every screen reading it to expect backward moves.
- **Correction log**: the first weight typed writes no history; every *later* change appends one row (line, person, time, old weight, new weight). Most Orders write zero rows. It exists to answer one question: "the customer agreed a price — why is the record now different?" Rejected a full pricing event store (machinery nobody asked for) and rejected storing nothing (the ticket-10 precedent, but that trade-off is acceptable for location and not for money that a customer approved).

### Weight tolerance (user-settled; **amends ticket 26**)

The user settled the tolerance rule during this session, stating the principle: **the burden is on the shop** — whoever packs must try hard to match the ordered weight.

- **`tolerance_grams`, per Product**, dispatcher-set, **default 250 g**. Added to ticket 26's Product schema as an amendment.
- **Absolute grams, not a percentage of money.** Weight is what the packer controls at the scale.
- **Symmetric** — a shortfall obliges contact exactly as an excess does. This is the decisive argument against a money-based band, which would let a 1 kg-ordered/700 g-packed failure pass silently.
- **Per line item**, against that line's own estimate; two lines each 200 g over do not combine.
- **Strictly greater than** the tolerance triggers contact; exactly the tolerance passes.
- Captured onto the line at submission (ADR 0003's logic — it's part of what was agreed).

The **flow** this triggers ("the store must contact the customer to confirm they will proceed") is ticket 28's, recorded there as a settled input.

### The settlement boundary

**In scope, done here:** record the provisional price, the final price, both deltas; keep them correct; freeze them at `Picked up`.

**Out of scope, unchanged:** charging, refunding, or any money movement on a delta. **No field on this record states whether anything was paid** — a future payments track adds its own, it doesn't borrow these.

Ticket 28 inherits a *conversation and a lifecycle constraint*, not a charge. Ticket 29 inherits the provisional total as the cart/checkout figure.

### Worked example

```
Order 4821
  Ribeye      ₱850/kg  est 1,000 g  tol 250 g  packed 1,140 g
              weight delta  +140 g  (within)   ₱850.00 → ₱969.00   +₱119.00
  Pork belly  ₱450/kg  est   500 g  tol 200 g  packed   520 g
              weight delta   +20 g  (within)   ₱225.00 → ₱234.00     +₱9.00
  Sausages    ₱240 each × 2         (per-unit) ₱480.00 → ₱480.00      ₱0.00

  goods provisional ₱1,555.00 │ goods final ₱1,683.00 │ money delta +₱128.00
  delivery fee         ₱50.00
  grand provisional ₱1,605.00 │ grand final ₱1,733.00
```

### Domain-modeling impact — done

- **`CONTEXT.md`**: **Order** amended (price is provisional-then-final, not fixed at submission). **Product** amended (per-Product weight tolerance). Prep-status section amended (`Ready` = packed *and* priced). New terms: **Line item**, **Provisional price**, **Final price**, **Packed weight**, **Weight tolerance**, **Delivery fee**.
- **ADR**: `docs/adr/0004-provisional-then-final-order-pricing.md` — passes all three tests. Hard to reverse (it's the Order schema and the `Ready` gate); surprising (a future reader asks why a line carries two totals); a real trade-off against the fixed-price Order the shop runs on today.
- **Ticket 26** amended with `tolerance_grams`; **ticket 28** given the settled tolerance rule and an inherited-facts block.

Status: resolved.
