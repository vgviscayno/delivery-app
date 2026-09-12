# Transistorsoft licensing for an Android debug-build pilot

Type: research
Status: resolved
Blocked by: —
Map: ../map.md
Asset: ../research/transistorsoft-debug-licensing.md

## Question

We want to defer Transistorsoft's `react-native-background-geolocation` license ($399, ticket 17) through the Android MVP pilot by running the pilot on Expo dev/debug builds, paying only once we cut a real signed release build for the fleet. Ticket 17 primary-sourced the "**release** builds require a license" side but did **not** confirm the "debug builds run unlicensed" side — this ticket nails it, because the pilot timeline may bank on not paying yet.

Investigate against Transistorsoft's own licensing docs, FAQ, and the library's Android setup docs:

- **Debug-build behaviour.** Does the library function in Android **debug** builds without a purchased license? Exactly what happens with no key present — does it run fully, log a nag, watermark, impose a time limit, or degrade? Cite the license terms, not forum lore.
- **Enforcement trigger.** At what precise point is the license required — is it strictly `release`/`minifyEnabled`/signing-config gated, or something else? What is the exact failure mode of a **release** build with no valid key.
- **Expo dev build specifics.** Is an Expo **development build** (dev client) a "debug" build for the library's licensing purposes, i.e. does the deferral actually hold for our chosen workflow (ticket 08 ships MVP on Expo dev builds)?
- **Android key mechanics.** Confirm the key binds to `applicationId` (ticket 17) and that generating only the Android key now — deferring the iOS key — carries **no** extra cost, since the Starter tier already bundles both platforms.
- **Internal-distribution allowance.** Is there any license carve-out for internal/enterprise (non-store) distribution, or does a fleet **release** build owe the license exactly like a store release? (Expected: no carve-out — release is release regardless of channel. Confirm.)

Deliver: a plain **yes/no** on "can the Android pilot run unlicensed on Expo dev builds," the exact **trigger** at which the $399 becomes due, and confirmation the Android-only-now path costs no more than buying later. Write findings to `.scratch/courier-ops-spec/research/transistorsoft-debug-licensing.md`.

## Answer

Findings: [`research/transistorsoft-debug-licensing.md`](../research/transistorsoft-debug-licensing.md).

**Yes** — the Android MVP pilot can run fully unlicensed on Expo dev builds. Transistorsoft's own docs state the SDK is "fully functional in DEBUG builds" with no key; the only artifact is a harmless `LICENSE VALIDATION FAILURE` log line, explicitly documented as expected and non-blocking in debug.

- **Exact trigger for the $399:** keyed to the Android **build type** (debug vs. anything else), not signing config or distribution channel. A GitHub issue confirms even a custom non-store build type that isn't literally `debug` still fails validation — so there's **no internal/fleet-distribution carve-out**; a company-internal release build owes the license exactly like a Play Store release.
- **Expo dev build caveat (the one real risk):** the standard, unmodified `development` profile in `eas.json` (the one `eas build:configure` generates) sets `developmentClient: true`, which is precisely what routes the build to `:app:assembleDebug`. If the team ever hand-edits that profile to set its own `gradleCommand`/`buildType`, that override silently takes precedence over `developmentClient` and could flip the pilot onto a release-type Gradle task, tripping the license gate unexpectedly. **Guardrail: keep the stock `development` profile untouched** for the pilot.
- **Cost confirmation:** the $399 Starter tier is a single per-app-identifier purchase entitling both an Android and an iOS key; generating only the Android key now and the iOS key later costs nothing extra — no tier upgrade, no second purchase.

Ticket 17's "release builds require a license" stands unchanged; this ticket only confirms the debug-build side and adds the `eas.json` guardrail.
