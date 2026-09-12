# Advance ordering and the requested delivery date

Type: grilling
Status: open
Blocked by: —
Map: ../map.md

## Question

Surfaced by [ticket 34](34-driver-shift-and-availability-model.md), not resolved there. Asked whether
the shop's 06:00–08:00 preparation block implied a next-day model, the business owner answered that
**orders can be placed a day before**.

Nothing in the map accounts for that. Every time-related decision so far assumes an Order is for
*today*:

- **[Ticket 22](22-order-acceptance-time-window.md)** gates submission on whether the shop is open
  **now**, and ticket 34 has just set the cutoff at 15:30 against a 16:00 driver finish. An order
  placed at 17:00 for tomorrow is refused by that gate — correctly under a same-day model, wrongly
  under an advance one.
- **[Ticket 01](01-domain-model-and-delivery-job-lifecycle.md)** creates a Delivery 1:1 with its Order
  at submission, immediately dispatchable. An Order for tomorrow spends a day as an `Unassigned`
  Delivery that must not be assigned yet — and [ticket 15](15-dispatcher-console-layout.md)'s console
  ages unassigned jobs through ok/warn/bad badges, so a legitimately-waiting advance order would sit
  there pulsing red.
- **[Ticket 26](26-product-catalog-domain-model-and-management.md)**'s availability toggle and
  **[ADR 0003](../../../docs/adr/0003-catalog-snapshot-on-order.md)**'s price snapshot both resolve at
  submission. An advance Order snapshots today's price for tomorrow's meat, and an availability toggle
  flipped overnight silently invalidates it.
- **[Ticket 29](29-cart-and-checkout-assembly-flow.md)**'s gate stack runs once, at submission.

Open:

- **Is advance ordering in MVP scope at all?** The owner said orders *can* be placed a day before —
  which may describe how the business already works over the phone rather than a requirement for v1.
  Settle this first; if it is out, the answer is one line on the map's Out of scope section and this
  ticket closes.
- **Does an Order gain a requested delivery date?** A nullable date meaning "today unless stated" is
  the cheap shape; a full scheduling model with time windows is not.
- **What does ticket 22's window gate become?** Plausibly two rules rather than one: *is ordering open
  now* (unchanged) and *is the requested date a day the shop delivers* (new). The 15:30 cutoff then
  applies only to same-day requests.
- **How far ahead?** One day, or arbitrary? A horizon bounds how stale a price snapshot can get.
- **When does an advance Order become dispatchable?** It must not enter the dispatcher's live queue
  before its date, or ticket 15's ageing badges and ticket 01's lifecycle both misreport it.
- **What happens to the price and availability snapshot overnight?** This is the sharpest edge and
  interacts with [ticket 28](28-packed-weight-repricing-approval-flow.md)'s approval flow — which
  already exists precisely to renegotiate a price the shop couldn't know at submission, and may
  absorb this case rather than needing a new mechanism.

**Domain-modeling impact:** likely adds a delivery-date term to `CONTEXT.md` and may warrant an ADR if
the Order lifecycle gains a pre-dispatch waiting state.
