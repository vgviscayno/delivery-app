# Customer order history

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

Surfaced as fog by ticket 29: submission hands the customer straight to ticket 14's live tracking screen and there is **no surface anywhere on this map** for a past or completed Order. Once a Delivery closes, the customer cannot see what they ordered, what it finally cost, or what a Price approval settled on — which matters more here than in a typical shop, because ticket 27/28 mean the price the customer paid attention to at checkout is *not* the price they were charged.

Open:

- **Shape.** A list plus a read-only Order detail? Does the list live as a tab in the customer app, and where does it sit relative to the catalog (30) and the tracking screen (14)?
- **In-flight Orders.** Does an active Order appear in history and reopen ticket 14's tracking screen, or is history strictly terminal? Ticket 29 sends the customer to tracking on submit with **no receipt** — if they background the app, history may be the only way back to a live Delivery.
- **What the detail shows.** Provisional vs. final totals, per-line packed weights and deltas, the delivery fee broken out (27), **removed line items** and the Price approval outcome (28) — the record already exists; this decides how much of it a customer sees. A removed line is never deleted precisely so the Order still records what was agreed; whether the customer sees that, and how it reads, is this ticket's call.
- **Retention interactions.** The proof-of-delivery photo auto-deletes at **30 days** (ticket 11) and is now the only surviving artifact of a delivery. Does the customer ever see that photo, and what does a history entry older than 30 days look like? Ticket 10 keeps no location trail, so there is no route to show.
- **The deferred dispute flow.** Ticket 01 confirmed a customer can report a quality problem within a review window (`Disputed`), and the flow is deferred fog. History is the obvious place a dispute would start — decide whether to leave a deliberate seam or ignore it.

**Domain-modeling impact:** none expected; consumes existing Order/Delivery vocabulary.

## Answer

**An `Orders` tab that is the customer app's spine, not an archive.** It carries every Order the
customer has ever placed — active ones pinned above the fold, terminal ones below — and it is the
only durable record of a transaction whose price moved after the customer stopped looking.

### The navigation shell (settled here, because nothing else on the map ever did)

Tickets 30, 29 and 14 each designed a customer screen; no ticket ever decided how a customer moves
between them. This one does, because "where does history live" is otherwise unanswerable.

**A three-tab bottom bar: `Shop` / `Orders` / `Account`.** Ticket 30's floating cart button stays
the only route into the cart — cart is *not* a fourth tab, which would put two competing
affordances on screen for one thing. Ticket 14's tracking screen is not a tab either; it is pushed
from `Orders` (and from ticket 29's submit, unchanged).

**`Account` holds saved Addresses plus sign-out**, and nothing else. Ticket 33 settled Address
entry, editing and soft-delete in full but never named a home for managing them — this is it,
reusing 33's entry flow verbatim. The profile itself is near-empty by construction: ticket 09's
auth is email+password and ticket 33 established that `contact_phone` lives on the Address, not on
the customer, so the account screen shows the sign-in email read-only. Specified in a line, not
prototyped.

### One list, not two

**In-flight Orders live in history.** Before this ticket, a customer who backgrounded the app after
submitting had *no route back to a live Delivery at all* — ticket 29 pushes to tracking with no
receipt and no other entry point exists. A unified list solves re-entry for free rather than
inventing a second mechanism (a catalog banner) to patch it.

- **Active Orders are a distinct pinned section** above the terminal list, not merely sorted to the
  top. Tapping one opens ticket 14's tracking screen; tapping a terminal one opens the read-only
  detail.
- **A customer may hold several Orders in flight at once**, and the pinned section renders 1..n.
  Nothing stops a customer refilling the cart and submitting again while the first Delivery runs,
  and it is plausible behaviour here (ordering for two households; remembering something after
  submitting). Explicitly **not** blocked at submit — that would add a sixth gate to ticket 29's
  deliberately-bounded stack to solve a problem nobody has. Also explicitly not "allowed in the
  model, rendered as one in the UI": a model that permits what the UI can't draw is how an Order
  goes invisible. Ticket 29's post-submit push targets *the Order just submitted*, not "the" active
  one.
- **Cancelled Orders appear in the same list**, de-emphasised, never hidden. Ticket 28 gives two
  customer-facing routes to cancellation (reject the Price approval; decline every breaching line,
  which *is* that cancellation) plus ordinary dispatcher cancellation — and a cancelled Order is
  precisely the case where the customer most wants to check what happened, because they had a phone
  call about it. No separate section or filter for what will be a handful of rows.

### The row

Date, line-item count, final total, a status pill, and — only when it applies — the "Price changed
at packing" chip. Text, not a photo-led row echoing ticket 30's cards: catalog styling on a record
surface inflates row height for no information.

**The status pill reuses ticket 14's customer-facing vocabulary verbatim.** The model has two
independent tracks (prep + courier, per `CONTEXT.md`), and 14 already collapsed them into a single
customer-facing label; re-deriving one here would give the customer two different words for the
same state.

Newest first. **All Orders, paginated ~20 at a time** — the text record is retained indefinitely
(see retention below), so there is nothing to truncate. Empty state is one line and a button
through to `Shop`. The query is scoped to the customer's own Orders by the same fail-closed RLS
pattern as ticket 09.

### The detail: full money record, progressively disclosed

Tickets 27 and 28 mean **the price the customer paid attention to at checkout is not the price they
were charged**, and they have already had a phone call about the difference. The app contradicting
or omitting what they were told on that call is the one genuinely bad outcome here — worse than
complexity. So the whole record is shown; it is just not all shown at once, because most Orders
never breach tolerance and the packing detail must not dominate the ordinary case.

- **Summary:** final total, delivery fee broken out as never-moving (ticket 27), and the "Price
  changed at packing" chip where it applies.
- **Expanded:** per-line estimated vs packed weight and the signed delta; **removed line items**
  struck through and labelled as declined on the call (ticket 28 keeps them on the Order precisely
  so the record survives — the customer sees that); the **Price approval** outcome and when it was
  given.
- **The driver: name only, no number.** Ticket 14 gives tap-to-call on the driver's real number
  *during* an active Delivery; a permanent tap-to-call on a closed Order turns the driver into the
  customer's support channel, which the shop should own. The name survives a driver's
  soft-deactivation (ticket 09), so a closed Order always renders it.

### The 30-day cliff

Ticket 11's proof-of-delivery photo **is shown to the customer** in the detail — it is a picture of
their own doorstep and their own goods, and it is the strongest "this arrived" signal available.
Ticket 10 keeps no location trail, so there is no route to draw beside it.

The photo auto-deletes at **30 days** and that window is **not reopened** — extending retention for
customer visibility would quietly overturn ticket 11's privacy-cost decision from a UI ticket. An
entry older than 30 days replaces the image with a plain line ("Delivery photo is no longer
available"), never a broken image. **The text record itself is retained indefinitely**; only the
image expires. This is the asymmetry a history surface has to design for rather than discover.

### The dispute seam

Ticket 01 confirmed a customer may report a quality problem within a review window (`Disputed`) and
explicitly deferred the flow. History is where a dispute would start, so **a deliberate seam is left
and nothing more**: a "Something wrong with this order?" affordance on the detail that surfaces the
shop's phone number. **No `Disputed` transition is reachable from the customer app in MVP** — a
`Disputed` Delivery with no resolution flow is worse than no button, and building the transition
would drag the deferred flow into scope through the back door. Equally, no affordance at all leaves
a customer whose meat arrived wrong with nowhere to go. The affordance is not time-bounded in MVP,
since it only ever shows a phone number.

**Dependency: this assumes a shop phone number exists to show** — which is open [ticket
40](40-price-approval-phone-number.md). Whatever number 40 settles on for the Price approval call is
the number this seam shows; if 40 concludes no such number should be published to customers, this
affordance degrades to shop hours and address, and the seam survives as a placeholder.

### Ruled out

**Re-order ("order this again") is out of scope for MVP** — recorded as a sharp post-MVP candidate
on the map's Not yet specified, not silently dropped. It is a good fit for a repeat-purchase
business and would likely land early. But ticket 26's snapshot model (`docs/adr/0003`) means a past
Order holds *frozen* names and prices, so re-ordering must rebuild lines against the **live**
catalog: availability toggles, price changes, soft-deleted Products, and per-weight lines whose
estimates need re-picking. That re-runs ticket 29's entire gate stack in a new context and deserves
its own ticket, not a clause in this one.

### Domain-modeling impact

**None, as predicted.** The ticket consumes existing Order / Delivery / Line item / Price approval /
Removed line item / Delivery fee vocabulary without adding to it — "order history" is a surface, not
a concept. No `CONTEXT.md` change.

**No ADR.** Nothing here clears all three bars: the shell and list shape are cheap to reverse, and
the two decisions that *are* consequential (the 30-day photo cliff; the snapshot-vs-live-catalog
tension behind re-order) are already recorded as `docs/adr/0003` and ticket 11's answer. This ticket
consumes them rather than deciding them.
