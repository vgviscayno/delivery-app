# Driver shift and availability model

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

Carried as fog since charting ("hangs on the domain model"). The domain model is settled (ticket 01), so this is now answerable — and several resolved tickets are quietly leaning on an answer that was never given.

What is already assuming something here:

- Ticket 15's console ranks **suggested drivers by distance** and shows idle/busy/stale states — which presumes the console knows who is available and why.
- Ticket 09 gives drivers **long sessions** and a dispatcher-driven **soft deactivation**, a permanent employment-level switch, not a daily one.
- Ticket 16 **hard-blocks assignment** without Always location permission — an availability gate that exists with no availability model around it.
- Ticket 07 scopes tracking to an **active Delivery**, which means a driver with no Delivery is currently invisible on the map. Ticket 15's console shows drivers to assign *from*. Those two need reconciling.

Open:

- **Is there an explicit shift?** Does a driver go on/off duty in the app, or is availability derived (has a session + has permission + isn't holding N Deliveries)? An explicit toggle is a thing a driver forgets to press; a derived one can't express "I'm here but I'm on my lunch."
- **The privacy question.** If tracking only runs during an active Delivery (07), a dispatcher can't see where an idle driver is — which undercuts distance-ranked suggestions (15). Extending tracking to cover the whole shift is a real privacy decision on company-owned handsets, not just a technical one, and it interacts with ticket 10's "no location history persisted at all."
- **Concurrency ceiling.** Is there a maximum number of concurrent Deliveries per driver, and is it a hard block or advisory? Related to the still-fogged van-capacity/max-cart-size question, but the *driver-side* limit is answerable on its own.
- **What availability means for the assign action.** Can a dispatcher assign to an off-shift driver at all — hard block like ticket 16, or a warning?

**Domain-modeling impact:** likely adds **Shift** and/or **Availability** to `CONTEXT.md`. If tracking extends beyond an active Delivery this **amends ticket 07 and ticket 10** — say so explicitly if so.

## Comments

All four open questions were referred to the business owner rather than answered in-session —
they turn on shop facts (fleet size, working hours) and on an employer-level privacy call about
tracking idle drivers, none of which the agent or the dev can settle.

Assets:
- [Questions for the business owner](../questions/34-driver-shift-and-availability.md) — source text.
- Same questions as a shareable web page (private until shared):
  https://claude.ai/code/artifact/89d1f4e0-46d9-4901-a240-78836bc1b2c2
  (built from `../questions/34-driver-shift-and-availability.html`; edit that file and republish to
  the same URL rather than creating a second link).

Awaiting the owner's answers; ticket stays claimed so no other session picks it up. `claimed`
is doing the parking here on purpose — a new status would fall outside the frontier scan in
`docs/agents/issue-tracker.md` and quietly change what "open and unclaimed" means.

Expect a **second round**. This ticket is a hinge, not a leaf: the answers are likely to widen
the fog rather than close it, particularly around what "off duty" does to a driver already
holding a Delivery, and what the console shows for a driver who never clocked in. Those follow-up
questions are deliberately not pre-written — they can't be phrased sharply until the shape of the
fleet is known, and guessing at them now would be pre-slicing the fog.

## Answer

Settled by the **business owner** via the questionnaire linked above, then grilled with the dev for
the consequences the four answers didn't state. The owner's answers are recorded first, verbatim in
substance; the decisions that follow are ours.

### What the owner settled

- **Fleet and hours.** **Two drivers.** Working day **08:00–16:00**; stock preparation runs roughly
  06:00–08:00 ahead of it. The 16:00 finish is deliberate — the last delivery leaves by then to keep
  drivers out of rush-hour traffic. Handsets **never go home**: they stay at the shop and in the
  vehicle.
- **Explicit clock-in (option A).** The driver taps *Start work* and *Finish work*. With one crucial
  qualification the questionnaire didn't ask for: the shop **already runs an HRIS** for timekeeping.
  The clock-in is therefore an **availability signal for dispatch, not a time record**.
- **Visible for the whole working day (option A).** From *Start work* to *Finish work*, and never
  outside those hours.
- **No concurrency ceiling (option B).** No cap on Deliveries per driver. The ceiling the owner
  actually wants is a **time** ceiling, not a count: an **order cutoff ~30 minutes before the drivers
  stop** — 15:30 against a 16:00 finish.

### Decisions

**1. The concept is "On duty", and it is a flag, not a `Shift` record.**
Duty is current state on the driver — on/off plus the time it last changed — overwritten each day,
with **no history table**. The name matters and was chosen against the ticket's own suggestion: a
`Shift` entity with `started_at`/`ended_at` is shaped exactly like a timesheet, and would attract
reporting, totals and payroll features that belong to the HRIS the shop already pays for. The
`CONTEXT.md` entry states that boundary explicitly so it isn't relitigated by a future reader who
sees two timestamps and infers a purpose.

**2. Tracking is scoped to duty, not to an active Delivery. Amends ticket 07.**
Capture runs while the driver is **on duty OR holding a non-terminal Delivery**. The second clause is
not redundant: it makes ticket 07's original rule a strict *subset* of the new one rather than a
contradiction, and it means a forgotten *Start work* tap can never cost a customer their live
tracking. Ticket 15's distance-ranked suggested-drivers panel now rests on real data — previously it
ranked by distance to drivers the system could not see, which was the inconsistency this ticket was
opened to reconcile.

Ticket 10 is **unaffected and reinforced**: still no location history persisted, at any layer. The
privacy position becomes "visible all day, recorded never" — which is a coherent thing to tell a
driver, and is what the owner was told when they chose option A.

**3. Auto-off at end of day, unless the driver is still carrying work.**
A forgotten *Finish work* would otherwise leave a handset on a shop counter broadcasting all night,
breaking the "never outside those hours" promise the owner made to their own drivers. Duty therefore
ends **server-side at a configured end-of-day (16:00)** — *unless* the driver still holds a
non-terminal Delivery, in which case duty persists until the last one reaches a terminal state, so a
driver finishing a 16:15 drop never goes dark mid-run. The end-of-day is configuration, not a
constant, and lives alongside ticket 22's existing settings surface.

**4. Off duty warns; missing permission blocks.**
Assignment to an off-duty driver is a **confirmable warning**, not a hard block — the console greys
the driver and labels them not clocked in. This is deliberately *unlike* ticket 16's Always-permission
gate, and the distinction is the point: **permission is technically load-bearing** (without it the
feature cannot function), whereas **duty is a human signal that can simply be wrong**. With a
two-driver fleet, a hard block means one forgotten tap stops the shop. Ticket 16's hard block stands
unchanged.

**5. No concurrency ceiling; the cutoff reuses ticket 22's mechanism. Amends ticket 22.**
No cap is introduced. Ticket 15 already shows each driver's active-job count, which is exactly the
advisory display option B asks for, so nothing is built for this.

The cutoff needs **no new concept**: ticket 22 already has per-weekday `store_hours` plus a
configurable `last_order_buffer_minutes`. Setting close to **16:00** and the buffer to **30** produces
the owner's 15:30 cutoff through the machinery that already exists, including its server-side
re-validation at submit. What *is* added is a naming clarification, because the field is now
load-bearing in a way its name doesn't convey: **`store_hours` means the delivery *ordering* window,
bounded by driver availability — not the shop's trading hours.** The meat counter is very likely open
past 16:00 for walk-ins; nothing about that belongs in this field.

**6. No break/lunch state in MVP.**
The questionnaire's own argument for the clock-in was that a derived signal can't distinguish "on
lunch" from "ready" — but the fix for that is not a third state. Two drivers and one dispatcher who
can phone them makes an explicit break toggle a third thing to forget, and forgetting it reproduces
precisely the wrong-availability problem the clock-in exists to solve. Recorded here so it isn't
re-proposed as an oversight.

**7. Battery measurement is re-scoped. Amends ticket 39.**
The change from bursty to continuous tracking is the consequence most likely to bite in the field and
least likely to be noticed at a desk.

### Amendments to resolved tickets

| Ticket | Change |
| --- | --- |
| [07](07-location-cadence-staleness-and-client-smoothing.md) | Capture scope widens from active-Delivery to `on duty OR non-terminal Delivery`. Cadence, staleness tiers and smoothing are **unchanged**. |
| [16](16-driver-location-permission-onboarding.md) | Foreground-service notification now runs for the whole duty period, not only during a Delivery — and its copy must change, since the current shared permission string **promises in writing** that location "is never tracked outside" an active delivery. That sentence is now false. |
| [22](22-order-acceptance-time-window.md) | `last_order_buffer_minutes` **30** (was 15), close **16:00**; `store_hours` documented as the delivery ordering window, not trading hours. |
| [39](39-battery-drain-measurement-on-pilot-handsets.md) | Brief re-scoped to a full 8-hour duty day; in-vehicle charging added to ticket 18's kitting checklist. |
| [10](10-location-history-storage-and-retention.md) | **No change** — stated explicitly because widening tracking scope looks like it should touch retention, and doesn't. |

### Deliberately not decided here

**Advance ordering.** Asked whether the 06:00–08:00 prep block implied a next-day model, the owner
answered that **orders can be placed a day before**. That is a real capability nothing in the map
accounts for — no Order carries a requested delivery date, and ticket 22's gate asks only whether the
shop is open *now*. It is a sharp question but not a driver-availability one, so it becomes
[ticket 42](42-advance-ordering-and-delivery-date.md) rather than being resolved on this ticket's
coat-tails. Decision 5's cutoff is stated as governing **same-day** delivery; what the cutoff means for
an order placed the day before is ticket 42's to answer.

**Whether a handset belongs to a driver or to a vehicle.** The owner wrote "phone stays at the shop
and vehicle," which reads both ways. We proceed on **one handset per driver**, which keeps ticket 09's
long-lived stay-signed-in sessions intact — but that ticket chose long sessions on the explicit
reasoning that "signing in every shift is pure friction," and that reasoning collapses if handsets are
pooled per vehicle, where sign-in *is* the clock-in. Confirmation is [ticket 43](43-handset-ownership-model-confirmation.md).
