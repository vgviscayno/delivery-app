# Android MDM provisioning for the driver fleet

Type: research
Status: resolved
Blocked by: —
Map: ../map.md
Asset: ../research/android-mdm-provisioning.md

## Question

The driver app is now permanently internal, running on **company-owned, MDM-enrolled Android phones**, and the MVP is Android-only (iOS deferred). We settled that MDM should pre-provision whatever the platform allows, leaving the app only a runtime safety net. This ticket establishes what "whatever the platform allows" actually is — it decides both how much of ticket 16's Android onboarding we delete **and** the driver-app distribution mechanism.

Investigate, preferring primary sources (Android Enterprise / Android Management API docs, Google Play managed-distribution docs, the OEM policies where relevant):

- **Runtime permission pre-grant.** Can an Android Enterprise fully-managed device (company-owned / COBO) pre-grant runtime location permissions to a specific app via app permission policy (`setPermissionGrantState` / `PermissionGrant` managed configuration), without an interactive user prompt? Cover `ACCESS_FINE_LOCATION` and — critically — **`ACCESS_BACKGROUND_LOCATION`**: is background location auto-grantable on managed devices, or does Android force interactive user consent for it even under management? This is the single most load-bearing fact, because ticket 16's ugliest Android steps hang on it.
- **Battery-optimization / Doze exemption.** Can MDM policy whitelist the app from Doze / battery optimization, and does that cover the aggressive **OEM battery managers** (Xiaomi/MIUI, Huawei/EMUI, OnePlus/OxygenOS, Samsung) that ticket 03's research named as the top real-world cause of background-location death? Or does the OEM layer sit outside standard Android Enterprise policy and still need per-device manual steps?
- **Foreground-service notification.** Confirm this is OS-mandated for continuous location and **cannot** be suppressed by MDM (ticket 16 assumes it stays — verify, don't assume).
- **Private-app distribution — this is the distribution-mechanism decision.** How you distribute an internal Android app to a managed fleet: managed Google Play private app (via the managed Google Play iframe / Play Custom App Publishing API) vs. pushing a signed APK directly through the EMM. For each: does it need a Play developer account, how do updates propagate, and how does app signing work. Recommend one.
- **What tier/tooling is actually required.** Fully-managed vs. work-profile enrollment; whether Google's own Android Management API suffices or a third-party EMM (Esper, Scalefusion, Headwind, etc.) is warranted for a small meat-shop fleet. Keep it proportionate — this is a handful of delivery handsets, not thousands.

Deliver: a clear split of **pre-provisionable via MDM** vs. **still needs runtime handling**, mapped directly onto ticket 16's Android steps (which delete, which stay); plus a recommended distribution mechanism. If background location turns out **not** to be MDM-grantable, say so plainly — that materially changes how much of ticket 16 survives. Write findings to `.scratch/courier-ops-spec/research/android-mdm-provisioning.md`.

## Answer

Findings: [`research/android-mdm-provisioning.md`](../research/android-mdm-provisioning.md). Ticket 16 amended accordingly.

**Background location IS MDM-grantable — but only on a fully-managed (Device Owner/COBO) device**, confirmed by AOSP's `DevicePolicyManager.setPermissionGrantState` javadoc and the Android Management API's own schema. The oft-repeated "Android 12+ blocks MDM background-location auto-grant" claim is true only for Profile Owner (work-profile/BYOD) enrollment — irrelevant here since these are company-owned, single-purpose courier phones, which are fully-managed by design anyway.

- **Pre-grantable via MDM, no prompt needed:** `ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION`, via `PermissionPolicy: GRANT` in the enrollment policy (sensors opt-out extra left unset). Deletes ticket 16's interactive Android permission dialogs; onboarding becomes silent verification instead of a request.
- **Not MDM-grantable, stays manual:** OEM battery-optimization exemption (MIUI/EMUI/OxygenOS/Samsung) — no field exists in the Android Management API for this, and even the standard OS-level Doze-exemption dialog stays interactive by design, even for Device Owner apps. Moves off the driver's onboarding and onto a one-time provisioning/kitting checklist per handset instead.
- **Unaffected by MDM either way:** the foreground-service notification (OS-mandated, no suppression lever) and runtime downgrade detection (a pre-grant is a revocable default, not a lock).
- **Distribution recommendation:** managed Google Play private-app (iframe), not direct APK push — no developer-account friction, Google's own update propagation, zero extra SDK integration. Retain your own upload key via Play App Signing rather than the iframe's zero-setup Google-managed default.
- **Tooling recommendation:** fully-managed/Device-Owner enrollment (required, not optional — it's the only tier that unlocks the permission pre-grant) managed through a small third-party EMM console wrapping the Android Management API — not a from-scratch AMAPI integration, not Esper-class fleet tooling.
- New unresolved product question surfaced (not blocking MVP): Android 14+ lets the driver swipe away the tracking notification despite `setOngoing(true)`, with no generic enterprise exception — whether dismissing it should also stop location capture is noted in ticket 16 for a future call.
