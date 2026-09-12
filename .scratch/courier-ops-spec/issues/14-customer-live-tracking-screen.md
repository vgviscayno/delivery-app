# Customer live-tracking screen

Type: prototype
Status: resolved
Assignee: agent-session
Blocked by: 07 (02 resolved)
Map: ../map.md

## Question

What does the customer actually see while their delivery is in progress?

This is the product's headline screen and the reason the whole system exists. "How should it look and behave" is the key question, so build a cheap, rough, concrete artifact via `/prototype` and react to it rather than arguing in the abstract.

Explore:

- The map-to-chrome ratio: full-bleed map with a floating sheet, or a map panel above a status list. This single choice sets the screen's character.
- What sits on the map: driver marker, pickup and drop-off pins, the customer's own location, a trail. What is genuinely useful versus what is decoration that costs render performance.
- Camera behaviour: does the view follow the driver, fit both driver and destination, or stay where the user last dragged it. Auto-following a marker while the user is trying to pan is a classic irritation — decide how the app yields control back.
- How status is conveyed with **no ETA available**. Without a time, the screen must express progress some other way — a state label, a distance, a stepper — and that constraint should shape the design rather than be patched over.
- The stale-position state, decided in ticket 07, rendered honestly.
- What the screen becomes before assignment and after delivery, since it is the same screen across the job's whole life.
- Contacting the driver, if that exists at all.

Link the prototype from this ticket as an asset. Blocked on ticket 02 for the map SDK's actual capabilities, and ticket 07 for what the position stream provides.

## Resolution

Prototype: [`prototypes/14-customer-live-tracking.html`](../prototypes/14-customer-live-tracking.html) — three layout variants (A: full-bleed + floating sheet, B: split map/status panel, C: full-bleed + minimal chrome), switchable live, walked through against every courier-status state plus the three staleness tiers.

**Layout: Variant B — split map panel (~54% height) above a fixed status panel.** Rejected full-bleed+sheet (A) and minimal-chrome (C) as decorative for a screen whose whole job is legibility of status, not map immersion.

**Map contents: driver marker, pickup pin, dropoff pin, and the customer's own location dot — always shown, all lifecycle states, no trail** (trail already ruled out by ticket 07). The customer's own dot is kept even after pickup when it's redundant with the dropoff pin, since it's the only way to visually confirm the driver is closing in given no route/trail is drawn.

**Camera: continuous follow of the driver marker, with any manual pan/pinch immediately dropping follow mode and surfacing a "Re-center" button.** Standard pattern (Uber/DoorDash); implementable via Mapbox's `onCameraChanged` gesture-origin flag to distinguish programmatic moves from user touches.

**Progress without ETA: three-part combination —** a plain-language status label, a **hero straight-line (haversine) distance number** to the next waypoint (labeled honestly as straight-line, not route distance — no routing engine exists per ticket 02's ETA exclusion), and a compact 4-step stepper (Preparing → Assigned → Picked up → Delivered) as a persistent anchor. Haversine is a trivial client-side computation (no network cost), computed alongside the existing `interpolatePosition` tweening.

**Staleness rendering (ticket 07's three tiers, applied to this screen):** at Stale, the hero distance and stepper freeze in lockstep with the frozen marker — no part of the UI implies freshness the marker doesn't have. At Lost (>3min), the marker is **ghosted** (reduced opacity, stays at last known position) rather than removed, with a "Last seen Xm ago" banner — disappearing entirely reads as "driver vanished," which is scarier and less informative.

**Lifecycle states beyond in-transit:** Unassigned renders a **map-less status card** ("We're getting your order ready" + stepper), not a pins-only map — avoids a map that looks broken with no driver on it. Delivered swaps to a confirmation view. Cancelled is a separate terminal message state. All three keep the same screen shell (topbar/stepper conventions) so the transition into/out of live tracking isn't jarring.

**Driver contact: tap-to-call using the driver's real phone number** (`tel:` link), not masked/proxied calling. Accepted trade-off: exposes the driver's personal number to the customer, which is a real privacy/HR concern for employees — but masked calling requires a telephony integration (Twilio-style number proxying) explicitly out of scope for an MVP demo built to show three surfaces working together, not add a fourth external integration. Worth flagging as a post-MVP hardening item if this ships beyond a demo.

## Comments

Surfaced while resolving ticket 10 (location history and retention): consider adding a **connector line between the driver's current position and the delivery's dropoff pin** on the map. This is not a historical trail — both endpoints are already live data (driver position from ticket 06/07's feed, dropoff coordinates from the Delivery record) — so it doesn't reopen this ticket's "no trail" call. It would visualize the same straight-line distance already shown as the hero number, just as a line too. Not yet decided; revisit if this ticket is reopened for any other reason, or fold into a future prototype pass.
