# Driver-app distribution model and MVP platform scope

Type: grilling
Status: resolved
Assignee: agent-session
Blocked by: —
Map: ../map.md

## Question

The driver app was always for employees, but the map still carried a latent assumption that it would eventually be store-published (ticket 08's "no store submission *yet*"), so several closed tickets still pay a store-policy tax. Reassess: if the driver app is *permanently* internal, and if the MVP narrows platform scope, how much complexity comes out — and what must **not** be cut?

Settle: the driver app's distribution model; the device-ownership model that follows from it; MVP platform scope across all three surfaces; which store-review reasoning is deletable vs. which OS/library constraints survive; how permission onboarding splits between device provisioning and the app; and how to keep the reduced MVP forward-compatible with the things being deferred.

## Answer

Settled with the map owner via `/grilling`. This is a **re-scoping** decision; it amends closed tickets 03, 08, 16 (see their pointers) and spawns research tickets 18 and 19.

**1. Driver app is permanently internal.** Never public App Store / Play Store — every driver is an employee. This is a structural fact, not an MVP shortcut, which is what licenses *deleting* store reasoning rather than merely deferring it.

**2. Company-owned, MDM-enrolled devices.** Not BYOD. This is the device model that makes internal iOS distribution tractable (Apple Business Manager) and lets provisioning replace in-app onboarding steps. Company-owned + MDM is the case where "internal" genuinely *reduces* total complexity rather than adding a UDID/expiry treadmill.

**3. MVP is Android-only, across both mobile apps.** Driver app **and** customer app ship Android-only for the MVP; iOS is a deferred fast-follow. **iOS decisions already made are retained in the spec and marked post-MVP — not deleted** (ticket 16's two-stage Always flow, the `CLBackgroundActivitySession` note in ticket 17, and Apple Business Manager distribution). This is the single largest complexity cut: the MVP has one platform's permission + distribution story, and Android is the MDM-friendly one.

**4. Onboarding split — MDM provisions what it can; app keeps the runtime safety net.** Push first-run permission acquisition and battery-optimization exemption onto one-time MDM provisioning wherever the platform allows (Android is the expected big win — pending ticket 18's confirmation, especially whether `ACCESS_BACKGROUND_LOCATION` is MDM-grantable). Keep the app's **runtime downgrade detection** regardless: a pre-granted permission can still be revoked or battery-killed, and dispatch must see it (ticket 16's listener + dispatcher flag stand).

**5. Delete list (driver app only).** Struck as store-imposed and now moot: the store-usage-description discipline and "survive App Store review" rationale (ticket 16), the Play Data Safety declaration, and the Play target-API-36 submission deadline *for the driver binary* (ticket 03). **Retained** as OS/library-imposed, unaffected by distribution channel: Android foreground-service notification, the Always-permission requirement + background-mode entitlement, and the Transistorsoft license for *release* builds (ticket 17). Clean seam: delete what the *store* imposes; keep what the *OS or library* imposes.

**6. Customer app stays public-store; the two-app split survives.** The customer app faces the public, so it remains a Play Store app even in the Android-only MVP. The "two separate binaries" constraint (tickets 03/08) is driven by *Play's* rule that the **customer** app can't request background location — a customer-binary constraint — so making the *driver* app internal does **not** let the two apps merge behind a role switch.

**7. Build the MVP as a forward-compatible subset — so the deferrals are additive, not forks.** Two guardrails keep both the customer-app launch axis (pilot → public) and the platform axis (Android → iOS) as additive layers rather than rewrites:
   - **Distribution:** if the customer-app MVP runs as a controlled pilot, use Play's **closed-testing track** (same app / package / signing key as production — a promotion, not a migration), not a raw self-signed APK sideload. Start the Play developer account + business-identity verification early; it has the longest lead time of any public-launch step.
   - **Domain:** design the Order model so a **payment/settlement status** can be added later as an independent track (mirroring ticket 01's independent prep-status / courier-status tracks), so introducing cash-on-delivery / payment recording doesn't force a lifecycle rewrite.
   The trap is not what a public launch or iOS *adds*, but any core shortcut a "friendly pilot" tempts (hardcoded invited-user list, skipped fail-closed RLS, faked accounts). Build the core to spec and the subset stays forward-compatible.

**Still open (not settled here):**
- ~~Customer-app launch mode — controlled pilot (Play closed testing) vs. public Play launch — is with the client.~~ **Resolved by ticket 21: Option A, controlled pilot.** Payment stays out of scope.
- **How much of ticket 16's Android onboarding actually deletes**, and the driver distribution mechanism → **research ticket 18**.
- **Whether the Android pilot can run Transistorsoft unlicensed on Expo dev builds**, and when the $399 is due → **research ticket 19**.

## Update

The client answered the launch-mode question — see ticket 21.
