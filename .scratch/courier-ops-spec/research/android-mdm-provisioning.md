# Android MDM provisioning for the driver fleet

Research for ticket 18. Answers what Android Enterprise management can pre-provision for the
permanently-internal, company-owned, MDM-enrolled Android driver app, and what still needs
runtime handling in ticket 16's onboarding flow.

## Summary verdict

**Background location IS MDM-grantable — but only on a fully-managed (Device Owner / COBO)
device, and only if the admin doesn't opt out.** This is the load-bearing fact the ticket asked
for, and it resolves in the direction that trims the most from ticket 16: a fully-managed,
company-owned phone with a Device Owner profile can silently pre-grant both
`ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION` with zero interactive prompt, via the
Android Management API's `PermissionPolicy: GRANT`. The commonly-repeated claim that "Android 12+
blocks MDM from auto-granting background location" is true **only for Profile Owner enrollment**
(work profile / BYOD / COPE) — it does not apply to Device Owner (fully managed).

Battery optimization is the opposite story: standard Android Enterprise/Doze whitelisting is not
exposed as a general per-app policy field in the Android Management API at all (no field exists
in `ApplicationPolicy` for it), and even where OS-level Doze exemption is achievable, it does not
reach into the OEM's own battery-management layer (MIUI, EMUI, OxygenOS, Samsung's device care).
That layer sits outside the Android Enterprise policy surface entirely and still needs per-OEM,
often per-device, manual whitelisting.

### Mapped onto ticket 16's Android steps

| Ticket 16 Android step | Verdict |
|---|---|
| Interactive `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION` prompt, bundled into onboarding | **Delete for MVP.** Pre-grant both via Android Management API `PermissionPolicy: GRANT` in the enrollment policy, applied before the driver ever opens the app. No prompt, no explanation screen needed for these two permissions specifically. |
| OEM battery-optimization exemption prompt (Xiaomi/Huawei/OnePlus/Samsung), bundled into onboarding | **Stays, but move from "in-app runtime request" to "one-time provisioning-team task done during device setup/kitting"**, not something the app or driver does at login. Standard Android battery-optimization whitelisting (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) is still a user-facing system dialog even for a Device Owner app — there is no silent DPM/AMAPI equivalent for it — and OEM battery managers need their own manual per-OEM steps regardless. Practically: your MDM/provisioning process should walk each handset through the OEM whitelist screens once, at fleet setup, rather than asking the driver. |
| Foreground-service notification, active-Delivery-only, "[Business] Courier — Tracking active for delivery #1234" | **Stands unchanged.** OS-mandated for any foreground service; MDM has no policy lever to suppress or replace it. Confirmed no change needed. |
| Downgrade detection (mid-shift) + dispatcher flag | **Stands unchanged.** A pre-granted permission is a *default*, not a lock: `PERMISSION_GRANT_STATE_GRANTED` can be revoked by the user or reset by an OS/OEM battery-kill event; the app must still detect and react at runtime. This is unaffected by anything MDM can do — keep it exactly as ticket 16 designed it. |
| Explanation copy / store-review-shared string | Already deleted in ticket 20's reassessment (Android has no store gatekeeper for an internal binary). No further change from this research; the in-app explainer is still good practice for driver trust but is not a permission-flow blocker. |
| Re-prompt cadence, low-key banner escalation | **Stands, but scope narrows.** It no longer needs to cover the *initial* grant of fine/background location (pre-provisioned), only the downgrade-recovery path — i.e., it becomes purely a runtime safety net for revocation/OEM-kill, not part of first-run onboarding. |
| "Asked upfront at first login/onboarding... re-verified at first job assignment" | The *verification* stands (confirm grant state hasn't drifted before assigning a job); the *asking* is deleted since it's pre-provisioned before the device reaches the driver. |

**Net effect on ticket 16 (Android path):** first-run onboarding shrinks from "walk the driver
through two system permission dialogs plus 4 different OEM battery-whitelist screens" down to
"silent verification that MDM's pre-grant took, plus the runtime downgrade-detection safety net."
The OEM battery step doesn't disappear — it moves off the driver's plate and onto the
provisioning/kitting checklist for each handset.

---

## Q1 — Runtime permission pre-grant (the load-bearing fact)

**Finding: Yes for Device Owner (fully managed/COBO), no for Profile Owner (work profile/COPE).**

Primary source — `DevicePolicyManager.setPermissionGrantState` (the API the Android Management
API's `PermissionPolicy: GRANT` wraps), Android Open Source Project javadoc, mirrored verbatim
(CC BY 2.5, attributed to AOSP) at
https://learn.microsoft.com/en-us/dotnet/api/android.app.admin.devicepolicymanager.setpermissiongrantstate
(canonical source: `https://developer.android.com/reference/android/app/admin/DevicePolicyManager#setPermissionGrantState`):

> "NOTE: On devices running `Build.VERSION_CODES#S` and above, control over the following,
> sensors-related, permissions is restricted: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
> `ACCESS_COARSE_LOCATION`, `CAMERA`, `RECORD_AUDIO`, `RECORD_BACKGROUND_AUDIO`,
> `ACTIVITY_RECOGNITION`, `BODY_SENSORS`. ... A profile owner may not grant these permissions
> (i.e. call this method with any of the permissions listed above and `grantState` of
> `PERMISSION_GRANT_STATE_GRANTED`), but may deny them. **A device owner, by default, may
> continue granting these permissions.** However, for increased user control, the admin may opt
> out of controlling grants for these permissions by including
> `EXTRA_PROVISIONING_SENSORS_PERMISSION_GRANT_OPT_OUT` in the provisioning parameters. In that
> case the device owner's control will be limited to denying these permissions."

This is unambiguous: **fully-managed / company-owned devices (Device Owner mode — what COBO
provisioning produces) can auto-grant `ACCESS_BACKGROUND_LOCATION` with no interactive prompt**,
as long as the enrollment/provisioning flow doesn't set the sensors opt-out extra. The restriction
that gets cited in most blog posts and forum threads ("Android 12+ won't let MDM auto-grant
background location") is real but scoped to **Profile Owner** — i.e., BYOD work-profile or
COPE (corporate-owned, personally enabled) enrollments, not fully-managed/COBO.

Corroborating primary source — the Android Management API's own JSON schema (fetched directly
from the live API discovery document at
`https://androidmanagement.googleapis.com/$discovery/rest?version=v1`, which defines
`enterprises.policies`'s `ApplicationPolicy.permissionGrants[].policy` field):

> `PermissionPolicy` enum, value `GRANT`: **"Automatically grant a permission. (Note: certain
> sensor permissions on Android 12+ only work on fully managed devices)"**

That parenthetical is Google confirming, in the API's own reference documentation, exactly the
Device-Owner-only carve-out above.

**Implication for the driver fleet**: since these are company-owned handsets provisioned as
fully-managed devices (this is the correct/intended enrollment mode for a dedicated-purpose
courier phone anyway — see Q5), set the enrollment policy's `applications[].permissionGrants` to
`GRANT` for `android.permission.ACCESS_FINE_LOCATION` and
`android.permission.ACCESS_BACKGROUND_LOCATION` (and `ACCESS_COARSE_LOCATION` for completeness).
Do **not** set the sensors-permission-grant opt-out extra during provisioning. Both permissions
then arrive already granted the first time the driver app launches.

Caveat found in the wild (not primary-sourced, carried as uncertainty): a Microsoft
Intune/Android-Enterprise community thread reported that after deploying an app-config auto-grant
policy to Android 13 devices, background location still showed "don't allow" until the user
manually accepted the prompt once
(https://techcommunity.microsoft.com/discussions/microsoft-intune/auto-grant-location-permissions-for-intune-android-application/4116945).
This is plausibly an ordering/timing bug (policy applied after first app launch, or a Profile
Owner enrollment rather than Device Owner) rather than a contradiction of the documented behavior,
but it's a real-world report worth validating on the actual pilot handsets before relying on it
for launch — treat "pre-grant works" as the documented default, verify empirically during
device kitting rather than assuming it silently on day one.

## Q2 — Battery-optimization / Doze exemption

**Finding: Standard Android Enterprise policy has no general-purpose per-app battery-optimization
field, and even OS-level Doze whitelisting doesn't reach OEM battery managers.**

- The Android Management API's `ApplicationPolicy` schema (same discovery-document fetch as
  above) has no field for battery optimization, Doze, or power exemption. The only
  battery-adjacent field in the whole `Policy` resource is device-wide `stayOnPluggedModes`
  (keeps the screen on while charging) — unrelated to per-app Doze exemption.
- The one AMAPI mechanism that does touch background/power restrictions is **application
  roles** (https://developers.google.com/android/management/app-roles): assigning the "Mobile
  Threat Defense" (MTD) role to an app exempts it from the App Standby Bucket / background
  restrictions and protects it from user force-stop and data-clear, on any AMAPI-managed
  (fully managed or otherwise) device. This is a narrow, security-tool-shaped role, not a
  general "exempt my app from battery optimization" switch — but it is the closest thing AMAPI
  exposes, and worth evaluating for the driver app if Google permits assigning MTD to a plain
  courier app (unclear; the role is documented for threat-defense software specifically).
- The standard OS-level Doze exemption API, `Intent.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`,
  is a **user-facing system dialog by design** — there is no Device Owner/DPM call that silently
  flips `PowerManager.isIgnoringBatteryOptimizations()` to true the way `setPermissionGrantState`
  does for runtime permissions. Google intentionally kept this one interactive even for
  device-owner apps (Android developer reference for
  `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, https://developer.android.com/reference/android/provider/Settings#ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).
- OEM battery managers (Xiaomi/MIUI "autostart" list, Huawei/EMUI "PowerGenie"/protected apps,
  OnePlus/OxygenOS battery optimization, Samsung Device Care "sleeping apps") are proprietary
  layers on top of AOSP, outside the Android Enterprise policy surface. Standard Doze whitelisting
  does not override them. This tracks what ticket 03's research already established, and nothing
  in the Android Enterprise/AMAPI documentation contradicts it — these OEM screens are not
  primary-sourced by Google at all (unsurprising, since they're not part of AOSP), and remain
  manual, per-OEM, done-once-at-kitting steps.

**Practical conclusion**: there is no MDM policy that makes the OEM battery-kill problem
disappear. The mitigation is operational, not technical: since this is a small, company-owned
fleet, walk each handset through its OEM's battery-whitelist screen once during device kitting
(before handing the phone to a driver), rather than trying to solve it in software or asking the
driver to do it. This is exactly what ticket 16 already proposed for the driver-facing flow; the
new information is that it belongs in the *provisioning* checklist, not the *app's onboarding UI*.

## Q3 — Foreground-service notification

**Finding: confirmed OS-mandated, cannot be suppressed by MDM.**

- A foreground service of any kind must show a status-bar notification
  (https://developer.android.com/develop/background-work/services/foreground-services): "Foreground
  services show a status bar notification, to make users aware that your app is performing a task
  in the foreground and is consuming system resources." Declaring `location`-typed
  `foregroundServiceType` (mandatory from API 34) does not create an exception to this.
- Whether the notification can be *dismissed* by the driver (not suppressed by MDM — a separate
  question) is entirely an app-code decision (`Notification.Builder#setOngoing(true)` /
  `FLAG_ONGOING_EVENT`), not an MDM policy lever in either direction. Android 14's official
  behavior-changes doc (https://developer.android.com/about/versions/14/behavior-changes-all)
  states plainly that `FLAG_ONGOING_EVENT` notifications became user-dismissable in Android 14 in
  general, with listed exceptions that do **not** include a generic "MDM-managed app" carve-out —
  the exceptions are `CallStyle` notifications, DPC/enterprise-support-package notifications,
  media notifications, and the default search-selector package. A courier tracking notification
  doesn't qualify for any of those, so on Android 14+ the driver could, in principle, swipe the
  tracking notification away even with `setOngoing(true)` set — this is an OS behavior change the
  app has no MDM-side control over.
- Net for the ticket: nothing in Android Enterprise/AMAPI gives MDM any lever over this
  notification's presence or content — it stays exactly as ticket 16 designed it (active-Delivery-only,
  named copy). Worth noting as a fresh finding, not previously flagged: on Android 14+ stock, the
  driver can dismiss the notification via swipe regardless of `setOngoing`, which is a product
  question (does dismissing the notification also stop location capture, given they're tied to
  the same foreground service?) worth a follow-up note in ticket 16/03 rather than something MDM
  can fix.

## Q4 — Private-app distribution mechanism

Two real options, plus a third that emerged mid-2025 and changes the calculus.

### A. Managed Google Play private app (iframe / Play Custom App Publishing API)

- **Developer account**: none needed upfront. Per Google's own support docs
  (https://support.google.com/googleplay/work/answer/9146439 and
  https://support.google.com/googleplay/work/answer/9495634): "Managed Google Play automatically
  creates a Play Developer account on behalf of your organization" the first time you publish
  through the iframe, with the standard $25 registration fee waived.
- **Signing**: uploading via the iframe defaults to Google-managed Play App Signing — "Google will
  generate and manage the signing key for the app." You can retain your own upload key by
  enrolling in Play App Signing through the full Play Console first, but the iframe's zero-setup
  path hands key custody to Google.
- **Updates**: pushed the same way as any managed Google Play app — upload a new build through the
  iframe/Console, and it propagates through the standard managed-Play update channel to enrolled
  devices; Google states most private-app publishes are live for distribution "within 10 minutes."
- **Limits/caveats**: private apps published this way "aren't subject to the same checks as other
  apps... can't be converted to public apps," are non-transferable to another developer account,
  and are capped at 15 private-app uploads/day (a non-issue at courier-fleet scale).
- The **Play Custom App Publishing API** (https://developers.google.com/android/work/play/emm-api/private-apps)
  is the same underlying mechanism exposed as a REST API for EMMs to automate instead of using the
  iframe by hand — "only compatible with Google-hosted private apps," same can't-go-public
  restriction. Irrelevant unless you're building your own EMM console (see Q5) rather than using a
  vendor's.

### B. Direct APK push through the EMM (no Google Play involved)

- Historically the domain of third-party EMMs with their own agent (Scalefusion, Headwind, etc.),
  which upload a signed APK/AAB to their own console and push installs to devices outside managed
  Google Play entirely. No Play developer account needed at all; you sign the APK yourself with
  your own keystore, full custody.
- **New primary-source finding**: as of SDK 1.6.0-rc01, the Android Management API itself added
  native support for this — "Manage custom apps with AMAPI"
  (https://developers.google.com/android/management/manage-custom-apps): "As an Android
  Management API based EMM, you can remotely manage custom applications on devices" via direct
  APK installation, **but "the functionality is only supported in fully managed devices"** and
  requires integrating an AMAPI-SDK "extension app" plus issuing install commands via
  `LocalCommandClient`. The policy still declares the app's `signingKeyCerts` so the API can
  detect `APP_SIGNING_CERT_MISMATCH`. This is new (mid-2025) and not yet reflected in most
  third-party blog commentary, but it means "skip Google Play, push a signed APK" is now also
  achievable on Google's own free API, not just proprietary EMMs — if your EMM/tooling has adopted
  this SDK version.
- **Updates**: entirely your own responsibility — new APK, new install command, no store review,
  no staged rollout tooling unless your EMM console provides one.

### Recommendation

**Use managed Google Play private-app distribution (option A), not direct APK push.** For a
five-to-a-dozen-handset internal fleet, the iframe path costs nothing to set up (no developer
account friction, Google waives the fee), needs no extra SDK integration work, and gives you
Play's existing update-propagation and device-targeting machinery for free. Direct APK push (via
AMAPI's new custom-app path or a third-party EMM's proprietary agent) only earns its keep if you
specifically want to avoid Google Play entirely — e.g., you never want the app associated with a
Play Console at all, or you're already deep in a non-Google EMM's proprietary tooling. Neither
applies here: the driver app has no store-review exposure either way (it's a private/internal
listing, not public), so "avoid Play" buys nothing except giving up Play's free update
distribution and taking on your own signing/version-rollout responsibility. Keep your own upload
key (enroll in Play App Signing rather than taking the iframe's zero-setup default) so you're not
dependent on Google's generated key for future re-signing/migration flexibility — a small one-time
setup step, not a reason to avoid the iframe path altogether.

## Q5 — Tier and tooling

**Finding: fully-managed (Device Owner / COBO) enrollment is required — not optional — because
it's the only tier that unlocks the Q1 permission pre-grant. Google's own Android Management API
is sufficient in capability; the open question is only whether you want to build your own EMM
console against it or buy a small/free third-party console that already wraps it.**

- **Fully-managed vs. work-profile**: work-profile (Profile Owner) enrollment is explicitly the
  mode where `setPermissionGrantState` **cannot** grant the sensor permissions (Q1's primary
  source). Since background location pre-grant is the whole point of this ticket, work-profile
  enrollment is off the table regardless of any other consideration — these are single-purpose,
  company-owned handsets anyway, so fully-managed/COBO (no personal profile, no consumer Play
  Store) is both the only enrollment that gets you the pre-grant and the natural fit for a
  dedicated courier device.
- **Does Google's own API suffice?** Capability-wise, yes — everything found above
  (`PermissionPolicy: GRANT` for background location, private-app distribution via managed Play,
  the new AMAPI custom-app APK path) is native to the Android Management API; nothing here
  requires a third-party EMM's proprietary feature. The catch, confirmed by Google's own developer
  guide (https://developers.google.com/android/work/dev-options,
  https://developers.google.com/android/management/existing-emms): **the Android Management API
  is a raw REST API for building an EMM, not a ready console** — "you supply your customers with
  an on-premise or cloud-based EMM console" that calls the API in the backend. There is no
  Google-hosted UI where you log in and manage a handful of phones directly against AMAPI; you (or
  a vendor) must build or already own a console on top of it.
- **Third-party EMM warranted?** For a handful of delivery handsets, building a console yourself
  against raw AMAPI is disproportionate engineering (an OAuth/service-account backend, an admin
  UI, enrollment-token generation, policy JSON authoring). A small/free-tier third-party EMM that
  already wraps AMAPI (several vendors, including free/open-source options like Headwind MDM,
  fit a handful-of-devices fleet) is the proportionate choice — it's console-first, no
  custom backend to build or run, and every capability found in this research (permission
  pre-grant, managed-Play distribution, or the newer custom-APK path) is exposed through the
  vendor's UI rather than requiring you to write API calls. Reserve Esper-class tooling (built for
  fleets of dedicated/kiosk devices at real scale, with per-second telemetry and remote-control
  features) for if/when the fleet grows well past "a handful" — it's not proportionate here.

**Bottom line for the spec**: enroll handsets as fully-managed/Device-Owner (COBO); manage them
through a small third-party EMM console (not a from-scratch AMAPI integration) that supports
setting `PermissionPolicy: GRANT` for `ACCESS_FINE_LOCATION`/`ACCESS_BACKGROUND_LOCATION` and
managed Google Play private-app distribution — both are table-stakes features in any AMAPI-based
console, so this doesn't narrow the vendor list much. Confirm the specific vendor exposes the
permission-grant-state policy in its UI (some consoles surface only a subset of AMAPI's policy
schema) before final vendor selection.

## Sources

- `DevicePolicyManager.setPermissionGrantState` (AOSP javadoc, mirrored CC BY 2.5): https://learn.microsoft.com/en-us/dotnet/api/android.app.admin.devicepolicymanager.setpermissiongrantstate?view=net-android-35.0 (canonical: https://developer.android.com/reference/android/app/admin/DevicePolicyManager)
- Android Management API discovery document (live schema fetch): `https://androidmanagement.googleapis.com/$discovery/rest?version=v1`
- Android Management API — `enterprises.policies` reference: https://developers.google.com/android/management/reference/rest/v1/enterprises.policies
- Android Management API — application roles (MTD power/background exemption): https://developers.google.com/android/management/app-roles
- Android Management API — managing custom (non-Play) apps / direct APK install: https://developers.google.com/android/management/manage-custom-apps
- Android Management API — building vs. buying an EMM console: https://developers.google.com/android/work/dev-options, https://developers.google.com/android/management/existing-emms
- Managed Google Play — publish private apps from an EMM console: https://support.google.com/googleplay/work/answer/9146439, https://support.google.com/googleplay/work/answer/9495634
- Google Play EMM API — Custom App Publishing API for private apps: https://developers.google.com/android/work/play/emm-api/private-apps
- Foreground services overview: https://developer.android.com/develop/background-work/services/foreground-services
- Android 14 behavior changes (dismissible foreground-service notifications, exception list): https://developer.android.com/about/versions/14/behavior-changes-all
- `Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (user-facing dialog, no silent DPM equivalent): https://developer.android.com/reference/android/provider/Settings

### Not primary-sourced (carried as uncertainty)

- The Intune/Android-Enterprise community report of background-location auto-grant not taking
  effect on Android 13 until the user manually accepted once — plausibly a Profile Owner/ordering
  issue, not verified against Google's own documented behavior; validate empirically on pilot
  handsets rather than assuming pre-grant always applies cleanly on first boot.
- Whether a plain courier/tracking app can legitimately be assigned the AMAPI "Mobile Threat
  Defense" role for battery-restriction exemption, or whether Google restricts that role to actual
  security software — not found in the documentation surveyed.
- OEM battery-manager behavior (MIUI/EMUI/OxygenOS/Samsung specifics) is, as ticket 03 already
  noted, not documented by Google at all; nothing in Android Enterprise policy reaches it, and the
  exact per-OEM whitelist steps still need to be verified against the specific handset models
  chosen for the fleet.
