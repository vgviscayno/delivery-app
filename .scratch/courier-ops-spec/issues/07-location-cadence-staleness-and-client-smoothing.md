# Location cadence, staleness, and client smoothing

Type: grilling
Status: resolved
Blocked by: — (was 03, now resolved)
Map: ../map.md

## Question

What does "live" actually mean in this product — and what does the customer see when it isn't?

The headline feature is a moving vehicle on a map. That experience is manufactured from a sparse, irregular, sometimes-absent stream of points, so the spec must state the illusion's parameters explicitly.

Settle:

- Sampling and emission cadence: how often the driver app captures a fix and how often it sends one. These are not the same number, and the gap between them is a battery and cost lever.
- Whether cadence varies by state — an assigned-but-not-started job does not need the same rate as a driver two minutes from the door.
- Distance-filter versus time-interval triggering, and what a stationary driver at traffic lights should produce.
- Client-side smoothing: does the customer's marker jump between fixes or animate along an interpolated path, and is interpolation straight-line or snapped to roads. Straight-line interpolation across a river looks broken; road-snapping needs map-matching, which has a cost.
- The staleness contract: at what age is a position considered stale, what does the customer see then (a greyed marker, a "last seen 3 minutes ago" label, nothing), and at what point does the app admit it has lost the driver.
- Whether the customer ever sees the historical trail or only the current position.
- Accuracy handling: GPS fixes carry an accuracy radius, and urban-canyon fixes can be wildly wrong. What gets filtered out before it reaches a screen.

**Inputs now available — ticket 03 is resolved, so this ticket is unblocked:**

- Realistic cadence is **~10–15s while moving**, with **30–120s gaps** to be assumed and rare multi-minute outages. iOS can reach ~1 Hz but shouldn't; Android degrades to 30–60s and intermittent total loss on Huawei / Xiaomi / OnePlus / Samsung.
- Ticket 03 recommends **scoping tracking to an active job** rather than the working day, which if adopted answers the "does cadence vary by state" question by making off-job cadence zero.
- Ticket 02 established that **no map SDK provides usable marker animation** — the native bindings offer JS-thread linear interpolation on lat and lng independently, and the web SDK offers nothing. So a shared `interpolatePosition` module is being written either way, and this ticket defines its behaviour: straight-line vs road-snapped, easing, and what it does when the next fix never arrives.

The gap between a 10–15s cadence and a marker that appears to move continuously is entirely manufactured by that module. Specify it as a deliberate illusion with stated limits, not as an implementation detail.

## Answer

**Tracking is scoped to an active Delivery** (ticket 03's recommendation, adopted here): capture runs only while the driver holds at least one Delivery in `Assigned` or `Picked up` courier status (`CONTEXT.md`), and is off otherwise. This is what answers "does cadence vary by state" — there is no separate lower rate for an idle assignment, because there's no capture at all until pickup begins.

**Capture trigger**: distance-filter while moving (~40–50m between fixes), which lands naturally in the ~10–15s cadence ticket 03 measured at typical delivery-driving speed. While stationary (red light, waiting at a door), distance-sampling stops and a **60s heartbeat** fix is emitted instead — same coordinates, proving liveness without the battery cost of continued GPS polling. This matches Transistorsoft's (ticket 03) motion-detection state machine rather than fighting it with naive time-interval capture.

**Emission**: unchanged from ticket 06 — every captured fix (moving or heartbeat) is sent as one HTTP call immediately, with the existing ~5s server-side rate-limit floor at the Edge Function as the only backpressure control. This ticket does not introduce client-side batching.

**Accuracy filtering**: fixes with an accuracy radius worse than **~75m** are dropped at the Edge Function ingest point (not client-side), before they reach the "latest position" upsert or the broadcast. Server-side enforcement means the rule holds regardless of driver-app version, and a dropped fix simply falls through to the staleness contract below rather than needing separate handling.

**Client-side smoothing (`interpolatePosition` module, per ticket 02)**:
- **Straight-line interpolation** between consecutive accepted fixes, animated over the gap between them. Road-snapping (map-matching) was rejected — it reopens the routing-engine question this project explicitly ruled out of scope (`map.md`), and at a 40–50m distance-filter, consecutive fixes are close enough together that straight-line corner-cutting is minor in practice.
- **No extrapolation.** If the next fix is late, the marker freezes at the last known point rather than guessing a heading/speed forward. Freezing is never wrong; extrapolating compounds error the moment the driver turns or stops, and it would contradict the staleness contract's honesty about "last seen."

**Staleness contract**, three tiers measured against fix age:
- **Live** (< 90s): marker animates normally, no indicator. Covers the normal 30–120s gap range and a full stationary heartbeat cycle.
- **Stale** (90s–3min): marker freezes at its last position, rendered in a dulled/greyed style, with a "Last updated Xs/Xm ago" label.
- **Lost** (> 3min): the app stops implying liveness — a distinct "can't reach driver" treatment (e.g. dashed last-known marker) replaces the staleness label. This is also the threshold at which it's operationally meaningful for a dispatcher to know.

**No historical trail** — customer and dispatcher both see current position only. Ticket 06 persists a single "latest position" row per driver server-side, not breadcrumb history; adding a trail would mean either a new server-side breadcrumb table (out of this ticket's scope) or a client-accumulated trail that's incomplete on open and vanishes on refresh. A dispatcher-facing trip-audit trail may be worth a future ticket but is not a client-smoothing concern.

### Consequences for other tickets

- Feeds the spec's live-tracking section directly: cadence, staleness, and smoothing are now fully parametrized.
- The `interpolatePosition` module (ticket 02) has its full behavioural spec: straight-line, freeze-on-gap, no easing beyond the animation itself.
- Confirms ticket 03's job-scoping recommendation as adopted, closing that open thread in `map.md`'s fog list.

### Amendment — [ticket 34](34-driver-shift-and-availability-model.md)

**Capture scope widens. The "tracking is scoped to an active Delivery" rule above is superseded.**

The business owner chose to have drivers visible for the **whole working day** (08:00–16:00), not
only while carrying goods. Capture therefore runs while the driver is **on duty OR holding a
non-terminal Delivery** — the second clause preserving this ticket's original rule as a subset, so a
driver who forgets to clock in still tracks the moment work is assigned. Duty ends server-side at the
configured end-of-day unless a non-terminal Delivery is still held; see ticket 34 decisions 2 and 3.

What this **does not** change: the distance-filter trigger (~40–50m), the 60s stationary heartbeat,
the accuracy floor (~75m, server-side), straight-line interpolation with freeze-on-gap and no
extrapolation, and the Live/Stale/Lost tiers. All of those are properties of a fix stream, not of what
opens it.

Two knock-on effects, both handled elsewhere: this ticket's closing line "confirms ticket 03's
job-scoping recommendation as adopted" no longer holds, and continuous 8-hour capture re-scopes
[ticket 39](39-battery-drain-measurement-on-pilot-handsets.md)'s battery brief.
[Ticket 10](10-location-history-storage-and-retention.md) is unaffected — nothing is persisted either
way, so a wider capture window creates no record to retain.
