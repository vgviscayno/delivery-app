# Transistorsoft `react-native-background-geolocation` — debug-build licensing for the Android pilot

## Verdict

**Yes** — the Android MVP pilot can run fully unlicensed on Expo dev/debug builds. Transistorsoft's SDK is explicitly documented as "fully functional in DEBUG builds" with no key, no watermark, no time limit, and no feature degradation. The only visible side effect is a harmless `LICENSE VALIDATION FAILURE` log line, which the docs say to ignore in debug.

**Exact trigger for the $399 becoming due:** the license is enforced when the Android build runs a **non-debug (`release`-type) Gradle variant** — i.e. `BuildConfig.DEBUG == false` at the build-type level, not the app's distribution channel or signing identity. Concretely: the moment you `assembleRelease`/`bundleRelease` (or any custom build type that isn't the debug variant — see the "Other Build types" caveat under Q2), the SDK requires a valid, `applicationId`-matched license key in `AndroidManifest.xml` or the app crashes/fails validation. There is no internal-distribution or non-store carve-out (Q5) — a fleet-internal release build owes the license exactly like a Play Store build, because enforcement is keyed to build type, not distribution channel.

**Android-only-now costs no more than buying both later:** confirmed. The $399 Starter tier is a single per-app-identifier purchase that includes **both** an iOS and an Android license key; you self-generate only the Android key today from the Customer Dashboard and generate the iOS key later at zero extra cost, at the same $399, as long as it's the same app identifier and tier.

---

## Q1 — Debug-build behavior

**Finding:** Fully functional, no license required, no watermark/time-limit/degradation — only a benign log warning.

- [`help/INSTALL-EXPO.md`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/help/INSTALL-EXPO.md) (Transistorsoft's own Expo setup guide, in the repo): *"If you've **not** [purchased a license], the plugin is fully functional in **DEBUG** builds so you can try before you [buy]."*
- [`help/INSTALL-ANDROID-AUTO.md`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/help/INSTALL-ANDROID-AUTO.md): under the `AndroidManifest.xml` license step: *"If you've not purchased a license, **ignore this step** — the plugin is fully functional in DEBUG builds so you can try before you buy."*
- [FAQ — docs.transistorsoft.com/help/faq/](https://docs.transistorsoft.com/help/faq/): *"The plugin is also fully functional in debug builds without any key, despite the validation warning messages."* The FAQ frames the `LICENSE VALIDATION FAILURE` message that appears in debug logcat as expected/non-blocking — it is a warning, not an enforcement action.

No source describes a nag dialog, watermark, or time-boxed trial for debug builds — the only cost is a log-level warning.

## Q2 — Enforcement trigger

**Finding:** Enforcement is tied to the Android **build type** (debug vs. everything else), not to signing config, store distribution, or `minifyEnabled` directly — though `minifyEnabled`/Proguard is operationally linked because it's normally only turned on for `release`.

- [`help/INSTALL-ANDROID-AUTO.md`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/help/INSTALL-ANDROID-AUTO.md) shows the standard RN `build.gradle` template with `minifyEnabled` set inside the `release { }` block, and the license `meta-data` step immediately below it explicitly gated on "if you've not purchased a license, ignore this step — fully functional in DEBUG builds." This ties the license requirement to whichever build type is *not* debug (i.e., `release`), and the Proguard rule inclusion is coupled to that same release-only `minifyEnabled` flag.
- The exact failure mode in a non-debug build with **no key**: the [FAQ](https://docs.transistorsoft.com/help/faq/) and the [License Validation Failure wiki](https://github.com/transistorsoft/cordova-background-geolocation-lt/wiki/License-Validation-Failure) describe a `LICENSE VALIDATION FAILURE` reported by the SDK; in release builds this is enforcement, not just a warning — GitHub issue reports (e.g. [#1676](https://github.com/transistorsoft/react-native-background-geolocation/issues/1676), [#828](https://github.com/transistorsoft/react-native-background-geolocation/issues/828)) corroborate that a missing/mismatched key on a release-type build blocks correct SDK operation (validation failure state), consistent with Transistorsoft's own framing that only DEBUG builds get the "fully functional without a key" pass.
- Important edge case for custom build types: [Issue #874, "Android - Other Build types license validation fails"](https://github.com/transistorsoft/react-native-background-geolocation/issues/874) shows that a **custom** build type (e.g., a `releasestaging` type with `applicationIdSuffix` and `matchingFallbacks = ['release']`) that is not literally the `debug` variant also fails license validation — i.e., the "try before you buy" allowance is specifically for the `debug` build type, not for "anything non-production" or "anything not submitted to a store." Any build type other than `debug` is treated as needing a valid key. This directly answers Q5: there is no distribution-channel carve-out — the gate is build-type-based (debug vs. not-debug), so an internal/fleet release build is licensable exactly like a store release.

## Q3 — Expo dev build specifics

**Finding:** Yes — an Expo development build (dev client), built the standard way, resolves to the Android `debug` Gradle variant, so the debug-build deferral holds.

- Transistorsoft's own [`help/INSTALL-EXPO.md`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/help/INSTALL-EXPO.md) gives the "fully functional in DEBUG builds" note directly in the Expo setup instructions (not just the bare-RN doc), and its rebuild instructions cover both `npx expo run:android` (local) and `eas build --profile development` (cloud) as the two ways to produce a dev-client build — treating both as the same "try before you buy" scenario.
- `npx expo run:android` builds the Android `debug` variant by default (standard Expo/React Native CLI behavior; no separate confirmation needed beyond Transistorsoft's doc treating it as the DEBUG case).
- For EAS cloud builds, the load-bearing fact is in Expo's own `eas.json` schema reference ([docs.expo.dev/eas/json/](https://docs.expo.dev/eas/json/)), under the `developmentClient` field: *"developmentClient (boolean) - If set to true (defaults to false), this field will produce a development build... **Note: this field is for setting the gradleCommand to `:app:assembleDebug` for Android** and buildConfiguration to Debug for iOS. If these fields are provided for the same build profile, [gradleCommand/buildType] will take precedence over developmentClient."*
- The default `eas.json` Expo generates via `eas build:configure` (per [docs.expo.dev/build/eas-json/](https://docs.expo.dev/build/eas-json/)) is:
  ```json
  { "build": { "development": { "developmentClient": true, "distribution": "internal" }, "preview": { "distribution": "internal" }, "production": {} } }
  ```
  This profile sets no explicit `gradleCommand`/`buildType`, so `developmentClient: true` is what drives the build to `:app:assembleDebug` — the Android `debug` variant. This matters because the *general* EAS default (documented at [docs.expo.dev/build-reference/android-builds/](https://docs.expo.dev/build-reference/android-builds/)) for gradleCommand with no overrides at all is `:app:bundleRelease` (a **release** artifact) — it is specifically the `developmentClient: true` flag on the `development` profile that overrides that general default down to `assembleDebug`.
  - **Caveat worth flagging in the spec:** if the team ever hand-edits the `development` profile to set its own `gradleCommand` or `buildType` (e.g., to produce an `.apk` some other way) without realizing `gradleCommand`/`buildType` "takes priority over ... developmentClient," they could silently flip the pilot onto a release-type Gradle task and trip the license gate. As long as the stock, un-overridden `development` profile is used, the deferral holds.

## Q4 — Android key mechanics

**Finding:** Confirmed on both counts — `applicationId` binding, and no added cost for generating the Android key alone now.

- `applicationId` binding: [FAQ](https://docs.transistorsoft.com/help/faq/): *"You need to generate one key bound to your Android `applicationId`"* (found in `android/app/build.gradle`), and *"Keys are bound to the applicationId they were generated for and cannot be changed."* The FAQ also notes the key auto-permits common non-prod suffixes on that base id: `.dev`, `.development`, `.staging`, `.stage`, `.qa`, `.uat`, `.test`, `.debug` — custom suffixes beyond that list require emailing `info@transistorsoft.com` with the order number.
- iOS binding, for symmetry: the iOS key binds to `bundleIdentifier` the same way (`help/INSTALL-EXPO.md`, `Info.plist` → `TSLocationManagerLicense`).
- Cost/bundling: [FAQ](https://docs.transistorsoft.com/help/faq/): *"A single license unlocks both iOS and Android keys for one app identifier"* — you generate them separately per platform from the Customer Dashboard whenever you need them, but the Starter purchase (**$399.00**, confirmed on [shop.transistorsoft.com/products/react-native-background-geolocation-premium-license](https://shop.transistorsoft.com/products/react-native-background-geolocation-premium-license), tiers: Starter $399 / Venture $599 / Pro $749 / Studio $999) already entitles both platform keys for that one app identifier. Generating only the Android key today and the iOS key later is just a matter of when you click "Create License Key" in the dashboard for each platform — it does not require a second purchase or upgrade a tier.

## Q5 — Internal-distribution allowance

**Finding:** No carve-out. A fleet-internal release build owes the license exactly like a store release; enforcement is by build type, not distribution channel.

- The EULA text itself ([shop.transistorsoft.com/products/react-native-background-geolocation/license](https://www.transistorsoft.com/shop/products/react-native-background-geolocation/license)) only distinguishes *who* the software can be redistributed to (it forbids reselling/sublicensing/white-labeling the SDK or keys to third parties: *"Licensee may not sell, resell, sublicense, rent, lease, transfer, or otherwise make available the Software or any license keys to any third party..."*), and separately requires payment of the license fee — it draws no distinction between App Store/Play Store distribution and internal/enterprise (e.g., MDM-sideloaded fleet) distribution.
- The functional gate that actually matters in practice — confirmed in Q2 — is the Android **build type**, not the distribution mechanism: [Issue #874](https://github.com/transistorsoft/react-native-background-geolocation/issues/874) shows that even a custom, never-store-bound build type built for internal use fails license validation once it isn't the `debug` variant. So an MVP fleet release APK, even if it's sideloaded to company-owned devices via MDM and never touches the Play Store, is a non-debug build and requires the key exactly as a Play Store release would.

---

## Sources consulted

- https://github.com/transistorsoft/react-native-background-geolocation/blob/master/help/INSTALL-EXPO.md
- https://github.com/transistorsoft/react-native-background-geolocation/blob/master/help/INSTALL-ANDROID-AUTO.md
- https://docs.transistorsoft.com/help/faq/
- https://docs.transistorsoft.com/react-native/setup/
- https://www.transistorsoft.com/shop/products/react-native-background-geolocation/license (EULA)
- https://shop.transistorsoft.com/products/react-native-background-geolocation-premium-license (pricing tiers)
- https://github.com/transistorsoft/react-native-background-geolocation/issues/874 (custom build-type validation failure)
- https://github.com/transistorsoft/react-native-background-geolocation/issues/1676, #828 (release-build validation-failure reports)
- https://github.com/transistorsoft/cordova-background-geolocation-lt/wiki/License-Validation-Failure
- https://docs.expo.dev/eas/json/ (eas.json schema reference — `developmentClient`, `buildType`, `gradleCommand` fields)
- https://docs.expo.dev/build/eas-json/ (default generated eas.json)
- https://docs.expo.dev/build-reference/android-builds/ (EAS Build default gradleCommand behavior)
