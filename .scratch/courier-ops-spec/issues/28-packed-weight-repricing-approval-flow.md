# Packed-weight re-pricing approval flow & lifecycle

Type: grilling
Status: resolved
Blocked by: 27
Map: ../map.md

## Question

Ticket 27 settles the pricing *record* (provisional/final/delta). This ticket settles the *human flow* when a by-weight item's final packed price differs from the provisional the customer agreed to — and how that flow interacts with the `Delivery` lifecycle.

Charting framing (confirmed during graduation): **within a pre-authorized tolerance band the Order proceeds silently; beyond it, the customer must confirm the higher price before dispatch; rejection is a cancellation path.** No money moves. Resolve with `/grilling` and `/domain-modeling`:

- ~~**The tolerance band.**~~ **SETTLED by the user during ticket 27 — do not re-open.** The band is:
  - **An absolute weight in grams, not a percentage of money.** Weight is what the packer controls at the scale; money is only the consequence.
  - **Per Product**, dispatcher-configurable (`tolerance_grams`, ticket 26 as amended), **defaulting to 250 g**. Captured onto the line item at submission, so a later catalog edit can't move an agreed tolerance.
  - **Per line item**, checked against that line's own `estimated_weight_grams`. Two lines each 200 g over do **not** combine into 400 g.
  - **Symmetric.** A shortfall triggers the same obligation as an excess — a 1 kg order packed at 700 g is a service failure even though it costs the customer less. This is the main reason a money-based band was rejected: it would let shortfalls pass silently.
  - **Strictly greater than** the tolerance triggers contact; exactly the tolerance passes quietly.
  - The stated principle behind it: **the burden is on the shop.** Whoever packs must try hard to match the ordered weight; the band is an allowance for honest butchery, not a licence to be loose.

  What is **still open here**: the *flow* the band triggers — "the store must contact the customer to confirm they will proceed." Who contacts them, through which channel (in-app confirmation, push per ticket 12, or a real phone call — the user's wording was "contact", which may well mean a call), and what the Order does while it waits.
  
  Two interactions worth probing: (a) `tolerance_grams` against ticket 26's `weight_step_grams` — a 250 g tolerance on a Product whose step is 250 g is a whole step of slack, which may be too loose; (b) whether a customer can pre-authorize at checkout (ticket 29) to avoid the call entirely.
- **The approval gate.** When the final total exceeds tolerance, what exactly happens: who is notified (push per ticket 12?), what does the customer see/do, and what is the Delivery's state while it waits? A Delivery can be `Ready` (packed) on the prep track but must **not** advance to `Picked up` on the courier track until the customer confirms — this is a new lifecycle constraint coupling the two currently-independent tracks. Pin exactly how.
- **Rejection.** If the customer rejects the higher price, the Order is cancelled. Confirm the courier-status path (`Cancelled` is reachable from `Unassigned`/`Assigned`/`Picked up` per `CONTEXT.md` — does an awaiting-confirmation Delivery cancel cleanly from wherever it sits?). What happens to the already-packed product operationally is a business note, not a system state.
- **Timeout / no response.** What if the customer never answers the confirmation? Auto-cancel after a window, hold indefinitely, or dispatcher decides? Interacts with the store-hours window (ticket 22).
- **Dispatcher visibility.** Does the dispatcher console (ticket 15) need to show "awaiting price confirmation" as a distinct Delivery state so a human isn't left wondering why a `Ready` job won't dispatch?

**Domain-modeling impact:** likely adds an "awaiting price confirmation" state or derived label to the `Delivery` lifecycle in `CONTEXT.md`, and couples prep/courier tracks for the first time. Capture inline on resolution; flag any ADR conflict with `0001-multi-stop-dispatch.md`.

Deliver: the tolerance mechanism and where it's set, the confirm-before-dispatch gate and its lifecycle constraint, the rejection and timeout paths, and dispatcher visibility — with `CONTEXT.md` updated.

## Inherited from ticket 27 (read before starting)

Ticket 27 resolved the record this flow reads. Facts to build on, not re-decide (`docs/adr/0004-provisional-then-final-order-pricing.md`):

- **`Ready` means packed *and* priced.** Prep status can't advance to `Ready` until every per-weight line has a `packed_weight_grams`. That transition is the firm moment this ticket's gate hooks onto — the tolerance breach is knowable exactly then.
- **The record freezes at `Picked up`,** not at `Ready`. So there is a real window between "priced" and "gone" in which a customer confirmation can sit, without needing any new state to hold the money still.
- **Corrections are logged.** A packed weight retyped after the first entry appends a row (line, person, time, old, new). If a weight is corrected *after* the customer approved a price, this ticket can detect it rather than guess — worth deciding whether that re-triggers approval.
- **Deltas are signed and per-line**: `weight_delta_grams` and `money_delta` on each line, plus derived Order-level goods totals. The approval message has itemised data to show — that's why the triple lives per line rather than only on the Order.
- **The delivery fee is outside all of it** — captured at submission, never moves, stored beside the goods totals. It never appears in a delta and never affects the band.
- **No money moves.** This ticket decides a *conversation* and a *lifecycle constraint*, not a charge, a refund, or an authorization hold.

## Answer

**The flow in one line:** at the `Ready` transition, any per-weight line whose `abs(weight_delta_grams) > tolerance_grams` puts the Order into **pending Price approval**; a dispatcher phones the customer; `Picked up` is blocked until they record the answer. No money moves. Recorded as `docs/adr/0005-packed-weight-price-approval-gate.md`; `CONTEXT.md` gains **Price approval**, **Removed line item**, and a definition of **Excess / Shortfall** (which the glossary had been using undefined).

### The channel — a phone call, not an in-app approval

The dispatcher calls. There is **no customer-facing approval screen and no third push event**. Ticket 12 built the customer push pipeline with exactly two events, fire-and-forget, no retry or receipt-polling, on the explicit reasoning that the console is the reliability backstop — an approval hanging off an unacknowledged push would strand packed, perishable goods with nobody accountable for chasing. A call is also what the shop does today and matches the band's own principle: the burden is on the shop.

The system's entire job is to **block dispatch** and **record the outcome**.

### The gate — a transition guard, not a new state

Neither lifecycle track gains a status. An Order-level approval outcome — `not_required` / `pending` / `approved` / `rejected` — is derived at the `Ready` transition (the one moment every delta is knowable, per ADR 0004) and guards `Ready → Picked up`.

This is the first rule in the system that reads one track to constrain the other, and `CONTEXT.md`'s lifecycle section now says so explicitly. A new prep status (`... → AwaitingApproval → Ready`) was rejected: it would merge two deliberately independent state machines and owe transitions out in every direction, where a guard is one readable rule.

### Symmetry — a shortfall gates exactly like an excess

One rule, blind to direction: `abs(delta) > tolerance`. A 1 kg order packed at 700 g holds the Delivery just as a 1.35 kg pack does. The dispatcher's *script* differs — on a shortfall the first move is "can we cut more?", and the call only happens if it can't be fixed — but the Order does not move until the customer has answered. Making the *flow* asymmetric would have reopened the silent-shortfall hole that a money-based band was rejected for in ticket 27.

### The customer's three answers

1. **Approve** — the revised Order goes out as packed.
2. **Decline some lines, keep the rest** — *partial continuation*. Only **lines that breached tolerance** may be declined; nothing can be added, swapped, or increased. A declined line is **soft-removed** (`removed_at`, `removed_by`, `removed_reason`), stays on the Order, and is excluded from every total — never deleted, or ADR 0004's provisional-vs-final record would be silently rewritten. Restricting removal to breaching lines is what keeps the flow clear of checkout: every submission-time gate (store hours, ticket 22; delivery radius, ticket 23; availability, ticket 26) validated the Order once at submission, and a subtractive-only change leaves all three still valid. A customer wanting to drop something that packed fine gets a cancel and a fresh Order.
3. **Reject outright** — a single dispatcher action that records the rejection **and** cancels in one step (a recorded rejection with a live Delivery is a half-state someone has to remember to finish). `Cancelled` is reachable from wherever the Delivery sits — `Unassigned` or `Assigned` — per `CONTEXT.md`; no new edge needed, which is a direct dividend of the gate being a guard rather than a state. **Declining every line is this same cancellation**, reached by a different route: there is no Order with nothing on it.

**The delivery fee never moves.** A customer who declines ₱2,000 of a ₱2,300 Order still owes the fee as captured at submission (ADR 0004 put it outside the delta machinery deliberately). Waiving it is a money decision in a system where no money moves — the shop's call, made verbally, off-system. Stated here so a future reader sees it was decided, not overlooked.

### Recording the answer

The dispatcher records **one explicit approval covering the revised Order** — the customer agreed to something specific out loud, and the record should say a human heard it, not infer consent from arithmetic. The recomputation over surviving lines then runs as a **check on the human, not the decision**: if a line also breaches and was never discussed, the gate stays `pending` and names the missed line.

Captured: outcome, dispatcher, timestamp, a snapshot of the exact approved total (so ADR 0004's correction log can detect drift), and an **optional free-text note**. Dispatcher assertion is the trust level the whole console already runs on; SMS confirmation or call recording are compliance artifacts for a payments track that doesn't exist. The note earns its keep cheaply — ticket 10 persists no location history and ticket 11's photo auto-deletes at 30 days, so "said fine, wants it before 5" is often the only surviving record of what was said.

### Timeout — none. It holds indefinitely.

No auto-cancel window. Destroying a real Order full of already-cut meat because a phone rang out is a destructive act with no human behind it. The goods are perishable, so physical reality supplies the urgency a timer would fake, and ticket 15's job-age attention badge already escalates the wait visually. A dispatcher decides when a customer is unreachable and cancels deliberately.

### A correction after approval voids it

Approval binds to a specific price, so it cannot survive that price changing. Any weight retyped after an `approved` outcome (ADR 0004 logs these) triggers a full recompute: still breaching → back to `pending`; now inside the band → `not_required`, and the flow simply ends without a courtesy call. Letting an approval stand through a correction was the one genuinely unsafe option — it would allow an approved price to be edited upward after the fact.

### What each surface shows while pending

- **Dispatcher console** (ticket 15): a distinct "awaiting price confirmation" treatment in the job-queue drawer, with the dispatch action **disabled and the reason stated**. Without it a dispatcher stares at a `Ready` job that won't move — the failure this ticket was written to prevent.
- **Driver app**: the job stays visible in the assigned list, marked **on hold — do not collect**, with "Picked up" disabled. Enforced in software, not left to the shop simply not handing over the bag: `Picked up` freezes the price record permanently (ADR 0004), so one mistaken tap destroys exactly what the gate protects. Hiding the job instead was rejected — a job that vanishes and reappears reads as a bug and strands a driver told to wait for it.
- **Customer app** (ticket 14): a plain read-only status line — "We're contacting you about a weight change" — plus the itemised provisional-vs-final figures. **No action button**, or it would contradict the phone-call decision; showing nothing invites a "why is my order stuck" call.

### The tolerance-vs-step interaction

A 250 g default tolerance on a Product whose `weight_step_grams` is 250 is a whole step of slack. Left as-is, plus a **soft validation warning in the dispatcher's catalog editor** when `tolerance_grams >= weight_step_grams`. A step-derived default would hide the number the dispatcher is accountable for; a warning at the point of configuration teaches without constraining. Ticket 26's model is untouched.

### Not adopted

- **Pre-authorization at checkout** ("if it comes out over, just proceed") — rejected for MVP. It is a consent artifact about money on a record that deliberately states nothing about payment (ADR 0004's settlement boundary), and it weakens the shop-side pressure to pack accurately. Revisit alongside payments.
- **The removed meat gets no system state** — it goes back in the case or is sold to someone else. Inventory isn't modelled; availability is a manual toggle with no stock count (ticket 26).

### Follow-on

The dispatcher packing screen graduated out of the map's fog as a result of this ticket — see [Dispatcher packing and price-approval screen](31-dispatcher-packing-and-price-approval-screen.md). General post-submission order editing was ruled out of scope on the map.

### Amendment — [ticket 37](37-concurrent-dispatcher-assignment-locking.md)

The Price approval outcome write is **conditional: record it only if the approval is still
pending.** Not a concurrency worry between dispatchers (the MVP has one), but a record-integrity
one — a customer may cancel an `Unassigned` Delivery, and writing `docs/adr/0005`'s approved-total
snapshot against a cancelled Order produces a false record of consent. Same one-line shape as the
assignment guard. No change to the flow, the three customer answers, or the ADR's record fields.
