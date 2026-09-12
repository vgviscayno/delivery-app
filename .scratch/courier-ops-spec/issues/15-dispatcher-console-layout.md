# Dispatcher console layout

Type: prototype
Status: resolved
Blocked by: 01 (02 resolved)
Map: ../map.md

## Question

What does the dispatcher see, and how do they assign a job in as few actions as possible?

The dispatcher is the only actor doing continuous work in this system — this is a tool someone stares at all day, which is a different design problem from the two consumer apps. Prototype it via `/prototype`.

Explore:

- The core layout: map plus job queue plus driver list. Which dominates, and what is always visible versus revealed on selection.
- The assignment interaction itself, the console's central act under manual one-job-at-a-time dispatch. Drag a job onto a driver, select-then-assign, or a suggested-driver list. Count the clicks; this happens hundreds of times a day.
- How a dispatcher judges which driver to assign without ETA or routing — straight-line distance, current job state, visual proximity on the map. Be honest that this is human judgement the tool supports rather than automates.
- Showing many drivers at once without the map becoming unreadable. Clustering, filtering by state, colour-coding.
- What demands attention: unassigned jobs ageing, a driver whose position has gone stale, a job overdue. Whether the console pushes these forward or waits to be noticed.
- Density and information hierarchy for an all-day operational screen — closer to an air-traffic display than a consumer app.
- Whether one dispatcher or several use it simultaneously, and what stops two of them assigning the same driver at once.

**From ticket 02:** the console's map is `mapbox-gl`, a **separate implementation** from the RN apps — no SDK shares components across native and web. It shares only the style JSON and the interpolation module. Note also that `mapbox-gl`'s `Marker` has no animation primitive at all, which matters here more than anywhere else: this screen renders *many* moving markers at once.

Link the prototype from this ticket as an asset. Blocked on ticket 01 for the job states the queue displays.

## Answer

**Decided: Variant A — map-dominant, floating drawer.** Prototype: [`prototypes/15-dispatcher-console-layout.html`](../prototypes/15-dispatcher-console-layout.html) (three variants, cycle with ← / →).

- **Layout:** full-bleed `mapbox-gl` canvas dominates the screen. Job queue and driver context live in floating, semi-transparent panels over the map rather than fixed columns — the map itself is the primary surface, closer to the "air-traffic display" framing than a bordered dashboard.
- **Assignment interaction — two clicks:** click a job in the queue drawer (or its pin) → a "Suggested drivers" panel appears, ranked by straight-line distance → click Assign next to a driver. No drag-and-drop (rejected: Variant B's drag interaction demoed fine but doesn't hold up one-handed or on a trackpad hundreds of times a day, and doesn't scale to touch). No pure list-select (rejected: Variant C's keyboard/table-first flow reads better for triage-heavy, low-map-attention work than for a screen whose central judgement call — "which driver is actually close" — is spatial).
- **Judging driver choice without ETA:** the suggested-drivers list is straight-line distance plus visible state (stale, active-job count) — explicit human judgement aid, not automation. The ranking never picks for the dispatcher.
- **Attention model:** unassigned-job age drives a three-tier badge (ok / warn ≥12m / bad ≥25m, red pulsing pin past the bad threshold); a driver's stale/lost ping recolors its pin and label rather than removing it. Attention is pushed via colour on the always-visible drawer and pins, not via a separate notification — nothing pulls focus away from the map.
- **Concurrent dispatchers:** a driver mid-assignment by another dispatcher shows a named lock pill ("Sam is assigning…") in the suggested-drivers list and its Assign button disables; the prototype scripts this as a static seed rather than a real presence channel (see Not yet specified below).
- **Many-drivers clutter:** the prototype's 5-driver seed didn't need clustering to test legibly, so clustering/filtering-by-state from the ticket's explore list was **not exercised** — carried forward as fog, below.

### Amendment — [ticket 37](37-concurrent-dispatcher-assignment-locking.md)

**The "Concurrent dispatchers" bullet above is superseded. The named lock pill and its disabled
Assign button are deleted, not deferred.**

Two corrections. First, the lock was on the **wrong noun**: it sat on the driver, but ADR 0001
permits one driver to hold many Deliveries, so two dispatchers assigning different Deliveries to
one driver break nothing. The only real conflict is on a single **Delivery**. Second, the MVP has
**one dispatcher** — there is no second dispatcher for a pill to name.

What replaces it: the assignment write is conditional on `courier_status` still being
`'Unassigned'`, and a zero-row result shows the dispatcher a message naming the actual cause read
from the re-read Delivery — *"The customer cancelled this Order"* or *"This Delivery is already
assigned to Ramon."* This is still reachable with one dispatcher, because a customer may cancel an
`Unassigned` Delivery. Everything else in this ticket's decision stands unchanged.
