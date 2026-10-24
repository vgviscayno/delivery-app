# Back to React Native: what the switch from Kotlin un-voids

Research for [ticket 102](https://github.com/vgviscayno/delivery-app/issues/102). Feeds [ticket 103](https://github.com/vgviscayno/delivery-app/issues/103) (Mobile stack reopened again: back to React Native). Modelled on, and the reverse of, the [Native Kotlin audit](native-kotlin-audit.md) ([ticket 51](https://github.com/vgviscayno/delivery-app/issues/51)).

**Researched 2026-10-25.** External facts come from vendor docs, policy pages, and the source, release and registry metadata of the repos involved, read on that date. Anything I couldn't confirm from a first-party source is marked ⚠️ inline and listed again under [Not primary-sourced](#not-primary-sourced).

**This document prices the switch back. It does not pick any React Native sub-choice.** Those calls belong to ticket 103.

The hypothesis under audit, as ticket 103 already settled it: both mobile apps return to React Native, as packages in the one pnpm/Turborepo TypeScript workspace beside `apps/console`, sharing `packages/domain`, `packages/api-client`, `packages/config` and the generated Supabase types. The revert is wholesale to the pre-Kotlin answers (Expo dev builds/EAS, `@rnmapbox/maps`, the Transistorsoft RN plugin, `supabase-js` plus generated types, shared packages). Two Kotlin-era rules are **kept**: mobile reaches Supabase only through a narrow named surface, and anything a customer reads as a statement is worked out on the server. Distribution is unchanged.

---

## Headline

| | |
|---|---|
| **Artifacts audited** | 27 map-level artifacts (21 tickets, the map body, the spec, ADRs 0008 and 0009, README, `CONTEXT.md`) plus 13 build issues that name the stack or are directly blocked by #56 |
| **Restore pre-Kotlin answer as-is** | **11**: tickets 11, 17, 20, 23, 29, 32, 39; `CONTEXT.md`; build issues #60, #61, #81 |
| **Restore with new wording** | **15**: tickets 03, 06, 08, 14, 35, 36, 42, 53; map #45 body; README; build issues #71, #73, #79, #83, #84 |
| **Still needs a decision** | **14**: tickets 02, 09, 12, 19, 38, 46; ADR 0008; ADR 0009; spec #54; build issues #56, #57, #80, #82, #86 |
| **Hard blocker found** | **None.** One new trap for the driver pilot, below (finding 3). |
| **Build issues blocked by #56** | Directly: **#60, #61, #86**. Transitively: **27 of 30**, everything from #60 to #86. Only #57, #58 and #59 are clear of it. |

What the numbers come to:

1. **The `@rnmapbox/maps` risk is back, and it's the same shape as the one that sank `supabase-kt`.** Mapbox's own docs still say the library "is not an official Mapbox product" and that Mapbox "is unable to provide formal support for it". The README still pins the "Call for additional maintainers" thread, open since 2021-09-24. The library is alive: 10.3.11 shipped on 2026-10-20, one of six releases in October. But between 10.3.5 (2026-07-22) and 10.3.6 (2026-10-04) there were 74 days with no release and 3 commits. Ticket 02's tripwire was "stalling for a quarter or more", and this gap came about two weeks short of it. One person, `mfazekas`, has 1,185 commits, and 56 of the 87 since 2026-07-25. ADR 0008 rejected `supabase-kt` for exactly this bus-factor-of-one profile.
2. **Driver token refresh under React Native still depends on JavaScript running, and Transistorsoft's native refresh can't call Supabase Auth directly.** On Android, React Native stops JS timers whenever the host is paused, unless a headless JS task is running (`JavaTimerManager.kt`). A flag to change that was added on 2026-10-22, defaults to `false`, and isn't in any release. `supabase-js`'s auto-refresh is a 30 s `setInterval`, so it doesn't tick in the background. `getSession()` does refresh on demand inside a 90 s margin, though, so a JS handler that Transistorsoft wakes can drive it. Transistorsoft's `AuthorizationConfig` refresh sends an `application/x-www-form-urlencoded` POST. Supabase Auth's refresh grant parses the body **as JSON only**: `json.Unmarshal`, or a 400 `bad_json`. Refresh tokens are single-use with a 10 s reuse window, and reuse outside it revokes the whole session. So ticket 52's "one refresher only" rule still has a reason to exist after the revert.
3. **Ticket 19's licensing answer stands, but ADR 0009's pilot APK doesn't work as written on React Native.** Debug builds still run Transistorsoft unlicensed ("Debug builds work without one"). `eas.json` still routes `developmentClient: true` to `:app:assembleDebug`, and `gradleCommand` still overrides it. The new problem: React Native's Gradle plugin **skips bundling the JS** for `debuggableVariants`, which default to `"debug", "debugOptimized"`. Expo says a debug build "behave[s] like normal React Native project debug builds" and reads from a development server. So "a plain `debug` build pointed at production, sideloaded" (ADR 0009) would open on phones with no Metro to load from. Expo documents a debug build with `expo-updates` switched on (`EX_UPDATES_NATIVE_DEBUG=1`, `gradleCommand: ":app:assembleDebug"`). The RN template documents overriding `debuggableVariants`. Which route, if either, is ticket 103's call.
4. **The re-opened proposals are cheap at this scale.** EAS Update is lawful under Play's interpreter exemption. It's free up to 1,000 MAUs (customers who download an update), and `expo-updates` runs only in release builds by default. Expo push is free, but it's a hop in front of FCM: you upload the FCM V1 key to Expo, and a dead token surfaces only in a **receipt** fetched about 15 min later. That collides with ticket 12's "no receipt-polling" and ticket 46's "`UNREGISTERED` clears the token". Expo SDK 58 (2026-09-29) pins React Native 0.88, and the New Architecture is the only architecture since RN 0.82. Both returning native libraries ship New-Architecture codegen.

---

## 1. The audit

"Restore as-is" means the pre-Kotlin text can come back verbatim (or nothing on the artifact ever changed). "Restore with new wording" means the pre-Kotlin answer comes back, but some wording has to change: a Kotlin-era rule that ticket 103 keeps, a fact that has moved, or a later decision that the old text doesn't know about. "Still needs a decision" means the artifact can't be written until ticket 103 makes one of its calls.

### 1.1 Closed map tickets the Kotlin switch amended

Ticket 51 marked 11 tickets Amend/Void. Ticket 52 then posted Kotlin amendment comments on six more (06, 11, 14, 35, 36, 42). All 17 are audited here.

| # | Ticket | Verdict | What changes (or why nothing does) |
|---|---|---|---|
| 02 | Map provider | **Still needs a decision** | Mapbox, `mapbox-gl`, the shared style JSON and one `interpolatePosition` module all come back as they were. What's open is whether to **accept the risk again** (§2.1). The facts are sharper than in July. Mapbox still disclaims the binding, the maintainer call is still pinned, there was a 74-day release gap just short of the tripwire, and one person carries the repo. Ticket 103 lists this as re-opened. |
| 03 | Background location | **Restore with new wording** | Transistorsoft via the RN plugin on an Expo dev-build/prebuild workflow, through its config plugin, all as before. The comparison with `expo-location` stands. Wording to update: the version (v5.4.0 → **5.8.0**, 2026-10-09; it wraps `tslocationmanager` 4.7.+). Keep the Kotlin amendment's line that Transistorsoft's own HTTP layer posts fixes to ingest and keeps its offline queue, since that's stack-independent and the spec relies on it. *Where its token comes from* follows ticket 09. Cadence, separate binaries and duty scoping stand. |
| 06 | Realtime transport | **Restore with new wording** | Drop "our own Realtime client on Ktor". `supabase-js` covers what the Kotlin client had to build. `realtime-js` channels take `config: { private: true }`, and `SupabaseClient._handleTokenChanged` calls `realtime.setAuth(token)` on `TOKEN_REFRESHED`. `setAuth` pushes `access_token` to every joined channel (source, §2.2). **Keep** "mobile reaches Supabase only through a narrow named surface", which ticket 103 retains. |
| 08 | Monorepo layout | **Restore with new wording** | The pre-Kotlin answer comes back: one pnpm/Turborepo workspace, shared `packages/domain`/`api-client`/`config`, generated types for mobile, no shared mobile UI kit, standalone dispatcher. Wording that has moved since: `packages/map-shared` was never created (the repo has `config`, `domain`, `api-client`, `db`); `packages/config` now holds "backend environment and the constants every surface shares", not ESLint config (Biome, ADR 0011). "Expo dev builds side-loaded for the demo" and "release via EAS Build" are superseded by ADR 0009 and wait on ticket 38's re-asked questions. **Keep** the narrow-surface and server-side-statements rules. The repo-root fixtures directory and the dual Vitest/JUnit apparatus go. |
| 09 | Auth and identity | **Still needs a decision** | The token-refresh paragraph is open. The pre-Kotlin text ("running through the background-geolocation library's periodic JS wake-ups") is **accurate about the mechanism** (§2.2), and ticket 103 lists it as re-opened. Stack-independent and standing: one Auth instance, roles, the RLS `EXISTS` crux, and ticket 43's one-working-day driver session with newest sign-in winning. "Persisted via secure storage": `expo-secure-store` is in Expo SDK 58's bundled modules (~58.0.2); whether it is wired into `supabase-js`'s `storage` is an implementation choice ⚠️ (not checked). |
| 11 | Proof of delivery | **Restore as-is** | The original answer names no queue technology. The Kotlin comment itself called WorkManager "an implementation detail, not a spec change". The RN mechanism for a background upload that survives an app restart isn't chosen anywhere ⚠️ (not researched here; see build issue #71). |
| 12 | Push pipeline | **Still needs a decision** | Expo push service vs. direct FCM HTTP v1, re-opened by ticket 103 (§3.2). The trigger, event lists, fire-and-forget, generic payloads, clear-on-deactivate and ticket 47's third customer event all stand either way. Under Expo, the "`UNREGISTERED` clears the token" rule that ticket 46 layered on top needs a receipt fetch. |
| 14 | Customer tracking screen | **Restore with new wording** | **Keep** the Kotlin amendment's first bullet: labels and progress text come from the server (ticket 103 retains this). Drop "kept in line by shared fixtures": the staleness tiers and distance are again one TypeScript copy shared with the console. The implementation hints go back to rnmapbox's `onCameraChanged` gesture flag and `tel:` via `Linking`. |
| 17 | Licensing and when-in-use | **Restore as-is** | The $399 Starter tier is unchanged today: 1 app identifier, perpetual, 1 year of updates, "unlimited users and devices". The pre-Kotlin `CLBackgroundActivitySession` reasoning ("owning a custom native Swift module") is true again, since there is no Swift app. New since ticket 17, and worth knowing: Transistorsoft now offers "a free 30-day trial license for testing release builds" (setup page). |
| 19 | Transistorsoft debug pilot | **Still needs a decision** | The answer stands: debug runs unlicensed, and the licence keys on build type. The `eas.json` guardrail is still accurate (§2.3). **New:** a React Native debug build doesn't embed its JS, so ADR 0009's sideloaded debug APK needs a way to carry or fetch JS. That's a choice ticket 19 never faced. |
| 20 | Distribution and platform scope | **Restore as-is** | Ticket 103 restores "Android→iOS additive, not forks" **literally**, since iOS is the same codebase again. The Kotlin rewrite (iOS as one more client on an unchanged server contract) becomes redundant. Its "customer-facing text from the server" half survives anyway, through the rule ticket 103 keeps. |
| 23 | Order radius | **Restore as-is** | The original said the store's coordinates live in `packages/config`, and that package exists today for exactly this ("the constants every surface shares", README). The repo-root file and Gradle `buildConfigField` go. |
| 29 | Cart and checkout | **Restore as-is** | "Persisted locally (MMKV/AsyncStorage)." Note: Expo SDK 58's bundled modules list `@react-native-async-storage/async-storage` 2.2.0 and don't list `react-native-mmkv`. That doesn't decide anything, since the ticket names both. |
| 32 | Driver app screens | **Restore as-is** | "A `@rnmapbox/maps` canvas" and "one `interpolatePosition` module… serve a map on both surfaces" are true again. Ticket 43's sign-in/sign-out amendment and ticket 47's Paid ✓ amendment are stack-independent and stand. |
| 35 | Driver goes dark | **Restore with new wording** | **Keep** "the customer-facing 'Delayed' label is derived on the server". Drop "Android's `NotificationManager`"; the original's generic "device-generated local notification" is enough. |
| 36 | Customer order history | **Restore with new wording** | The Kotlin amendment's content stays: list rows and tracking read **the same server-provided label**. Only its framing ("two clients can't disagree") becomes "one source, server-side", because ticket 103 keeps the rule. |
| 42 | Advance ordering | **Restore with new wording** | Same as 36: the time-confirmation label stays server-derived. The delivery-day filter stays a client-side comparison. |

### 1.2 Tickets open at the time of the Kotlin switch, and the testing strategy written under it

| # | Ticket | Verdict | What changes |
|---|---|---|---|
| 38 | Deployment, environments, release (closed, ADR 0009) | **Still needs a decision** | Stack-independent and standing: the three-backend layout as later cut by ADR 0012, the pilot on production, CI migrations, expand/contract, the version gate, kill-switch flags, Cloudflare, Play App Signing, closed testing, the sideloaded pilot and the cutover. Kotlin-specific and open again: items 8 (no product flavors, `-Pbackend=production`, `applicationIdSuffix`), 9 (`./gradlew bundleRelease` by hand vs. `eas build`/EAS Submit), 14 (`./gradlew :driver:assembleDebug -Pbackend=production` → whatever produces a JS-carrying debug APK, §2.3), and 6's version gate "using Play's immediate In-App Updates flow" (vs. EAS Update, re-opened). The 2026-09-23 amendment's `./gradlew test` becomes the TS test runner. |
| 39 | Battery drain (closed, out of scope) | **Restore as-is** | Never amended for Kotlin, and doesn't depend on the stack. It measures the same `tslocationmanager` core either way. The protocol carries to the pilot unchanged. |
| 46 | Observability (closed) | **Still needs a decision** | It inherits ticket 12's call. Under direct FCM, "`UNREGISTERED` clears the token; everything else logged" stands. Under Expo push, the equivalent signal (`DeviceNotRegistered`) arrives only in a receipt, so the rule needs a receipt fetch that ticket 12 declined. "Our Ktor client's reconnects" goes back to "client Realtime" (already in its not-monitored list). Crashlytics "in both apps": the RN integration path isn't checked here ⚠️. |
| 53 | Testing strategy (closed) | **Restore with new wording** | No pre-Kotlin answer exists; it was resolved under Kotlin. The structure stands: rules on the server, pgTAP matrix, real-sign-in Realtime suite, no UI end-to-end tests, the simulator fixture track, the time boundaries. Changes: "pure reducers tested with JVM JUnit" → the same reducers in TypeScript under the workspace test runner; "shared fixtures (ADR 0008)… run by Vitest and JUnit" → gone, since one TS module means no cross-language contract (`fixtures/tracks/` for the simulator stays); "`./gradlew test`" and the "`mobile/` or `fixtures/` triggers Gradle" path filter → the TS job; "no Compose UI or instrumented tests" → no RN UI or device tests. Pre-pilot checklist item 6 ("FCM arrives on a locked screen") follows ticket 12. |

### 1.3 Map #45's body

**Verdict: restore with new wording.** The Kotlin-era text sits in four places:

- **Destination** ("a native Kotlin Android driver app, and a native Kotlin Android customer app"): back to React Native apps.
- **Actors** ("driver (native Kotlin Android), customer (native Kotlin Android)"): same.
- **Fixed constraint**: the pre-Kotlin "TypeScript everywhere — both RN apps…" returns. The current text's two kept rules (narrow named surface; customer statements server-side) must be carried into it. "Our own Ktor client", "written twice and kept identical by shared fixtures" and "iOS later as a separate Swift customer app" go.
- **Forward-compatible-subset note** ("Since the native switch, 'additive' on the platform axis means iOS is one more client…, and client math passes the shared fixtures"): back to ticket 20's literal "additive, not forks".

The ⚠️ "Mobile stack reopened again (2026-10-25)" note already flags all of this as superseded. The graduation entries for tickets 51 and 52 are history and stay.

### 1.4 The MVP spec (#54)

**Verdict for the issue as a whole: still needs a decision**, because three sections wait on ticket 103's re-opened calls. Section by section:

| Section | Verdict | What changes |
|---|---|---|
| Solution (customer and driver app lines) | New wording | "native Kotlin, Android" → React Native, Android. |
| Platform and repository | New wording | The "Mobile side" Gradle bullet, the "`supabase-kt` and Kotlin Multiplatform are both rejected" bullet, "Shared by file at the repo root", and "A schema change and the Kotlin types it breaks land in the same PR" all go. The mobile apps join the TypeScript side. **Keep** "The mobile surface is narrow and named" and "Anything a customer reads as a statement is computed on the server". The "Client-side math is written twice (TS and Kotlin), kept identical by shared fixtures" line becomes one TS module. "An iOS customer app later is a separate Swift client" → the same codebase. |
| Auth, identity, and duty | **Decision** | The token-refresh bullet (Ktor in-process refresh) waits on §2.2. The profile's "one overwritable **FCM** push token" waits on ticket 12. |
| Location pipeline | New wording | "Transistorsoft's native Android SDK" → the RN plugin (same core). "Mapbox Maps SDK for Android on mobile" → `@rnmapbox/maps`. Everything server-side stands. |
| Proof of delivery | New wording | "a WorkManager queue uploads the photo" → an RN background-upload mechanism, not yet chosen ⚠️. |
| Push | **Decision** | "sends via **FCM HTTP v1**" waits on ticket 12. |
| Observability | New wording (after the push call) | Crashlytics stays as an intent. The RN wiring is unchecked ⚠️. |
| Environments and release | **Decision** | "Mobile builds" bullets (no product flavors, `-Pbackend=production`, "unlicensed `debug` APK sideloaded") and "The customer app uses Play immediate In-App Updates" wait on §2.3 and §3.1. |
| Testing Decisions | New wording | Seam 2's "run by both Vitest and JUnit" and "pure reducers tested with JVM JUnit" → one TS runner. "No Compose instrumented tests" → no RN device tests. Checklist item 6 follows ticket 12. |
| Domain model, catalog, pricing, address, checkout, Price approval, Time confirmation, Payment, Phones, screens, Out of scope | Unchanged | No stack dependency. "Out of Scope: iOS" stands; only its future shape changes. |

### 1.5 Build issues #56–#86

**Blocked by #56** (`gh api …/issues/<n>/dependencies/blocked_by`, read 2026-10-25):

- **Directly: #60** (Customer sign-up and Account), **#61** (Driver provisioning and sign-in as On duty), **#86** (Release safety). #56's own `blocking` list confirms exactly these three.
- **Transitively: 27 issues, #60–#86 inclusive.** Not downstream of #56: **#57, #58, #59** (dispatcher sign-in, shop settings, catalog management). #56 itself is blocked by #55 (closed).
- Note: console- and server-only issues still sit behind #56, because #68 (Dispatch map) is blocked by #61. Examples: #68 itself, #79 (location ingest and the dispatcher's live map), #72 (packing bench). Moving #56's edges to its replacement (ticket 103's job) keeps that chain intact.

**Issues that name Kotlin, Gradle, Ktor, WorkManager, Compose, Swift, JUnit, shared fixtures, FCM or another native-Android API** (grep of each body, excluding the "Blocked by" list):

| # | Issue | Verdict | What names the stack |
|---|---|---|---|
| 56 | Mobile project skeleton and shared fixtures | **Still needs a decision** | Kotlin end to end: Gradle `:core`/`:driver`/`:customer`, Ktor client, `@Serializable`, `-Pbackend=production`, the Vitest+JUnit fixtures and CI path filter. Ticket 103 already says to replace and close it. The replacement's contents (Expo SDK, workspace layout of the two apps, how environments map to builds) depend on 103's calls. Today's `.github/workflows/ci.yml` carries a comment and a `fixtures/**` filter waiting for this ticket ("Fixtures deliberately trigger both sides once the mobile project lands (ticket 56)"). |
| 57 | Dispatcher sign-in and roles | **Still needs a decision** (one word) | "one overwritable **FCM** push token". Follows ticket 12. Otherwise stack-independent. |
| 60 | Customer sign-up and Account | **Restore as-is** | Body is stack-neutral. Only its blocked-by edge on #56 moves. |
| 61 | Driver provisioning and sign-in | **Restore as-is** | Same as #60. |
| 71 | Proof of delivery and Delivered | **Restore with new wording** | "a WorkManager queue uploads the photo" and "(JUnit reducer test)". The "survives app restart" criterion stays and needs an RN mechanism ⚠️. |
| 73 | Price approval at packing | **Restore with new wording** | "(JUnit reducer)" → TS reducer test. |
| 79 | Location ingest, simulator, live map | **Restore with new wording** | "`interpolatePosition` and staleness tiers pass shared fixtures in both Vitest and JUnit" → one TS module, tested once. The simulator's fixture track stays. |
| 80 | Driver location capture | **Still needs a decision** | "Transistorsoft's native Android SDK" (wording) and the whole token-refresh paragraph ("our Ktor client refreshes in-process… SDK's refresh endpoint is never configured"), which waits on §2.2. |
| 81 | Customer live tracking | **Restore as-is** | Its "fixture track" is the simulator's, which is stack-independent. |
| 82 | Push notifications | **Still needs a decision** | "sends via FCM HTTP v1", "register their FCM token", "`UNREGISTERED` clears the token". Follows ticket 12. |
| 83 | Driver session handover | **Restore with new wording** | "(JUnit reducer)". |
| 84 | Duty auto-end and sign-out block | **Restore with new wording** | "(pgTAP + JUnit reducer)". |
| 86 | Release safety | **Still needs a decision** | "Play immediate In-App Updates" (vs. EAS Update, re-opened), "unlicensed `debug` APK sideloaded" (§2.3), "Crashlytics" (RN wiring unchecked ⚠️). |

All other build issues (#58, #59, #62–#70, #72, #74–#78, #85) name nothing stack-specific in their bodies. Those downstream of #56 are affected only through the dependency chain.

### 1.6 ADRs, README, `CONTEXT.md`

| Artifact | Verdict | What changes |
|---|---|---|
| **ADR 0008** (native Kotlin) | **Still needs a decision** | To be superseded (ticket 103 writes the replacement). Its Considered-options paragraph names the two risks React Native carries (Mapbox's disclaimer; token refresh via JS wake-ups); both are re-opened. Of its Consequences, two are kept by 103 (narrow surface; server-side statements). The rest are reversed (Ktor client, hand-written types, fixtures, rewritten ticket 20 guardrail, Gradle `mobile/`) or re-opened (no OTA, Transistorsoft's token feed, direct FCM). |
| **ADR 0009** (environments and release) | **Still needs a decision** | Two bullets are Gradle-specific. "The pilot APK is a plain `debug` build pointed at production with `-Pbackend=production`. A custom `pilot` buildType would risk switching Transistorsoft's licence check on…; `release` builds are hard-wired to production, and `debug` defaults to local." The Transistorsoft reasoning still holds. The mechanism doesn't: a React Native debug build doesn't carry its JS (§2.3). "No over-the-air updates for the driver app during the pilot" was written when OTA was impossible. Under Expo it becomes a choice. Everything else stands. |
| **ADR 0002** (Supabase) | Unchanged | "FCM/APNs (or Expo's push service) is composed on top regardless" already covers both push options. |
| **README** | **Restore with new wording** | Lines 21–22: "The mobile side (one Gradle project with `:core`, `:driver` and `:customer`) arrives with ticket #56, along with the shared fixtures directory." → the RN apps arrive as workspace packages with #56's replacement; no shared fixtures directory. The Layout block gains the two apps when they exist. |
| **`CONTEXT.md`** | **Restore as-is** | It contains no mobile-stack wording: no Kotlin, React Native, Expo, Gradle or fixtures. Nothing to change. |

---

## 2. The returning risks, re-checked

### 2.1 `@rnmapbox/maps`: maintenance and Mapbox's stance today

**Mapbox's stance has not moved.**

- Mapbox glossary page: "Mapbox has officially transferred the development and oversight of the React Native Maps SDK to the open-source community. Because this is a community-maintained project, Mapbox is unable to provide formal support for it." ([glossary](https://docs.mapbox.com/help/glossary/maps-sdk-for-react-native.md))
- Mapbox's React Native getting-started tutorial: "The `@rnmapbox/maps` library is maintained by a community of open source contributors and is not an official Mapbox product", and it "may not include the latest features from the underlying Mapbox Maps SDKs" ([tutorial](https://docs.mapbox.com/help/tutorials/getting-started-react-native.md)).
- The README still calls itself "A community-supported, open-source React Native library" and still pins "Call for additional maintainers" ([discussion #1551](https://github.com/rnmapbox/maps/discussions/1551), created 2021-09-24) ([repo README](https://github.com/rnmapbox/maps)).

**Maintenance** (GitHub API and npm registry, 2026-10-25):

| Fact | Value |
|---|---|
| Latest | **10.3.11**, 2026-10-20 (npm `latest`). Not archived; last push 2026-10-24. MIT. 105 open issues. |
| October 2026 | Six releases: 10.3.6 (10-04), 10.3.7 (10-05), 10.3.8 (10-12), 10.3.9 and 10.3.10 (10-19), 10.3.11 (10-20) |
| The gap before it | 10.3.5 on **2026-07-22**, then nothing until **2026-10-04**: **74 days**. Only **3 commits** landed between 2026-07-25 and 2026-10-01. Ticket 02's tripwire is "rnmapbox stalling for a quarter or more"; this came within about two weeks of it, then recovered. |
| Concentration | All-time commits: `mfazekas` 1,185, `rnmapbox-bot` 257, next human 145. Since 2026-07-25: `mfazekas` 56 of 87 commits, 7 by the bot, and no other author more than 3. |
| Native SDK | Still "We support Mapbox Maps SDK v11" (README). The licence terms are therefore the same Mapbox TOS/Product Terms as the native SDK, and ticket 41's rules carry over unchanged (as the Kotlin audit found, §2.3 there). |
| Expo | Peer deps `expo >=47.0.0`, `react-native >=0.79`. "This package is not available in the Expo Go app" (README), so it needs a dev build, as before. |
| New Architecture | Ships a `codegenConfig` declaring Fabric components (`RNMBXMapView`, `RNMBXCamera`, `RNMBXMarkerView`, `RNMBXShapeSource`, …). Recent New-Architecture bug reports are mostly closed. One open: [#4278](https://github.com/rnmapbox/maps/issues/4278) (iOS globe projection under RN 0.86), which is iOS-only and outside the MVP. |

**What this means for ticket 02's acceptance, as fact only.** The mitigation ticket 02 relied on still holds: MapLibre's RN library is a fork sibling, and "write against the style spec" keeps the exit cheap. What's different from July: the near-miss on the tripwire, and the comparison ADR 0008 made explicit. ADR 0008 rejected `supabase-kt` because "one person wrote most of it", and `@rnmapbox/maps` has the same profile. The difference that may matter to ticket 103: rnmapbox sits on the **rendering** path, with the vendor's own native SDK underneath, while `supabase-kt` sat on the auth and Realtime path.

### 2.2 Driver token refresh under the Transistorsoft RN plugin

**Is it still JS-wake-up dependent? Yes, on every released React Native.**

- **Android pauses JS timers in the background.** In [`JavaTimerManager.kt`](https://github.com/facebook/react-native/blob/main/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/core/JavaTimerManager.kt), `onHostPause()` sets `isPaused`, and timers are stopped when `isPaused && !isRunningTasks`. `onHeadlessJsTaskStart` restarts them; `onHeadlessJsTaskFinish` stops them again when no tasks remain. So `setInterval` runs in the background only while a headless JS task is active.
- **This may change, but not yet.** Commit `f9996a8c2` (2026-10-23) added the feature flag `keepTimersRunningWhileHostPausedAndroid` ("Keep JS timers running on Android while the React host is paused… Matches iOS"), with `defaultValue: false`, `ossReleaseStage: 'none'`, `purpose: 'experimentation'` ([flags config](https://github.com/facebook/react-native/blob/main/packages/react-native/scripts/featureflags/ReactNativeFeatureFlags.config.js)). The latest release is RN 0.88.0 (2026-10-15), which predates it.
- **`supabase-js` auto-refresh is a timer.** `_startAutoRefresh` runs `setInterval(…, AUTO_REFRESH_TICK_DURATION_MS)` with a 30 s tick. Its own docs say "On non-browser platforms… the library is not able to effectively determine whether the application is _focused_", and show React Native code calling `startAutoRefresh()` on `active` and `stopAutoRefresh()` otherwise ([`GoTrueClient.ts`](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/GoTrueClient.ts)).
- **But refresh can be driven on demand.** `getSession()` (via `__loadSession`) treats the session as expired when `expires_at*1000 - Date.now() < EXPIRY_MARGIN_MS` (3 × 30 s = 90 s) and calls `_callRefreshToken` itself. So any JS that runs (for example a Transistorsoft event handler) can refresh without the timer. Access tokens default to **1 hour** ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)), so an 08:00–16:00 duty day needs at least seven refreshes.
- **When JS runs under Transistorsoft.** `heartbeatInterval` is the "Rate in seconds at which `BackgroundGeolocation.onHeartbeat` events fire while the app is in the background". After termination, `enableHeadless` (Android only) lets the SDK "respond to events after the app has been terminated", delivered to "the callback registered with `BackgroundGeolocation.registerHeadlessTask`". Otherwise "only the SDK's native Android code is running" ([AppConfig](https://docs.transistorsoft.com/react-native/AppConfig/)). ⚠️ Not verified: whether `onHeartbeat`/`onLocation` events reach JS while the activity is paused but the process is alive. Timers are proven paused; event delivery isn't covered by the timer code.

**Does `AuthorizationConfig`'s native refresh remove that dependency? Not against Supabase Auth as-is.**

- Transistorsoft's refresh is native and automatic: on a 401, or proactively when `expires` is set. It "sends an `application/x-www-form-urlencoded` POST to `refreshUrl`", with `refreshPayload` "Form fields…" containing `"{refreshToken}"`. It reads "A new refresh token (if present)" from the JSON response and fires `onAuthorization` with the result ([AuthorizationConfig](https://docs.transistorsoft.com/react-native/AuthorizationConfig/)).
- Supabase Auth's refresh grant reads the body **as JSON only**. `RefreshTokenGrant` calls `retrieveRequestParams`, which does `json.Unmarshal(body, params)` and otherwise returns 400 `ErrorCodeBadJSON`, "Could not parse request body as JSON" ([`helpers.go`](https://github.com/supabase/auth/blob/master/internal/api/helpers.go), [`token_refresh.go`](https://github.com/supabase/auth/blob/master/internal/api/token_refresh.go)). The `/token` operation in [`openapi.yaml`](https://github.com/supabase/auth/blob/master/openapi.yaml) declares only `application/json` for its request body. This closes the Kotlin audit's ⚠️ ("didn't verify that Supabase Auth's token endpoint accepts that encoding"): **it doesn't.**
- **Two refreshers are a hazard in their own right.** Supabase refresh tokens "can only be used once". The reuse interval is "By default… 10 seconds", and a reuse outside it means "the whole session is regarded as terminated and all refresh tokens belonging to it are marked as revoked" ([sessions](https://supabase.com/docs/guides/auth/sessions)). The source matches: `RefreshTokenRotationEnabled` defaults to `true`, and reuse past `RefreshTokenReuseInterval` calls `RevokeTokenFamily` ([`tokens/service.go`](https://github.com/supabase/auth/blob/master/internal/tokens/service.go)). If `supabase-js` and Transistorsoft each held and spent the same refresh token, the second spend could sign the driver out mid-shift. This is the fact behind ticket 52's "our client alone refreshes", and it doesn't depend on the stack.
- **Options this leaves (facts only, none chosen).** (a) JS refreshes through `supabase-js` (on demand inside a Transistorsoft event or headless task) and pushes each new access token into Transistorsoft's `authorization.accessToken`. That is the pre-Kotlin ticket 09 shape, with the JS-execution dependency above. (b) Transistorsoft refreshes natively against a small endpoint of our own that accepts form-encoding and calls Supabase Auth with JSON. That endpoint doesn't exist; ⚠️ I haven't checked whether an Edge Function can return the response shape Transistorsoft parses, and `supabase-js` would then have to stop refreshing (single-use tokens). Ticket 03's offline queue is the backstop in both, as ticket 09 originally said.

### 2.3 Transistorsoft debug-build licensing under an Expo dev build / prebuild

**The licensing answer stands.**

- "The SDK requires a license for **release** builds. Debug builds work without one." ([RN setup](https://docs.transistorsoft.com/react-native/setup/))
- "If you've **not** purchased a license, the plugin is fully functional in *DEBUG* builds" ([`help/INSTALL-EXPO.md`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/help/INSTALL-EXPO.md)).
- The guide still builds with `npx expo prebuild` → `npx expo run:android`, or `eas build --profile development`.
- The licence is still keyed per app identifier: "unlocks a single app identifier, for unlimited users and devices" ([purchase](https://docs.transistorsoft.com/purchase/?platform=react-native)).
- New: a "free 30-day trial license for testing release builds" (setup page).

**Ticket 19's `eas.json` guardrail is still accurate** ([eas.json reference](https://docs.expo.dev/eas/json/)):

- `developmentClient`: "this field is for setting the `gradleCommand` to `:app:assembleDebug` for Android".
- `gradleCommand`: "it takes priority over `buildType` and `developmentClient`".
- `buildType`: "can be overridden by `gradleCommand` or `developmentClient: true`".

**What ticket 19 never had to face: a debug build without its JS.**

- The RN template's `android/app/build.gradle` says the `debuggableVariants` are those for which "we're going to skip the bundling of the JS bundle and the assets. Default is "debug", "debugOptimized"" ([template](https://github.com/react-native-community/template/blob/main/template/android/app/build.gradle)).
- Expo: "By default, we need to make a release build for `expo-updates` to be enabled and to load updates rather than reading from a development server. This is because debug builds behave like normal React Native project debug builds." ([EAS Update debugging](https://docs.expo.dev/eas-update/debug/))
- A development build is "essentially your own version of Expo Go". You start the bundler with `npx expo start`, or switch to "published updates with EAS Update" from its launcher ([development builds](https://docs.expo.dev/develop/development-builds/introduction/)).
- So ADR 0009's "plain `debug` build pointed at production", sideloaded to phones that never see a dev machine, would have no JS to run. This is a mechanism gap, not a licensing one.

**Documented routes that keep the `debug` build type** (facts, none chosen):

- **Override `debuggableVariants`** so Gradle bundles JS into `debug`. This is the template's documented knob. Under Expo prebuild, `android/` is generated, so the override would have to come from a config plugin ⚠️ (not verified).
- **Expo's documented debug build with `expo-updates` on.** The `eas.json` example sets `"EX_UPDATES_NATIVE_DEBUG": "1"`, `"gradleCommand": ":app:assembleDebug"`, `"withoutCredentials": true` and a `channel` (EAS Update debugging, "EAS Build"). It is still the `debug` build type, so the licence stays off. It also means the sideloaded pilot could take JS fixes over the air, which ADR 0009 assumed impossible. Note that it sets `gradleCommand` explicitly, the very field ticket 19 warned overrides `developmentClient`. Here it names `:app:assembleDebug`, so it doesn't trip the licence.

**A new edge to watch.** `debugOptimized` is a second debuggable build type in current RN templates, and it isn't literally `debug`. Transistorsoft's check failed on a custom build type in [#874](https://github.com/transistorsoft/react-native-background-geolocation/issues/874) (2019). Searching the issue tracker finds nothing on `debugOptimized` ⚠️. Whether it trips the licence is unknown.

---

## 3. The re-opened proposals, facts only

### 3.1 EAS Update (OTA) for the customer app

- **Play policy allows it.** An app "may not download executable code (such as dex, JAR, .so files) from a source other than Google Play. This restriction does not apply to code that runs in a virtual machine or an interpreter where either provides indirect access to Android APIs (such as JavaScript in a webview or browser)". Interpreted code loaded at run time must "not allow potential violations of Google Play policies" ([Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379)). The Kotlin audit read the same clause the other way: it's what made native OTA impossible and JS OTA lawful.
- **Price at this scale.** Free plan: EAS Update "1,000 MAUs" (a MAU is a user who downloads one or more updates) and 100 GiB bandwidth; EAS Build "Up to 15 Android and 15 iOS builds" per month, low-priority queue. Starter $19/month: 3,000 MAUs, then usage-based ([pricing](https://expo.dev/pricing)). Ticket 38's earlier note ("free for up to 1,000 monthly active users") still holds.
- **Native compatibility is gated by runtime version.** "an update must be compatible with a build's native code to run on the build". The `fingerprint` policy "will increment the runtime version whenever anything that may impact the native runtime changes", and `appVersion` follows the app version ([runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)). An OTA can't carry a Transistorsoft or Mapbox native bump; that still needs a Play release.
- **Release builds only, by default** (§2.3). For the driver app the question is different: after the managed-Play cutover it's force-updated through AMAPI (ADR 0009). During the pilot, the `EX_UPDATES_NATIVE_DEBUG` route above is the only documented OTA path for a debug build.
- **What it would replace or sit beside.** The version gate and kill-switch flags (ticket 38) stand under any answer. "Play's immediate In-App Updates flow" (ADR 0008, #86) was the Kotlin substitute for OTA. ⚠️ RN access to the Play In-App Updates API is through community wrappers, still not checked (same ⚠️ as the Kotlin audit).

### 3.2 Expo push service vs. direct FCM HTTP v1 from the Edge Function

| | Expo push service | Direct FCM HTTP v1 |
|---|---|---|
| Path | Edge Function → Expo → FCM. "Expo also handles sending push notifications off to FCM and APNs" ([sending](https://docs.expo.dev/push-notifications/sending-notifications/)) | Edge Function → FCM. "the `expo-notifications` API is push-service agnostic"; get the token with `getDevicePushTokenAsync()` instead of `getExpoPushTokenAsync()` ([custom sending](https://docs.expo.dev/push-notifications/sending-notifications-custom/)) |
| Credentials | FCM V1 service-account key uploaded **to Expo** (EAS). Optional Expo access token: "You can require any push requests to be sent with a valid access token" | Google service-account key held **in the Edge Function**, minting OAuth tokens (Kotlin audit §2.4; Supabase's own push guide) |
| Cost | "There is no cost associated with sending notifications through Expo push notification service" ([FAQ](https://docs.expo.dev/push-notifications/faq/)) | FCM, no Expo hop |
| Errors | A ticket "indicates that Expo has received your notification payload but may still need to send it". "You must check your push receipts", "15 minutes after sending"; "push receipts are cleared after 24 hours". `DeviceNotRegistered` → "stop sending notifications to this device's push token" | Synchronous per-message response; `UNREGISTERED` (404) means delete ([FCM token management](https://firebase.google.com/docs/cloud-messaging/manage-tokens), per the Kotlin audit) |
| Limits | 600 notifications/s per project; up to 100 messages per request | n/a at this scale |
| Privacy | "Expo doesn't store the contents of push notifications any longer than it takes to deliver them" (FAQ) | No third party beyond Google |
| Token | `ExpoPushToken` "remains the same across app upgrades"; "On Android, reinstalling the app may result in the token changing" (FAQ) | FCM registration token, same lifecycle the Kotlin audit recorded |

**What depends on the answer.** Under Expo, ticket 12's fire-and-forget model stands as originally written ("no receipt-polling"). But then ticket 46's "`UNREGISTERED` clears the token" has no source unless someone fetches receipts. Under direct FCM, the Kotlin-era amendments to 12, 46 and #82 carry over unchanged. Either way, the trigger, event lists and payload text don't move. Also: the custom-sending page's example puts everything under `message.data`, and the page doesn't specify which payload `expo-notifications` expects on Android. It points to `FirebaseRemoteMessage` ⚠️.

### 3.3 Current Expo SDK and New Architecture state

| Fact | Value | Source |
|---|---|---|
| Latest Expo SDK | **58** (58.0.0 on 2026-09-29; `latest` 58.0.19 on 2026-10-23). Earlier: 57 (2026-06-30), 56 (2026-05-20), 55 (2026-02-25), 54 (2025-09-10) | npm registry |
| React Native in SDK 58 | **0.88.0**, React 19.3.0 (`bundledNativeModules.json`) | expo@58.0.19 |
| Legacy Architecture | Gone since RN 0.82. `newArchEnabled=false` is "ignored"; RN 0.81 / Expo SDK 54 "are the last versions that allow you to use the Legacy Architecture" | [RN 0.82 blog](https://reactnative.dev/blog/2025/10/08/react-native-0.82) |
| Transistorsoft RN plugin | **5.8.0** (2026-10-09). `codegenConfig` type `modules` (TurboModule). Still `api "com.transistorsoft:tslocationmanager:$tslocationmanagerVersion"`, default `4.7.+`, with a guard that forces a minimum core version | npm; [`android/build.gradle`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/android/build.gradle) |
| `@rnmapbox/maps` | **10.3.11** (2026-10-20), Fabric components via `codegenConfig`; peer `react-native >=0.79`, `expo >=47` | npm |
| Bundled in SDK 58 (relevant) | `expo-updates` ~58.0.18, `expo-notifications` ~58.1.6, `expo-dev-client` ~58.0.15, `expo-build-properties` ~58.0.11, `expo-secure-store` ~58.0.2, `@react-native-async-storage/async-storage` 2.2.0 | `bundledNativeModules.json` |
| Expo Go | Can't run either native library (rnmapbox README; Transistorsoft needs prebuild). Expo: "push isn't supported in Expo Go" since SDK 53 (custom-sending page). A dev build is required, as before | as cited |

`background-location.md` recorded "Expo SDK 57" as its baseline. One SDK has shipped since.

---

## Not primary-sourced

- ⚠️ **JS event delivery while the RN activity is paused.** Timers are proven paused (source). Whether Transistorsoft's `onHeartbeat`/`onLocation` callbacks reach JS while backgrounded with the process alive wasn't verified.
- ⚠️ **An Edge Function as a form-to-JSON refresh proxy for Transistorsoft.** Not tested. The response shape Transistorsoft parses and the single-use refresh-token interplay with `supabase-js` were not exercised.
- ⚠️ **Overriding `debuggableVariants` under Expo prebuild.** Whether a config plugin is needed, and which one, wasn't checked.
- ⚠️ **`debugOptimized` and Transistorsoft's licence check.** No evidence either way.
- ⚠️ **`expo-secure-store` as `supabase-js` session storage.** Wiring and encryption weren't checked.
- ⚠️ **An RN background-upload mechanism** for proof-of-delivery photos that survives an app restart (the replacement for WorkManager in #71). Not researched.
- ⚠️ **Crashlytics under Expo/RN.** The integration path wasn't checked.
- ⚠️ **Play In-App Updates from React Native.** Community wrappers, not checked (carried over from the Kotlin audit).
- ⚠️ **The Android payload `expo-notifications` expects from direct FCM.** Expo's page defers to `FirebaseRemoteMessage`.
- **Judgement, not fact:** "the same shape as the one that sank `supabase-kt`" (finding 1) is a comparison of commit concentration and vendor support, not a measured risk.

## Sources

- Repo and tracker: issues #2, #3, #6, #8, #9, #11, #12, #14, #17, #19, #20, #23, #29, #32, #35, #36, #38, #39, #42, #43, #45, #46, #51, #52, #53, #54, #56–#86, #103 (bodies and comments via `gh`); `blocked_by` and `blocking` via `gh api repos/vgviscayno/delivery-app/issues/<n>/dependencies/…`; `docs/adr/0002`, `0008`, `0009`, `0011`, `0012`; `README.md`; `CONTEXT.md`; `.github/workflows/ci.yml`; [`native-kotlin-audit.md`](native-kotlin-audit.md), [`map-provider.md`](map-provider.md), [`background-location.md`](background-location.md), [`transistorsoft-debug-licensing.md`](transistorsoft-debug-licensing.md), [`licensing-and-when-in-use.md`](licensing-and-when-in-use.md)
- Mapbox / rnmapbox: [glossary: Maps SDK for React Native](https://docs.mapbox.com/help/glossary/maps-sdk-for-react-native.md) · [getting started with React Native](https://docs.mapbox.com/help/tutorials/getting-started-react-native.md) · [rnmapbox/maps](https://github.com/rnmapbox/maps) (README, releases, contributors, commits since 2026-07-25 via GitHub API) · [discussion #1551](https://github.com/rnmapbox/maps/discussions/1551) · [#4278](https://github.com/rnmapbox/maps/issues/4278) · npm `@rnmapbox/maps@10.3.11` metadata
- Transistorsoft: [RN setup](https://docs.transistorsoft.com/react-native/setup/) · [RN AuthorizationConfig](https://docs.transistorsoft.com/react-native/AuthorizationConfig/) · [RN AppConfig](https://docs.transistorsoft.com/react-native/AppConfig/) · [purchase](https://docs.transistorsoft.com/purchase/?platform=react-native) · [`help/INSTALL-EXPO.md`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/help/INSTALL-EXPO.md) · [`android/build.gradle`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/android/build.gradle) · [#874](https://github.com/transistorsoft/react-native-background-geolocation/issues/874) · npm `react-native-background-geolocation@5.8.0` metadata
- Supabase: [`supabase/auth`](https://github.com/supabase/auth): `internal/api/helpers.go`, `internal/api/token_refresh.go`, `internal/tokens/service.go`, `internal/conf/configuration.go`, `openapi.yaml` · [sessions guide](https://supabase.com/docs/guides/auth/sessions) · [`supabase-js`](https://github.com/supabase/supabase-js): `packages/core/auth-js/src/GoTrueClient.ts`, `packages/core/auth-js/src/lib/constants.ts`, `packages/core/realtime-js/src/RealtimeChannel.ts`, `packages/core/realtime-js/src/RealtimeClient.ts`, `packages/core/supabase-js/src/SupabaseClient.ts`
- React Native: [`JavaTimerManager.kt`](https://github.com/facebook/react-native/blob/main/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/core/JavaTimerManager.kt) and its commit history · [`ReactNativeFeatureFlags.config.js`](https://github.com/facebook/react-native/blob/main/packages/react-native/scripts/featureflags/ReactNativeFeatureFlags.config.js) · [community template `android/app/build.gradle`](https://github.com/react-native-community/template/blob/main/template/android/app/build.gradle) and `gradle.properties` · [RN 0.82 release post](https://reactnative.dev/blog/2025/10/08/react-native-0.82) · GitHub releases (v0.88.0)
- Expo: [eas.json reference](https://docs.expo.dev/eas/json/) · [development builds](https://docs.expo.dev/develop/development-builds/introduction/) · [EAS Update debugging](https://docs.expo.dev/eas-update/debug/) (source `docs/pages/eas-update/debug.mdx` in expo/expo) · [runtime versions](https://docs.expo.dev/eas-update/runtime-versions/) · [pricing](https://expo.dev/pricing) · [sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/) · [sending via FCM/APNs directly](https://docs.expo.dev/push-notifications/sending-notifications-custom/) · [push FAQ](https://docs.expo.dev/push-notifications/faq/) · npm `expo` registry metadata and `expo@58.0.19/bundledNativeModules.json`
- Google: [Play Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/9888379) · [FCM token management](https://firebase.google.com/docs/cloud-messaging/manage-tokens) (via the Kotlin audit)
