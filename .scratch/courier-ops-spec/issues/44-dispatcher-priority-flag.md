# Dispatcher priority flag — console control and domain model

Type: grilling
Status: open
Blocked by: —
Map: ../map.md

## Question

Surfaced and half-decided by [ticket 32](32-driver-app-screens-and-job-flow.md), which settled the
**driver-side** rendering of a dispatcher priority flag and deliberately left the setting side alone.
This ticket owns the other half.

**Already settled by ticket 32 — carry these in, don't relitigate:**

- A **single boolean** with a **mandatory reason**, never a rank. A rank field is manual route
  optimisation, which is out of scope on this map.
- **At most one live flag per driver.** Scarcity is what keeps the signal readable.
- **Advisory only** — it sorts and marks, it disables and blocks nothing.
- **Clears when the Delivery reaches a terminal state**; does not survive a reassignment.
- **No acknowledgement path** — the console shows the flag is set and nothing more, holding
  [ticket 12](12-push-notification-pipeline.md)'s fire-and-forget line.
- Driver-side it renders as a **violet overlay** — crown on the pin, bar on the card — composing with
  rather than replacing the in-van green and price-hold amber.

**Open here:**

- **Where the control lives on the console.** [Ticket 15](15-dispatcher-console-layout.md) settled a
  full-bleed map with floating panels and a two-click assignment flow (job → suggested drivers →
  assign). Does flagging hang off the job in the queue drawer, off the job detail, or off the
  assignment step itself? This **amends a resolved ticket** — write it as an amendment on 15, don't
  reopen it.
- **Enforcing one-per-driver in the interface.** What the dispatcher sees when they flag a second job
  for a driver who already has one: a hard refusal, or an offer to move the flag? The write path must
  stay correct for many dispatchers per the map's forward-compatible-subset rule
  ([ticket 20](20-driver-app-distribution-and-mvp-platform-scope.md),
  [ticket 37](37-concurrent-dispatcher-assignment-locking.md)) even though only the interface may
  assume one.
- **A flag on an `Unassigned` Delivery.** The cap is per *driver*, but a job can be flagged before it
  has one — or be flagged and then assigned to a driver who already holds a flagged job. Does the cap
  bite at flag time, at assignment time, or both? This is the sharpest edge in the ticket.
- **The reason input.** Free text, or a short set of reason chips plus an optional note? Free text is
  honest about the variety of real causes; chips are faster for a dispatcher mid-call and keep the
  driver's card from overflowing. Note that ticket 28 already chose free text for its approval note.
- **Does the flag show anywhere else?** [Ticket 36](36-customer-order-history.md)'s customer history
  and the customer tracking screen ([ticket 14](14-customer-live-tracking-screen.md)) — presumably
  not, since it is an internal operational signal and telling a customer they were deprioritised is
  worse than silence. Confirm and record the reasoning rather than leaving it unasked.
- **Interaction with ageing badges.** Ticket 15 ages unassigned jobs through ok/warn/bad. A flagged
  job that is also ageing has two attention signals; ticket 32 hit the same clash driver-side and
  solved it with a composing overlay. Does the console need the same treatment?

**Domain-modeling impact:** yes, and this ticket owns it. Adds a priority term and its field to
`CONTEXT.md` — ticket 32 deliberately did not write it, since the field belongs with the surface that
sets it. Consider whether the clears-on-terminal and one-per-driver rules warrant an ADR or are small
enough to sit in `CONTEXT.md` alone.

Deliver: the console control and its placement as an amendment to ticket 15, the cap's enforcement
point, and the `CONTEXT.md` entry.
