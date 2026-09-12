# Driver location permission onboarding

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

How does the driver app ask for location permission, and what does it do when the driver says no, or says "While Using" and never upgrades?

Graduated from fog by ticket 03, which established that permission is not a one-shot dialog but a sequence with several ways to silently fail.

Settle:

- The iOS two-stage reality: iOS 13+ will not grant Always from a single prompt. The app gets When In Use first, and a deferred "Change to Always Allow" system prompt appears days later. Decide what the app does in the interim, how it detects the downgrade, and how it chases the upgrade without nagging.
- The pre-permission explanation screen: what the driver is told before the system prompt appears, given a denial is effectively permanent (recoverable only through Settings).
- Android's obligations: the persistent foreground-service notification is non-negotiable and visible all shift — decide what it says. Plus the separate `ACCESS_BACKGROUND_LOCATION` request and the OEM battery-optimisation exemption prompt on Huawei / Xiaomi / OnePlus / Samsung.
- Degraded-mode behaviour: can a driver work a job with location denied, or is it a hard block? A hard block is operationally severe; a soft one means dispatch and customers silently lose tracking, so the dispatcher console must surface it either way.
- The store-review justification copy — the same explanation serves the driver and the reviewer, and ticket 03 flags background location as among the most-rejected permissions.
- `pausesLocationUpdatesAutomatically` must be set to `false` explicitly. Core Location never resumes itself once it pauses. This is a spec-level note, not a preference.

Related: the shift-model question in the map's fog. Ticket 03 recommends scoping tracking to an **active job** rather than the working day, which if adopted makes this onboarding a per-shift or per-job concern rather than a one-time install-time one.

## Reassessed by ticket 20

Two changes now that the driver app is **permanently internal**, on **company-owned MDM Android devices**, with an **Android-only MVP**:

1. **Store-review reasoning is deleted for MVP scope.** The "store usage-description" discipline, the "contextual enough to survive App Store review" timing rationale, and the most-rejected-permission worry no longer apply to the driver binary. Keep a clear in-app explainer (good product), but it answers to no reviewer. The Android foreground-service notification, the Always requirement, and runtime downgrade detection all **stand** — OS-imposed, not store-imposed.
2. **MDM provisions what it can; the app keeps the runtime safety net.** First-run permission acquisition and OEM battery-optimization exemption should move to one-time MDM provisioning where Android allows it — **how much actually deletes hangs on research ticket 18**, especially whether `ACCESS_BACKGROUND_LOCATION` is MDM-grantable. Runtime downgrade detection + the dispatcher flag stay regardless (a granted permission can still be revoked/battery-killed).

**Deferred, not deleted:** the entire iOS two-stage Always flow and the `CLBackgroundActivitySession` note remain in the spec as a post-MVP fast-follow. Below is the full (both-platform) design; MVP builds the Android path, informed by ticket 18.

## Answer

**Hard block**: a driver cannot be assigned, or start, a job without **Always** location permission granted — When-In-Use alone is insufficient, since background tracking (the point of the chosen library) stops the moment the app backgrounds, producing a silent gap dispatch and the customer would believe was live tracking.

**Request timing**: asked upfront at first login/onboarding — not deferred to first job assignment — and re-verified at first job assignment. Contextual enough to survive App Store review (tied to the driver role, not a bare login screen with no explanation), without leaving permission unresolved until a job is already on the line.

**iOS two-stage flow**: the system prompt can only grant When-In-Use on first ask (iOS 13+ constraint). Immediately after that grant, the app deep-links straight to Settings (`Linking.openSettings()`) with visual guidance to flip Location to Always — it does **not** wait for Apple's own deferred "Change to Always Allow?" system prompt, since that fires on Apple's timing (sometimes days later) and every day spent waiting is a day the driver can't be scheduled under the hard-block rule above.

**Downgrade detection (mid-shift)**: detected via the location library's native authorization-change listener (`onProviderChange` per ticket 03's research), not polling — so a downgrade is caught even while backgrounded. An active `Picked up` Delivery is **never yanked or force-completed** when this fires — that would strand a job with product already in the driver's van. Instead: an unmissable in-app alert plus a push notification (ticket 12's pipeline) tells the driver tracking has stopped and Always must be restored before further assignment; the dispatcher console is flagged in real time, distinct from ordinary staleness (ticket 07's Live/Stale/Lost states can't tell "signal gap" from "permission revoked," so this needs its own signal). Only forward-looking actions (new job assignment) are blocked — completing the current job (`Delivered`, proof-of-delivery per ticket 11) is unaffected, since it doesn't depend on live location.

**Android — amended by ticket 18's research:** since the fleet is company-owned and fully-managed (Device Owner/COBO — ticket 20), first-run permission acquisition mostly disappears rather than being requested in-app.

- `ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION` are **pre-granted by MDM policy** (`PermissionPolicy: GRANT` in the enrollment policy, sensors opt-out extra left unset) before the driver ever opens the app — **no interactive prompt, no explanation screen for these two permissions.** The app's onboarding step becomes a **silent verification** that the grant took (defensively — a community report suggests occasional first-boot ordering issues worth checking empirically on pilot handsets), not a request.
- The **OEM battery-optimisation exemption** (Xiaomi/Huawei/OnePlus/Samsung) has no MDM policy lever at all — it stays a manual, per-OEM screen, but **moves off the driver's onboarding entirely and onto the provisioning/kitting checklist**: walked once per handset before it's handed to a driver, not asked at login.
- **Downgrade detection, the dispatcher flag, and the foreground-service notification (below) are unchanged** — a pre-granted permission is still a revocable default, and MDM has no lever over the foreground-service notification in either direction (confirmed OS-mandated, cannot be suppressed or forced non-dismissible).
- New product question surfaced by this research, not yet decided: on Android 14+, the driver can swipe away the tracking foreground notification even with `setOngoing(true)` set (a 2026 OS behavior change with no generic enterprise exception) — whether dismissing the notification should also stop location capture (they share one foreground service) is unresolved; noted here for a future ticket, not blocking MVP.
- The old "requested proactively, bundled into onboarding" framing above described the **pre-ticket-18 design** and is superseded for Android by this amendment. It still describes the **iOS path** in full (deferred as a post-MVP fast-follow per ticket 20).

**Foreground-service notification**: shown **only while a Delivery is active**, matching ticket 07's active-Delivery-only tracking scope — no notification, no tracking, between jobs. Concrete, named copy identifying the business and the job, e.g. *"[Business name] Courier — Tracking active for delivery #1234"*, tapping through to the driver's current job screen. Vague/generic foreground-service text risks both Play policy rejection and driver mistrust.

**Explanation copy**: a single shared string serves both the in-app pre-permission screen and the literal store usage-description string (`NSLocationAlwaysAndWhenInUseUsageDescription` on iOS; the Play data-safety justification on Android) — not separately authored copy for each audience. Reviewers check that the usage string matches what's shown to the user, and a shared string removes the risk of the two diverging. Core content: location is needed only while on an active delivery, is never tracked outside one, and works even if the app is backgrounded.

**Re-prompt cadence ("chasing without nagging")**: no repeated full-screen interrupt on every cold open. After the first deep-link prompt is dismissed without action, the app backs off to a persistent, low-key banner (e.g. "Location: While Using only — tap to fix"). The full-screen prompt only resurfaces at the moment a blocked action is actually attempted — i.e. when dispatch tries to assign the driver a job, or the driver taps a blocked action themselves — tying the interruption to a visible consequence rather than repeating on a timer.

**Carried forward from ticket 17** (Location library licensing and the when-in-use alternative): `CLBackgroundActivitySession` is not used here — neither the chosen library nor `expo-location` exposes it, and using it would mean owning a custom native Swift module the team isn't currently planning to build. It remains a validated future de-risking path if Always-permission friction becomes an operational problem worth the native-code investment.

`pausesLocationUpdatesAutomatically: false` stands as the settled spec-level fact from the ticket body — Core Location never resumes itself once paused, so this must be set explicitly regardless of the above.

### Amendment — [ticket 34](34-driver-shift-and-availability-model.md)

**The foreground-service notification is no longer Delivery-scoped, and the shared explanation copy
above is now factually wrong and must be rewritten.**

Ticket 34 widened capture to the whole duty period ([ticket 07 amendment](07-location-cadence-staleness-and-client-smoothing.md)).
Two consequences here:

- **Foreground-service notification** runs for the whole duty period rather than "only while a
  Delivery is active." Its copy can no longer name a job (`"…Tracking active for delivery #1234"`),
  since it must also cover an on-duty driver holding nothing. It needs a duty-scoped string, with the
  job-specific variant retained for when a Delivery *is* held.
- **Explanation copy** — this is the important one. The single shared string serving the in-app
  pre-permission screen and the store usage-description currently states that location "is needed only
  while on an active delivery, is never tracked outside one." **That sentence is now false**, and it is
  the sentence a driver reads before granting Always permission. It must be rewritten to the position
  the owner actually chose and can defend to their staff: tracked for the working day between *Start
  work* and *Finish work*, never outside those hours, and **no history of anywhere they have been is
  ever recorded** ([ticket 10](10-location-history-storage-and-retention.md)). The shared-string
  reasoning stands — it is the content that changes, not the decision to share it.

**Unchanged:** the Always-permission **hard block** on assignment. Ticket 34 deliberately made
off-duty a warning rather than a block, and the contrast is intentional — permission is technically
load-bearing, duty is a human signal that can be wrong. Downgrade detection, the dispatcher flag, the
MDM pre-grant path, and the re-prompt cadence all stand.
