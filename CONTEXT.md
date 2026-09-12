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
An Order's price once every per-weight line item has been packed and weighed. Set during `Preparing`, frozen when the Delivery first reaches `Picked up` — and never unfrozen, not even by a Handback. An Order has exactly one Final price. Goods that have to be packed again are a cancellation and a new Order, not a re-pricing.
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
The customer's answer, obtained by a dispatcher over the phone, to something about their Order changing after they agreed to it — a Weight tolerance breach found at packing, or, on an Order placed for a future day, a Product whose price the dispatcher raised or whose availability they withdrew before packing began. The trigger is always a **recorded, objective** change to a named line, never a dispatcher's preference. The call always goes to the customer's Account phone, never to the Arrival contact — consent to a revised price can only come from the person who placed the Order. Recorded per Order as an outcome — not required, pending, approved, or rejected — with the dispatcher, the time, the exact total approved, and the number actually dialled. While it is pending, the Delivery cannot advance to `Picked up`, whatever its prep status. No money moves; it is consent to a revised price, not a payment.
_Avoid_: Confirmation, authorization (authorization means a card hold, which does not exist here), sign-off

**Removed line item**:
A line item the customer declined during Price approval, because something recorded about that line changed after they agreed to it — it breached its Weight tolerance, or its Product was re-priced or made unavailable while the Order waited for a future delivery day. It stays on the Order, marked removed, and is excluded from every total — it is never deleted, so the Order still records what was originally agreed. Only **affected** lines can be removed, and nothing can ever be added to an Order after submission; declining every line is a cancellation.
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

**Handback**:
A dispatcher's record that a driver no longer holds the goods for a Delivery that was already `Picked up`. It returns the Delivery to `Unassigned` so it can be assigned again — possibly to the same driver. It is a record of something a person did, not an instruction: the meat physically came back to the shop, or passed from one driver to the other at the roadside. Always carries a Cancellation cause. The Order itself is untouched — same line items, same Final price.
_Avoid_: Return, unassign (unassign is the ordinary act of clearing a driver who never picked up), transfer, reassignment (reassignment is what happens *after* a Handback)

**Cancellation cause**:
Why a Delivery was handed back or cancelled after a driver was involved: the customer cancelled, the goods were not fit to deliver, the driver could not complete, or something else. Chosen from that fixed list, with free text alongside. Required on every Handback and on every `Cancelled` reached from `Assigned` or `Picked up`. Because no location history is kept, this is usually the only surviving record of what happened.
_Avoid_: Reason code, cancellation reason (it covers handbacks too, which are not cancellations)

**On duty**:
Whether a driver is currently available to be given work — set by the driver at the start and end of their working day, and the window during which their live position is visible to the dispatcher. A present-tense fact only: it is deliberately **not** a timekeeping record, no history of it is kept, and hours worked live in the shop's separate HRIS.
_Avoid_: Shift, clock-in, attendance, roster

**Ordering window**:
The days and hours during which the shop delivers, and therefore the set of Requested delivery times a customer may choose from. Bounded by when drivers are available to deliver, not by when the shop's counter is open to walk-in customers — the two differ. It is deliberately **not** a limit on when an Order may be submitted: a customer may submit at any hour of any day, because an Order may be for a future day. What the window constrains is the choice of *when it arrives*, never the act of ordering.
_Avoid_: Store hours, opening hours, trading hours

**Same-day cutoff**:
The last moment at which today may still be chosen as an Order's delivery day. Set against the drivers' finish, not the shop's: past it, today simply stops being offered and the next delivery day becomes the earliest choice. It bounds the delivery day only — an Order placed after it is accepted normally, for a later day.
_Avoid_: Last call, closing time, order deadline

**Requested delivery time**:
When the customer asks for their Order to arrive: either **ASAP** (no time asked for — the default, and what most Orders carry) or a **30-minute window** they choose from the Ordering window, e.g. 14:30–15:00. It is a request, never a commitment: nothing is promised until a dispatcher answers it (see Time confirmation). The system makes no promise of its own at submission, and refuses nothing — it has no notion of how much a day can hold.
_Avoid_: Slot (implies a fixed grid the shop divides its day into, which does not exist), delivery window, time slot, scheduled time

**Time confirmation**:
The shop's answer, given by a dispatcher over the phone, to a Requested delivery time — the counterpart of Price approval, and recorded the same way: an outcome per Order, with the dispatcher, the time, and both the time requested and the time confirmed, so a request that was met and one that was renegotiated are told apart. Three outcomes: **not required** (the customer chose ASAP — nothing to answer), **pending**, and **confirmed** (whether the shop agreed the original time or the customer accepted an alternative). There is deliberately no "could not do it" outcome: an Order the shop and customer cannot agree a time for is cancelled, and Cancellation cause already records why. While it is pending, the Delivery cannot advance to `Preparing`. The promise is a person's, made once with the whole day in view — the system never makes one.
_Avoid_: Slot confirmation, booking, scheduling, ETA (an ETA is predicted and continuously wrong; this is asserted once by a human)

**Address**:
A place a customer has saved to receive Orders at. Its authoritative part is a **pin** — a point on the map the customer placed themselves — not the written address, because a street string here often resolves to the wrong building or to nothing at all. The written address, the unit or floor, and the **landmark note** ("green gate beside the sari-sari store") are there to help a human close the last few metres; the pin is what a driver navigates to. Every Address also carries an **Arrival contact** (see below), who is not necessarily the customer who placed the Order. A customer may keep several, one of which is the default. Deleting one hides it from future Orders but never from past ones.
_Avoid_: Location (means a driver's live position elsewhere in this system), destination, drop-off point

**Account phone**:
The phone number of the customer who placed an Order, held on their account and required to open one. The number a dispatcher rings for a Price approval, and the only number a customer's consent to a revised price may be taken on. Contact data only: it is never a way to sign in, is never verified by SMS, and a dispatcher can read it but never change it — editing it would let the shop choose whose "yes" is recorded. The current number is always the one dialled; unlike a Delivery address, it is never copied onto an Order.
_Avoid_: Mobile number, contact number (ambiguous — an Order has two), phone (unqualified)

**Arrival contact**:
The name and number on an Address of whoever should be called at that door — a mother, a helper, an office receptionist — which is often not the customer who placed the Order. The driver's number, for reaching the delivery. Never carries a commercial decision: it may be rung about a missing gate or a late van, never about money.
_Avoid_: Recipient (implies a distinct actor, which this system does not have), contact person

**Shop phone**:
The single number a customer rings to reach the shop, shown in the customer app and maintained by the dispatcher alongside the Ordering window and Delivery fee. The customer-initiated half of every conversation this system pushes onto the telephone rather than into software.
_Avoid_: Support line, hotline, customer service number

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

`Picked up` asserts a physical fact: **exactly one driver is holding the goods in a vehicle.** A Delivery therefore cannot be pointed at a different driver while it sits there — the system cannot move meat, only a person can. The one way back out, short of `Delivered` or `Cancelled`, is a Handback, which returns the Delivery to `Unassigned` once a person has actually moved the goods. Prep status is unaffected: the goods are still packed and still priced, so the Delivery stays at `Ready`.

There is no terminal status for a Delivery nobody ever completed. A status needs a rule for entering it, and "nobody knows what happened" has none — only a dispatcher can declare it, and by then they know something. Those end as `Cancelled` with a Cancellation cause.

A dispatcher can assign a driver at any prep status, including `Received` — assignment and prep are independent tracks.

**The two rules that couple them**, both of which hold a transition open until a dispatcher has spoken to the customer on the telephone:

1. A Delivery cannot advance to `Picked up` while its Order's Price approval is pending. See `docs/adr/0005-packed-weight-price-approval-gate.md`.
2. An Order cannot advance to `Preparing` while its Time confirmation is pending. See `docs/adr/0007-time-confirmation-gates-preparation.md`.

They gate opposite ends of the same journey, and for the same reason in each case: the step ahead is hard to undo. Packing is a cancellation away from being reversed — goods that must be packed again are a new Order — so the shop does not cut meat for a delivery time it has not agreed. Picking up puts the goods in a van, so the shop does not send out an Order at a price the customer has not agreed.

The tracks otherwise still run on their own schedules — a driver can be `Assigned` and waiting in the shop for an Order that is packed, priced, and held.

An Order placed for a future delivery day sits at `Received`/`Unassigned` until that day arrives. This is **not** a status: nothing is stored, and no transition happens. Both the dispatcher's queue and the customer's Orders list simply compare the delivery day to today, which is why the two can never disagree about whether an Order is live.

**Customer-facing labels** are derived from both tracks, not a single stored field — e.g. `Picked up` always shows as "on its way to you" regardless of prep status, since being picked up implies it was ready. See `docs/adr/0001-multi-stop-dispatch.md` for how multiple Deliveries interact on one driver.
