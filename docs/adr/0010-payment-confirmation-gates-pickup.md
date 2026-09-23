---
status: accepted
---

# A packed Order leaves the shop only after a dispatcher records that it was paid

The shop takes no cash and dispatches nothing unpaid. Customers pay by bank transfer or GCash through QR Ph, and the driver never handles money (business owner, 2026-09-23, via map ticket [How the shop gets paid, and its exposure on packed goods](https://github.com/vgviscayno/delivery-app/issues/47)). Because an Order's price is only final once it is packed (ADR 0004), the customer pays **after packing and before dispatch**: the Final price plus the Delivery fee. A dispatcher who sees the money arrive in the shop's account records a **Payment confirmation**, and the Delivery cannot advance to `Picked up` until one exists. No money moves through the system. The record is a person's assertion that it moved elsewhere, in the same way that Price approval records consent and not a charge.

## Considered options

**Recording nothing** was rejected. The dispatcher would simply withhold the bag until the bank app showed the money, and the owner's rule would live only in their head. But then the driver cannot tell that what they carry is paid, a paid Order that is later cancelled looks the same as an unpaid one, and a second dispatcher, whom ticket 37 requires the write path to allow for, would have nothing to go on.

**Paying at submission, against the Provisional price** was rejected. Every per-weight line would leave a difference to settle after packing, as a top-up for an excess or a partial refund for a shortfall. That would build money handling into the delta that ADR 0004 only records. It would also turn ticket 42's morning cut-off, which cancels an advance Order whose customer cannot be reached, into a refund each time.

**Paying at the door** was briefly chosen and then withdrawn. It contradicts both of the owner's answers ("no dispatch without payment"; a refusal cannot happen "because it's already paid"). It would also have moved the gate to `Delivered`, left a driver at a door waiting on the console, and turned refusal at the door into a real loss of stock.

**An automatic confirmation** from a GCash or bank webhook was rejected as payment integration, which remains out of scope.

## Consequences

- **This is the third rule coupling the prep and courier tracks**, and it holds the same transition as ADR 0005: `Ready → Picked up`. The amount due is only knowable once the Order is at `Ready` with no Price approval pending, so a customer is asked to pay only then.
- **The record** holds the amount received, the payer's reference number, an optional method (GCash or bank), the dispatcher, and the time. It means *paid in full*. An underpayment is not confirmed, and the dispatcher rings the Account phone.
- **A weight corrected after payment voids the confirmation**, following ADR 0005's rule for approvals. The Order goes back to awaiting payment for the difference, or shows a refund owed if the customer overpaid. The Final price still freezes at `Picked up`, not at payment, so a known-wrong weight is never locked in.
- **The customer is told to pay by a third push event**, "your order is packed: ₱X due". The app shows the amount, worked out on the server, beside the shop's static QR Ph image, which is a shop setting kept alongside the Shop phone and Delivery fee. ADR 0005 refused a third push because the customer could do nothing with it. This one asks them to do something. Ticket 12's pipeline still has no retries, and the backstop is the console's **Awaiting payment** section.
- **There is no payment timeout**, for ADR 0005's reason: destroying an Order of cut meat on a timer has no human behind it. A dispatcher rings the customer and, if necessary, cancels.
- **Nothing is checked at the door.** The owner suggested the driver check a payment reference before handing over the goods. The gate already guarantees that every Order in a van is paid, so a check at the door would verify nothing new. The driver's job card shows "Paid" and the reference number instead.
- **Refusal at the door needs no new concept.** The driver phones the shop, and the dispatcher cancels from `Picked up` with a Cancellation cause. The telephone is the recovery channel, as in ADR 0006.
- **A customer cannot cancel in the app once paid.** Cancellation from `Unassigned` is withdrawn once a Payment confirmation exists, and the customer rings the Shop phone. As a result, every refund comes from a conversation.
- **A paid, cancelled Order shows "Refund owed"**, derived from the two facts with nothing stored. Sending the refund is payment execution and stays out of scope. How refunds and replacements are tracked belongs with product-quality disputes.
- **Ticket 42's cut-off is confirmed safe.** An Order still awaiting Time confirmation has not reached `Preparing`, so nothing has been cut and nothing paid.
