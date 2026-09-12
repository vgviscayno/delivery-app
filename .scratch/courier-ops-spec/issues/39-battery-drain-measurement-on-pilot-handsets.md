# Battery drain measurement on pilot handsets

Type: task
Status: open
Blocked by: 34
Map: ../map.md

## Question

A **task**, not a decision: ticket 03 found **no primary source** for any quantitative battery figure for continuous background location, so the numbers have to be measured on real hardware. Nothing on the map can be decided about cadence trade-offs until they exist.

What to measure, against ticket 07's settled cadence — distance filter ~40–50m while moving, 60s stationary heartbeat, tracking scoped to an active Delivery:

- Drain per hour, and per full shift, on the actual pilot Android handset model (company-owned, MDM-enrolled per ticket 18).
- The delta with the OEM battery-optimization exemption applied versus not — ticket 18 found this has **no MDM lever at all** and moved it to a one-time kitting-checklist step, so it is a manual step whose value should be measured rather than assumed.
- Drain while idle-but-on-shift versus during an active Delivery, once ticket 34 settles whether tracking runs outside an active Delivery at all. This is why the ticket is blocked on 34 — the shift model determines what "per shift" even means.

This is **HITL**: it needs physical handsets, an enrolled device, and a real shift's worth of elapsed time. The agent can prepare the measurement protocol and the recording sheet; the human runs it.

The **decision** this unblocks — what drain per shift is tolerable, and whether ticket 07's cadence must change — is not made here. Record the figures; if they force a cadence change, that reopens ticket 07 as its own ticket.

Record on resolution: handset model, OS version, measured drain figures with and without the battery exemption, and the conditions each was measured under.

### Amendment — [ticket 34](34-driver-shift-and-availability-model.md) (unblocks this ticket)

Ticket 34 answered the question this was blocked on, and the answer **widens the brief rather than
just filling in a parameter**. Tracking is no longer scoped to an active Delivery: it runs for the
whole duty period ([ticket 07 amendment](07-location-cadence-staleness-and-client-smoothing.md)), so
"per shift" now means **~8 hours of continuous capture (08:00–16:00)**, not the sum of a few delivery
runs. Idle-but-on-duty is the *dominant* condition on a quiet day, not an edge case.

Concrete shift shape to measure against:

- **Duty window 08:00–16:00**, two drivers, handsets that **stay in the vehicle and at the shop** —
  they never go home, so overnight charging happens at the shop, not on a driver's bedside table.
- **Idle-but-on-duty** is now a first-class measurement, not a footnote. Capture is running with no
  Delivery held; the 60s stationary heartbeat is the expected steady state while parked at the shop.
- Keep the existing comparisons: with and without the OEM battery-optimization exemption, and active
  Delivery versus idle.

**One mitigation to record rather than discover:** an in-vehicle charger. Since the handset lives in
the vehicle for the whole duty period, this is close to free and probably removes the problem
entirely — added to [ticket 18](18-android-mdm-provisioning-for-the-driver-fleet.md)'s kitting
checklist alongside the OEM exemption step. Measure **with and without** it; a result of "drains to
40% by 16:00, but irrelevant because it is plugged in" is a perfectly good outcome and should be
recorded as such rather than triggering a cadence change.

The escalation path is unchanged: if the figures force a cadence change, that reopens ticket 07 as its
own ticket. Nothing about the widened scope changes ticket 07's cadence parameters by itself.
