# Push notification pipeline

Type: grilling
Status: resolved
Assignee: agent-session
Blocked by: 05
Map: ../map.md

## Question

Which events trigger a push, to whom, and how are pushes delivered?

Both native apps justify their install partly through notifications, so this is not a garnish.

Settle:

- The event list for customers: driver assigned, driver en route, driver approaching, delivered, and whether failed or delayed states notify too.
- The event list for drivers: new assignment above all, plus cancellations and reassignments. A driver who misses an assignment push is an operational failure, so delivery reliability matters more on this side.
- Proximity-triggered notifications ("your driver is 5 minutes away") — attractive, but with ETA out of scope, this can only be distance-based, and the spec should say so plainly rather than imply time.
- Delivery mechanism: Expo's push service versus talking to FCM and APNs directly. Expo's service is dramatically simpler but adds a third-party hop and is coupled to the Expo workflow chosen in ticket 03.
- Token lifecycle: registration, storage against the right identity, refresh, and cleanup when a device or user goes away.
- Permission UX: when each app asks for notification permission. Asking on first launch is the reliable way to get denied.
- User control: can customers mute categories, and are driver assignment pushes non-optional as a condition of the job.
- Whether any notification carries data that should not appear on a lock screen — a delivery address on a lock screen is a small privacy leak.

Blocked on ticket 05 because the platform may provide the trigger mechanism (database hooks, server functions) that fires these.

## Answer

**Delivery mechanism: Expo's push service**, not direct FCM/APNs — consistent with the Expo dev-build workflow chosen in ticket 03.

**Token model:** single `push_token` column on `profiles`, overwritten on each registration. No multi-device support in v1 — a new login on a second device silently displaces push on the first.

**Trigger mechanism:** a Postgres trigger on `deliveries`, firing on `courier_status` UPDATE, calls a Supabase Edge Function that sends via Expo's API. One place this logic lives, regardless of which code path (dispatcher console, driver app) causes the transition — avoids the fail-open risk of an application-code call site being forgotten at a new site.

**Customer events:** `Picked up` and `Delivered` only. No push on `Assigned` (driver-assignment isn't customer-meaningful) or `Cancelled` (rare enough pre-MVP to leave to in-app status / a phone call). **No proximity/"driver is nearby" notification in v1** — it would need a second trigger path off the live position stream (tickets 06/07) rather than the status-change trigger, for uncertain value now that ETA framing is off the table entirely.

**Driver events:** new assignment (`Unassigned → Assigned` naming this driver), and reassignment/cancellation of a Delivery already assigned to them. No push for a free-text dispatcher message — not a concept that exists in the domain model today; would be new scope.

**Reliability:** fire-and-forget via Expo for every push, no receipt-polling or retry infrastructure in v1 — including the driver-assignment push, despite the ticket's framing of a missed one as an operational failure. The mitigation is structural, not a retry loop: the dispatcher console and the driver app's own assignment list are the source of truth, so a missed push degrades to "driver notices late," not "job silently lost."

**Permission UX:** contextual prompts, not a first-launch blanket ask. Driver app requests permission during account setup, before the first shift, with copy explaining assignments arrive this way. Customer app requests it right after a customer places their first Order, when the relevance ("you'll hear when this ships") is self-evident.

**User control:** driver assignment/reassignment pushes are **non-optional** — a denied OS permission is a driver-app health problem the app should flag and re-prompt for, not a silent preference. Customers get **no in-app mute/category controls**; only two events exist for them and OS-level notification settings are sufficient.

**Payload content:** notification bodies are generic — "Your order is on its way," "Your order was delivered," "New delivery assigned" — with no address, customer name, or order contents visible on a lock screen. Full detail lives behind the tap-through into the authenticated app.

**Cleanup:** deactivating a driver (ticket 09's `profiles.active = false` soft-flag) also nulls `push_token` in the same step, so a deactivated driver's lingering device can never receive a job push.
