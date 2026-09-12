# Courier Ops

Own-fleet meat/processed-meat delivery business: customers order items in a customer app, a dispatcher assigns a driver to carry the order to the customer, and the customer tracks the run live. Not a marketplace, not a restaurant (no kitchen prep pipeline).

## Language

**Order**:
A customer's commercial transaction: the items chosen and their price. Exists from the moment a customer submits it, independent of whether a driver has been assigned yet. Its price is not fixed at submission — it is provisional then final (see below), because a per-weight item can only be priced once it is physically packed.
_Avoid_: Purchase, cart (cart is pre-submission; once submitted it's an Order)

**Line item**:
One Product on an Order, with the quantity or estimated weight the customer chose. Carries its own copy of the Product's name, price type and rate as they stood at submission, so later catalog edits never rewrite it.
_Avoid_: Order item, order line, product (Product is the catalog concept)

**Provisional price**:
An Order's price as agreed at submission — exact for per-unit line items, an estimate for per-weight ones. What the customer sees at checkout and what the shop is held to.
_Avoid_: Estimate, quote, subtotal

**Final price**:
An Order's price once every per-weight line item has been packed and weighed. Set during `Preparing`, frozen when the Delivery reaches `Picked up`.
_Avoid_: Actual price, settled price

**Packed weight**:
The true weight of a per-weight line item, recorded by the dispatcher when staff pack it. Replaces the customer's estimate as the basis for that line's final price.
_Avoid_: Actual weight, real weight

**Weight tolerance**:
The allowance, set per Product by the dispatcher, between a per-weight line item's estimated weight and its packed weight. Symmetric — a shortfall counts the same as an excess. Exceeding it obliges the shop to contact the customer before the Order goes out (see Price approval).
_Avoid_: Margin, variance, threshold

**Excess** / **Shortfall**:
The two directions of a per-weight line item's packed weight against the estimate the customer agreed to. An **excess** is packed heavier (the customer pays more than agreed); a **shortfall** is packed lighter (the customer receives less meat than they planned for, and pays less). They are one signed number, not two concepts — a breach is `abs(weight_delta_grams) > tolerance_grams` — and a shortfall triggers exactly the same obligation as an excess.
_Avoid_: Overage, underage, variance

**Price approval**:
The customer's answer, obtained by a dispatcher over the phone, to a Weight tolerance breach. Recorded per Order as an outcome — not required, pending, approved, or rejected — with the dispatcher, the time, and the exact total approved. While it is pending, the Delivery cannot advance to `Picked up`, whatever its prep status. No money moves; it is consent to a revised price, not a payment.
_Avoid_: Confirmation, authorization (authorization means a card hold, which does not exist here), sign-off

**Removed line item**:
A line item the customer declined during Price approval, because that line breached its Weight tolerance. It stays on the Order, marked removed, and is excluded from every total — it is never deleted, so the Order still records what was originally agreed. Only breaching lines can be removed, and nothing can ever be added to an Order after submission; declining every line is a cancellation.
_Avoid_: Cancelled item, deleted line, partial cancellation

**Delivery fee**:
A charge for the delivery itself, added to an Order alongside the goods. Fixed at submission and never affected by packing.
_Avoid_: Shipping cost, delivery charge

**Delivery**:
The courier-side unit of work: a driver assigned to physically carry one Order from pickup to drop-off. The canonical noun for the dispatcher console, driver app, and customer-tracking screens. Created the moment its Order is submitted (1:1, same lifetime start), even before a driver exists.
_Avoid_: Job, Consignment, Shipment

**Driver**:
An employee of the shop who carries Deliveries, assigned by a dispatcher and never self-selecting work. Holding several Deliveries at once is normal, and there is no cap on how many.
_Avoid_: Courier, rider, partner

**On duty**:
Whether a driver is currently available to be given work — set by the driver at the start and end of their working day, and the window during which their live position is visible to the dispatcher. A present-tense fact only: it is deliberately **not** a timekeeping record, no history of it is kept, and hours worked live in the shop's separate HRIS.
_Avoid_: Shift, clock-in, attendance, roster

**Ordering window**:
The hours during which a customer may submit an Order. Bounded by when drivers are available to deliver, not by when the shop's counter is open to walk-in customers — the two differ.
_Avoid_: Store hours, opening hours, trading hours

**Address**:
A place a customer has saved to receive Orders at. Its authoritative part is a **pin** — a point on the map the customer placed themselves — not the written address, because a street string here often resolves to the wrong building or to nothing at all. The written address, the unit or floor, and the **landmark note** ("green gate beside the sari-sari store") are there to help a human close the last few metres; the pin is what a driver navigates to. Every Address also carries the name and number of the person to call on arrival, who is not necessarily the customer who placed the Order. A customer may keep several, one of which is the default. Deleting one hides it from future Orders but never from past ones.
_Avoid_: Location (means a driver's live position elsewhere in this system), destination, drop-off point

**Delivery address**:
The Address an Order is going to, copied onto the Order at submission the same way a Product's name and price are (see `docs/adr/0003-catalog-snapshot-on-order.md`). Once copied it never changes: editing or deleting the saved Address leaves every placed Order pointing where it was actually sent, and an in-flight Delivery can never have its destination moved out from under the driver. The one exception is deliberately narrow — a dispatcher may correct the *contact details and landmark note* on a single Order's copy when a driver can't find the door, never the pin.
_Avoid_: Shipping address, delivery location

**Product**:
A catalog item a customer can choose. Dispatcher-maintained data (not code), rendered read-only in the customer app. Priced one of two ways via `price_type`: **per-unit** (a packaged item, e.g. a 500g pack of sausages) or **per-weight** (cut-to-order, e.g. ribeye at a per-kg rate, ordered by an estimated weight in per-Product step increments, with a per-Product weight tolerance). A Product has a stable identity; when an Order references it, the Order snapshots the Product's name and price so later catalog edits never rewrite placed Orders. Availability is a manual toggle, not a stock count.
_Avoid_: Item (unqualified — say Product for the catalog concept, "line item" for the thing on an Order), SKU, Listing

**Category**:
A dispatcher-maintained grouping that customers navigate the catalog by. A Product may belong to several Categories, and its position is set independently within each (see membership below). Categories themselves have a dispatcher-controlled display order.
_Avoid_: Department, Section, Tag

**Product–Category membership**:
The many-to-many link between a Product and a Category. Carries the Product's display position *within that Category*, so a Product in two Categories can rank differently in each.

### Delivery lifecycle

A Delivery tracks two independent statuses that advance on their own schedules:

**Prep status** — is the order physically ready:
`Received` (Order just submitted) → `Preparing` (dispatcher has marked staff as packing it) → `Ready` (packed, waiting for a driver to collect).

`Ready` means packed *and* priced: an Order cannot reach it until every per-weight line item has a packed weight, so an Order at `Ready` always has a final price.

**Courier status** — where the Delivery sits with a driver:
`Unassigned` (no driver yet) → `Assigned` (dispatcher picked a driver, who may still be en route to pickup) → `Picked up` (driver has the product) → `Delivered` → optionally `Disputed` (customer flags a product-quality problem within a review window) → `Closed`. `Cancelled` is reachable from `Unassigned` (customer or dispatcher) or `Assigned`/`Picked up` (dispatcher only) — not after `Delivered`.

A dispatcher can assign a driver at any prep status, including `Received` — assignment and prep are independent tracks.

**The one rule that couples them:** a Delivery cannot advance to `Picked up` while its Order's Price approval is pending. The tracks otherwise still run on their own schedules — a driver can be `Assigned` and waiting in the shop for an Order that is packed, priced, and held. See `docs/adr/0005-packed-weight-price-approval-gate.md`.

**Customer-facing labels** are derived from both tracks, not a single stored field — e.g. `Picked up` always shows as "on its way to you" regardless of prep status, since being picked up implies it was ready. See `docs/adr/0001-multi-stop-dispatch.md` for how multiple Deliveries interact on one driver.
