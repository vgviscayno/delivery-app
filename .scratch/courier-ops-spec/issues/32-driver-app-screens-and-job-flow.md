# Driver app screens and job flow

Type: prototype
Status: resolved
Blocked by: 34
Map: ../map.md

## Question

The destination promises a spec covering **three surfaces**, but the driver app is the only one never designed. The customer app has tickets 14 (tracking) and 30 (catalog + cart); the dispatcher has 15 (console) and 31 (packing bench). The driver app has only been decided *sideways* — location capture (03), permission onboarding (16/18), proof-of-delivery photo (11), push receipt (12) — with no ticket ever asking what a driver actually looks at. Ticket 12 explicitly names "the driver's own list" as the reliability backstop when a fire-and-forget push is dropped, and that list exists nowhere on this map.

This is a **how-it-looks / how-it-behaves** question. Build a prototype with `/prototype` and link it as an asset.

What the prototype must exercise:

- **The job list — the multi-stop crux.** `docs/adr/0001-multi-stop-dispatch.md` lets a driver hold several Deliveries at once, and ticket 15 settled that the *dispatcher* assigns without route optimisation. So the driver picks their own next stop by eyeballing distance (Out of scope: route optimisation). How does the list rank, and does it let the driver reorder or is order implicit? What does a Delivery held at `Assigned` while another is `Picked up` look like beside it?
- **Job detail and the status-advance controls.** Where `Picked up` and `Delivered` are pressed, how mis-taps are guarded, and how ticket 28's rule renders: a Delivery whose Order has a **pending Price approval cannot advance to `Picked up`**. The driver may be standing in the shop with a packed order they can't take. That blocked state needs a reason on the driver's screen, not a dead button — compare ticket 31's amber-reason-beside-the-button treatment for the dispatcher's equivalent.
- **The proof-of-delivery hand-off** (ticket 11): mandatory photo, optimistic close, background upload. Where the camera opens, what the driver sees while the upload is still queued.
- **The permission and tracking surface** (16/18): the foreground-service notification is only shown during an active Delivery and is named to the job; a mid-shift Always downgrade blocks forward-looking assignment without yanking the in-flight job. What does the driver see when that happens?
- **Screen count and navigation.** Is this two screens (list + detail) or one? Company-owned MDM handsets, one-handed use, likely in a van.

Consumes ticket 34's shift/availability answer — whether the app's home is a job list or a shift toggle in front of one — which is why this is blocked on it.

**Domain-modeling impact:** none expected; consumes the ticket 01 lifecycle vocabulary. Flag it if the prototype forces a new driver-side term.

Deliver: the chosen driver-app screen set and job flow, with the prototype linked as an asset.

### Note — [ticket 34](34-driver-shift-and-availability-model.md) (unblocks this ticket)

Ticket 34 settled the shift model this was blocked on, and it adds surface area here that the question
above doesn't mention: the driver app now needs **Start work / Finish work** controls, and a clear
indication of duty state, since duty is what makes the driver visible to dispatch all day. Points to
carry in:

- Duty is a **flag, not a timesheet** — the app must not present hours worked, totals, or history. The
  shop's HRIS owns that, and showing it here invites the app to grow into a payroll surface.
- Duty **auto-ends at 16:00 server-side unless a non-terminal Delivery is held**, so the app has to
  handle being clocked out from under it, and to show why a driver still tracking past 16:00 is.
- There is **no break/lunch state** — deliberately, not by omission.
- Being off duty **does not block** an incoming assignment (it only warns the dispatcher), so the app
  must handle receiving a job while clocked out rather than treating that as impossible.
- The **foreground-service notification now spans the duty period**, not just an active Delivery
  ([ticket 16 amendment](16-driver-location-permission-onboarding.md)), which changes what the driver
  sees in their notification shade all day.

## Answer

**Variant C — map-led, one screen.** Prototype:
[`prototypes/32-driver-app-screens-and-job-flow.html`](../prototypes/32-driver-app-screens-and-job-flow.html)
(three shells on `?variant=A|B|C`, nine scenario chips forcing the hard states; C is the chosen one).

### The screen set

**One screen, not two.** A `@rnmapbox/maps` canvas fills the top, the held Deliveries sit in a
bottom sheet under it, and job detail opens as a sheet *over* the map rather than as a pushed route.
The driver never loses spatial context to read an address. Variant A's two-screen list→detail push
was rejected: it costs a navigation every time the driver checks where a stop actually is, which is
the question they ask most in a van.

This mirrors [ticket 15](15-dispatcher-console-layout.md)'s console — map as the primary surface,
panels floating over it — and that symmetry is a real dividend: one `interpolatePosition` module and
one style JSON (ticket 02) now serve a map on both surfaces, with only the SDK differing.

### Ordering: spatial and implicit — no manual reorder

The pins **are** the ranking. Route optimisation is out of scope and stays out; the driver eyeballs
distance, which is exactly what a map is for. The sheet lists stops nearest-first as a text mirror of
the pins, grouped so state is never inferred from position alone:

`★ asked for first` → `in your van` → `packed, ready to collect` (by distance) → `not yet`.

Variant B's tap-to-choose-next-stop was rejected. It made the driver restate an ordering they'd
already made in their head by looking at the map — a second bookkeeping act with no payoff. Nothing
in the app depends on knowing which stop the driver *intends* next, so capturing it is state the
system doesn't need.

### Dispatcher priority flag — new, decided here

The prototype's gap, found by the dev on review: nothing let dispatch say *this one first*. Settled
as a **single boolean flag with a mandatory reason, at most one live per driver.** It sorts the job to
the top of the sheet and crowns its pin. It is **advisory** — it disables nothing and blocks nothing.

- **One flag, never a rank.** A rank field is manual route optimisation by the back door — the thing
  this map ruled out — and it relocates the routing call to the one person who cannot see the road.
  One bit carries what the dispatcher genuinely knows (this customer matters more) and stays silent
  on what they don't (traffic). Explicitly considered and rejected.
- **Capped at one per driver.** If everything can be urgent, the flag is ignored within a week.
  The cap forces a choice and renders as exactly one crowned pin.
- **The reason is mandatory.** A bare flag is noise; "restaurant opens at 17:00" is actionable. Same
  move as [ticket 28](28-packed-weight-repricing-approval-flow.md)'s disabled-with-a-reason and
  [ticket 31](31-dispatcher-packing-and-price-approval-screen.md)'s amber-reason-beside-the-button.
- **Advisory, not enforcing.** [Ticket 15](15-dispatcher-console-layout.md) settled that the console's
  suggested-driver ranking *"never picks for the dispatcher"*. A driver-side flag that forced order
  would be the same system making the opposite call about which human it trusts.
- **Clears when the Delivery reaches a terminal state.** It does not survive a reassignment — a flag
  is about a situation, and a reassigned job is a new situation for a new driver.
- **No acknowledgement path.** The console shows the flag is set and nothing more, holding
  [ticket 12](12-push-notification-pipeline.md)'s fire-and-forget line. A read-receipt would be the
  first delivery guarantee in the system and isn't worth opening for this.

**Rejected: just phone the driver.** Cheapest option, and it is what ticket 28 chose for the
*customer*. It doesn't transfer — the customer is outside the system, the driver is inside it on a
company handset with a push pipeline already built. Calling someone who is driving is unsafe, often
unanswered, and leaves no record, which matters in a system that persists no location history
(ticket 10) and auto-deletes proof photos at 30 days (ticket 11).

**Priority is a violet overlay, never a recolour** — a crown above the pin, a bar above the card.
Green already means in-van and amber means price-hold, and the likeliest urgent job is one that is
*also* on hold (angry customer stuck behind a weight call). Recolouring would have destroyed one of
the two signals in exactly the case that matters most. The prototype's `Urgent + on hold` chip exists
to hold this honest.

### How the settled constraints render

- **Price-approval hold** (ticket 28) — amber card, `On hold — do not collect`, the advance control
  **disabled with the reason beneath it**, never a dead button. The job stays visible, per ticket 28.
- **Proof of delivery** (ticket 11) — camera sheet opens from the detail sheet; photo is the only
  gate, recipient name and signature sit behind it marked optional. Tapping *Mark delivered* closes
  the job optimistically and drops an `uploading` chip that clears itself.
- **Always-permission downgrade** (ticket 16) — full-width red banner over the map, unmissable, and
  it never yanks the in-flight job: completing a `Picked up` Delivery stays available throughout.
- **Duty** (ticket 34) — `Start work` / `Finish work` in the header with a state dot. **No hours, no
  totals, no history** — the HRIS boundary is respected in the UI, not just the schema. A job arriving
  while clocked out is shown as normal with an explanatory banner, never as an error.
- **Past 16:00 still carrying** — the banner explains *why* location is still being shared, and the
  foreground-service notification switches to a third string for it.
- **Foreground-service notification** (ticket 34's amendment to ticket 16) — three duty-scoped
  strings, live at the top of the prototype's phone frame: on-duty-idle, delivering-#id, and
  past-16:00-finishing-up. The old Delivery-only copy is gone.

### Mis-tap guard: press and hold

Carried with variant C rather than chosen against the other two — flagging that provenance so a
future reader doesn't read more deliberation into it than happened. It is **separable**: swapping it
for variant A's confirm sheet or B's slide-to-confirm touches nothing in the layout. Worth a real
look on a pilot handset, one-handed, before it's built.

### Domain-modeling impact

The ticket expected none. The priority flag is a **new term** and a new field on Delivery, so this
needs a `CONTEXT.md` entry. Deliberately **not** written here: the field and its rules belong with the
surface that sets it, so [ticket 44](44-dispatcher-priority-flag.md) owns the domain change.
The ticket 01 lifecycle vocabulary is otherwise unchanged — no new status on either track.

### Follow-on

- [Ticket 44 — Dispatcher priority flag](44-dispatcher-priority-flag.md): the console control, the
  one-per-driver enforcement, and the `CONTEXT.md` term. Amends resolved ticket 15 rather than
  reopening it.
- [Ticket 35 — Driver goes dark](35-driver-goes-dark-failure-modes.md) is unblocked by this.
