# Native Kotlin audit: what the mobile-stack switch invalidates

Research for [ticket 51](https://github.com/vgviscayno/delivery-app/issues/51). Feeds [ticket 52](https://github.com/vgviscayno/delivery-app/issues/52) (Mobile stack reopened: React Native or native Kotlin).

**Researched 2026-09-23.** External facts come from vendor docs, licence files, policy pages, and the source/metadata of the repos involved, read on that date. Anything I couldn't confirm from a first-party source is marked ⚠️ inline and listed again under [Not primary-sourced](#not-primary-sourced).

**This document prices the switch. It does not pick React Native or native Kotlin.** That call belongs to ticket 52.

The hypothesis under audit: both mobile apps (driver and customer) are rebuilt as native Kotlin Android apps, and iOS later becomes a separate Swift app. The dispatcher web app and the Supabase backend stay TypeScript.

---

## Headline

| | |
|---|---|
| **Closed tickets audited** | 43 (every closed child of #45) |
| **Survive unchanged** | **32** |
| **Amend** | **10**: 02, 03, 09, 12, 17, 19, 20, 23, 29, 32 |
| **Void** | **1**: 08 (monorepo layout and code sharing), mobile half only |
| **Hard blocker found** | **None** |

What the numbers come to:

1. **Background location is not the hard case the tickets feared.** Transistorsoft ships a first-party native Android SDK (Kotlin, Maven Central, `com.transistorsoft:tslocationmanager`), sold under **the same licence at the same $399 Starter price**, and one purchase covers "React Native, Flutter, Capacitor, Cordova, Swift / Kotlin". The React Native plugin is a bridge over **that same Maven artifact**: its `android/build.gradle` declares `api "com.transistorsoft:tslocationmanager:$tslocationmanagerVersion"`. So ticket 03's three deciding capabilities (SQLite buffering, surviving termination, the motion state machine) belong to the native core, not to the React Native layer. Under native Kotlin, we would own no location pipeline.
2. **The real costs sit in the Supabase client and in type sync.** `supabase-kt` is community-maintained. Supabase's own docs say it "is not an official library", and one person (`jan-tennert`) has made 2,535 of its commits. It covers everything the map uses (Auth auto-refresh, private Broadcast channels, signed URLs). **`supabase gen types` has no Kotlin target** (`typescript | go | swift | python`), so ticket 08's type-sync mechanism doesn't carry over.
3. **Native Android has no over-the-air code update, and Google Play policy forbids one.** An app distributed via Google Play "may not modify, replace, or update itself using any method other than Google Play's update mechanism", and the exemption covers only interpreted code such as JavaScript. That leaves the customer app with Play updates, the Play In-App Updates prompt, the version gate and feature-flag kill switches. EAS Update was never decided on any closed ticket, though, so dropping it removes a proposal rather than a settled decision.
4. **Client-side domain rules get a second copy, not a third.** Both mobile apps would be Kotlin, so they can share one Kotlin module. The duplication is TypeScript (web and backend) versus Kotlin (mobile). Most rules that must agree are already server-authoritative. What would be duplicated is display logic: status labels, price formatting, `interpolatePosition`, staleness tiers.

---

## 1. The audit: survives / amend / void

"Survives" means no text on the ticket has to change. "Amend" means specific statements change but the ticket's central call stands. "Void" means the central answer has to be decided again.

| # | Ticket | Verdict | What changes (or why nothing does) |
|---|---|---|---|
| 01 | Domain model and delivery lifecycle | **Survives** | Vocabulary and state machines don't depend on the stack. |
| 02 | Map provider for React Native and web | **Amend** | **Mapbox stands.** Swap `@rnmapbox/maps` for Mapbox's own **Maps SDK for Android** (§2.3). The licence terms are identical: rnmapbox ≥10.3.0 already requires the native Mapbox v11 SDK underneath. The **accepted risk goes away** ("Mapbox formally disclaims its own React Native binding"), and so does the "rnmapbox stalling" tripwire. The "shared `interpolatePosition` module" becomes one TypeScript copy for the web plus one Kotlin copy. The style JSON is still shared (it's an asset, not code). The MapLibre exit hatch still exists (MapLibre Native Android). |
| 03 | Background location capture | **Amend** | **Transistorsoft stands** via its native Kotlin SDK (§2.1). Void: "on an Expo development-build / prebuild workflow via its config plugin" and the comparison with `expo-location`. The cadence numbers, the separate-binaries constraint and the job/duty scoping don't depend on the stack and all stand. |
| 04 | Backend platform options | **Survives** | Historical research. Its React Native client-support column is moot, but it picked no winner and nothing downstream reads that column. |
| 05 | Backend platform decision | **Survives** | Supabase is unaffected. The backend runtime stays TypeScript (Edge Functions). |
| 06 | Realtime transport and fan-out | **Survives** | The design is server-side: Broadcast, the ingest Edge Function, per-Delivery and all-drivers channels. `supabase-kt` supports private Broadcast channels (`isPrivate`) and re-pushes a refreshed JWT to subscribed channels (§2.2). |
| 07 | Cadence, staleness, smoothing | **Survives** | A behavioural spec. It now gets two implementations (TypeScript and Kotlin) that must agree. See §2.6. |
| 08 | Monorepo layout and code sharing | **Void** (mobile half) | Void: `packages/domain` and `packages/api-client` shared with the mobile apps, Supabase-generated types as the foundation of the mobile domain layer, Expo dev builds side-loaded for the demo, and "release via EAS Build". Carries over: one repo, pnpm + Turborepo for the web and backend, no shared mobile UI kit (the two Kotlin apps can still share non-UI Gradle modules), and the standalone React + Vite dispatcher. The sharing boundary has to be drawn again (§2.6). |
| 09 | Auth and identity | **Amend** | Void: the token refresh "running through the background-geolocation library's periodic JS wake-ups". Under native Kotlin, the foreground service keeps the app process alive, so `supabase-kt`'s in-process auto-refresh (`alwaysAutoRefresh`, default `true`) runs directly. The ingest upload still needs a valid JWT; see §2.2 for the two ways to wire it. "Persisted via secure storage": check what `supabase-kt` actually uses on Android ⚠️. The rest (one Auth instance, roles, the RLS `EXISTS` crux, session lifetimes) stands. |
| 10 | Location history and retention | **Survives** | Nothing is persisted, on any stack. |
| 11 | Proof of delivery | **Survives** | Capture, optimistic close, compression, the private bucket and 30-day retention don't depend on the stack. `supabase-kt` has `createSignedUrl(path, expiresIn)` (source). The background upload queue becomes WorkManager rather than a JavaScript queue, which is an implementation detail and not a spec change. |
| 12 | Push notification pipeline | **Amend** | Void: "Delivery mechanism: Expo's push service". It becomes **direct FCM HTTP v1** from the same Edge Function (§2.4). Unchanged: the Postgres trigger on `courier_status`, the event lists, fire-and-forget, generic payload text, the permission timing, and clearing the token on deactivation. `push_token` holds an FCM registration token rather than an Expo token. |
| 13 | Install-free tracking link | **Survives** | Out of scope. No stack dependency. |
| 14 | Customer live-tracking screen | **Survives** | Layout, map contents, camera behaviour and staleness rendering don't depend on the stack. One *implementation hint* names an rnmapbox API ("`onCameraChanged` gesture-origin flag"). The Android SDK's gesture listeners do the same job. The hint isn't binding, so the ticket needn't change. `tel:` becomes an `ACTION_DIAL` intent. |
| 15 | Dispatcher console | **Survives** | Web. |
| 16 | Driver location permission onboarding | **Survives** | The Android path is MDM pre-grant, silent verification, downgrade detection and the foreground notification. All of it maps onto the Kotlin SDK: `ProviderChangeEvent`, `NotificationConfig` (§2.1). The iOS path is deferred. It names `Linking.openSettings()`, which a later Swift app would replace with its own call, and that is the iOS app's concern. |
| 17 | Licensing and the when-in-use alternative | **Amend** (minor, post-MVP) | **The $399 finding stands**, and it applies to the native SDK too (§2.1). What changes is the reasoning for `CLBackgroundActivitySession`: its cost was "owning a custom native Swift module". A native Swift iOS app is already Swift, so that cost mostly goes away. Whether Transistorsoft's Swift SDK exposes the API wasn't checked ⚠️. iOS-only and post-MVP either way. |
| 18 | Android MDM provisioning | **Survives** | Permission pre-grant, OEM kitting and managed-Play private-app distribution all act on the APK/AAB. None of it cares how the binary was built. |
| 19 | Transistorsoft debug-build pilot | **Amend** | The answer ("yes, a debug build runs unlicensed; the licence is triggered by build type") stands for the native SDK. Its Kotlin setup page says "Debug builds work without one." The guardrail about the stock `development` profile in `eas.json` goes away, because there is no `eas.json`. In its place: *the pilot build is the Gradle `debug` buildType; any custom buildType fails licence validation.* Ticket 52 notes the separate problem that Play won't accept a debuggable build. That problem doesn't depend on the stack and is not counted here. |
| 20 | Driver-app distribution and MVP platform scope | **Amend** | Internal distribution, Android-only MVP, and delete-store-reasoning/keep-OS-reasoning all stand. The **forward-compatible-subset guardrail** ("Android→iOS additive, not forks") no longer holds for the **customer** app, because a later Swift app *is* a fork. Ticket 52 already names this amendment as its own job. The driver app is Android-only for good, so it is unaffected. |
| 21 | Customer-app launch mode | **Survives** | The Play closed-testing track works the same for any binary. |
| 22 | Order-acceptance time window | **Survives** | Server-side guard plus client gate. No stack dependency. |
| 23 | Order-acceptance radius | **Amend** (wording) | "The store's own fixed coordinates… live in `packages/config`". The Kotlin apps can't import a TypeScript package, so the value needs a home both sides can reach: a Gradle `buildConfigField` mirrored from one source, or served from the server. The rule itself, Directions road distance and the fail-closed backstop are unchanged. |
| 24 | ETA feasibility | **Survives** | Research. No stack dependency. |
| 25 | ETA display decision | **Survives** | |
| 26 | Product catalog | **Survives** | A domain model. (Ticket 50's switching-cost list mentions "generated types under `packages/domain`" against 26, but the resolved ticket 26 names no package.) |
| 27 | Order pricing model | **Survives** | Domain rules. The rounding rule ("once, at the end") and the centavos rule now need a Kotlin copy wherever the client computes a figure for display (§2.6). |
| 28 | Price approval | **Survives** | The rules are server- and dispatcher-side. The customer sees one read-only line of text. |
| 29 | Cart and checkout | **Amend** (wording) | "Persisted locally (MMKV/AsyncStorage)" becomes Jetpack DataStore or Room. Everything else stands: the gate stack, submission through an Edge Function, the idempotency key. |
| 30 | Customer catalog browse and cart | **Survives** | The prototype is plain HTML, not React Native. Chip generation from `weight_step_grams` and the price display rules get implemented in Kotlin, and only the customer app uses them. |
| 31 | Dispatcher packing bench | **Survives** | Web. |
| 32 | Driver app screens and job flow | **Amend** (wording) | "A `@rnmapbox/maps` canvas" becomes Mapbox Maps SDK for Android. "One `interpolatePosition` module… now serve[s] a map on both surfaces, with only the SDK differing" becomes one *behaviour*, implemented twice. The screen set, ordering, priority rendering and press-and-hold guard stand. The prototype is HTML. |
| 33 | Saved addresses and geocoding | **Survives** | The flow and the record shape don't depend on the stack. Guardrail for whoever builds it: don't reach for the Mapbox Search SDK for Android without checking it can send `permanent=true` against Geocoding v6 ⚠️. Calling the Geocoding v6 HTTP API directly is compliant on any stack. |
| 34 | Driver shift and availability | **Survives** | |
| 35 | Driver goes dark | **Survives** | Refetch-and-diff and the device-local notification (Android `NotificationManager`) don't depend on the stack. |
| 36 | Customer order history | **Survives** | "Reuses ticket 14's status vocabulary verbatim". Both screens are in the same (customer) app, so that stays one copy. |
| 37 | Concurrent-dispatcher locking | **Survives** | Server-side conditional writes. |
| 40 | Price-approval phone number | **Survives** | Its one mention of `packages/config` is a contrast ("rather than `packages/config`"), so there's nothing to change. |
| 41 | Mapbox geocoding storage terms | **Survives** | The Product Terms cover API usage, whatever the client. See §2.3 for the SDK's own licence. |
| 42 | Advance ordering | **Survives** | |
| 44 | Priority delivery | **Survives** | |
| 49 | Convex re-evaluation | **Survives** | Backend research. |
| 50 | Backend platform, reopened | **Survives** | |

### Also exposed, but not closed tickets

- **The map itself (#45).** The Destination ("a React Native driver app, and a React Native customer app"), the Actors note, and the **Fixed constraint** ("TypeScript everywhere — both RN apps…") would all need redrawing. Ticket 52 owns this. Not edited here.
- **Ticket 38 parking comment** (open):
  - Item 1, *"Mobile builds stay hand-run (`eas build`)"*: **amend**. The reasoning holds (a slow build that needs a human to promote it in Play gains nothing from automation). The command becomes `./gradlew bundleRelease` (or Gradle Play Publisher's `publishBundle`, §2.5). The body's "EAS build profiles… including the ticket 19 guardrail" becomes Gradle build variants with the guardrail in `buildTypes`.
  - Item 2 (expand/contract plus version gate; `AUTO_UPDATE_DEFAULT` for the driver app): **survives**. The Android Management API update modes act on the installed package, however it was built. For the customer app the gate matters more, because there's no OTA path (§2.5).
  - Items 3 (pilot against production), 5 (seed script, position simulator), 6 and 7 (environments, plan): **survive**.
  - Item 4 (feature-flag kill switches): **survives, and matters more.** With no OTA, a kill switch is the only lever short of a Play release.
- **Ticket 46** (open, observability) lists "Expo push errors" as a signal. It becomes FCM send errors, which are synchronous per message (§2.4). **Ticket 39** (open, battery) doesn't depend on the stack as long as Transistorsoft is kept, since it's the same native core measuring the same thing.
- **Prototypes.** All five (`14`, `15`, `30`, `31`, `32`) are standalone HTML files. None is React Native or Expo, and none contains a reference to either. All survive.
- **ADRs.** Only `0002` mentions the mobile stack, in passing: "FCM/APNs (or Expo's push service) is composed on top regardless". It already covers direct FCM. Nothing to change.

---

## 2. Facts the switch depends on

### 2.1 Background location: Transistorsoft ships a native Kotlin SDK

- **It exists and is first-party.** [`transistorsoft/native-background-geolocation`](https://github.com/transistorsoft/native-background-geolocation) lists "Swift / iOS" and "Kotlin / Android" as native implementations beside the React Native, Flutter, Capacitor and Cordova wrappers. The [native docs](https://docs.transistorsoft.com/native/) describe Android as "implemented in Kotlin and Java… distributed as an Android Archive (.aar)", with a "SQLite persist-first HTTP queue", a "motion-detection state machine", and "survives termination & reboot".
- **Installation** ([Kotlin setup](https://docs.transistorsoft.com/kotlin/setup/)): `implementation("com.transistorsoft:tslocationmanager:4.5.+")` from Maven Central, plus `play-services-location:21.3.0`, `minSdk 24`. The licence key goes in `AndroidManifest.xml` as `com.transistorsoft.locationmanager.license`. Initialised with `BGGeo.init()` in the `Application` class. The AAR merges its own permissions, services and receivers.
- **It is the same core the React Native plugin uses.** [`react-native-background-geolocation/android/build.gradle`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/android/build.gradle) sets `DEFAULT_TSLOCATIONMANAGER_VERSION = "4.6.+"` and declares `api "com.transistorsoft:tslocationmanager:$tslocationmanagerVersion"`. That is primary evidence that ticket 03's capabilities live in the native layer.
- **It is maintained.** `CHANGELOG-Android.md` shows 4.5.1 on 2026-09-04, 4.5.0 on 2026-08-15, and releases every few weeks before that. The repo was last pushed 2026-09-07.
- **Licence.** The [purchase page](https://docs.transistorsoft.com/purchase/?platform=kotlin) lists the same four perpetual tiers ticket 17 found (Starter $399 for 1 key, Venture $599, Pro $749, Studio $999), each with "1 year access to latest updates". You pick the platform, "React Native, Flutter, Capacitor, Cordova, Swift / Kotlin", in the next step: one licence structure for every platform. The key is "bound to your Android applicationId". Debug builds are "fully functional… no license required". Release builds need a key.
- **The Kotlin API covers every hook the map relies on.** The [Kotlin reference](https://docs.transistorsoft.com/kotlin/) includes `HttpConfig`, `AuthorizationConfig`, `PersistenceConfig`, `NotificationConfig` (ticket 16's duty-scoped foreground strings), `HeartbeatEvent` (ticket 07's 60 s heartbeat) and `ProviderChangeEvent` (ticket 16's downgrade detection). Example config: `app.stopOnTerminate = false`, `app.startOnBoot = true`, `geolocation.distanceFilter`.

**If we did *not* use Transistorsoft**, which is not the case the facts point to, but ticket 51 asked, this is what we'd own:

| Ticket 03 requirement | What we'd build | Platform facts |
|---|---|---|
| Continuous capture while backgrounded | `FusedLocationProviderClient.requestLocationUpdates` inside a **`location`-typed foreground service** | [FGS types](https://developer.android.com/develop/background-work/services/fg-service-types): declare `FOREGROUND_SERVICE_LOCATION`. "You cannot create a `location` foreground service while your app is in the background, unless you've been granted `ACCESS_BACKGROUND_LOCATION`." Ticket 18's MDM pre-grant provides that. |
| ~10–15 s moving cadence, 60 s stationary heartbeat | Distance-filtered `LocationRequest` plus our own stationary/moving state machine, probably on the Activity Recognition API | The Transistorsoft motion state machine is the main battery mechanism (ticket 03). Rebuilding it is the largest single piece. |
| Offline buffering and replay | Room table plus a WorkManager upload job with retry | Ours to write, test, and cap (the equivalent of `maxDaysToPersist`). |
| Survive swipe-away and reboot | A foreground service that isn't bound to the task, plus a `BOOT_COMPLETED` receiver | Android 15 bars `BOOT_COMPLETED` from starting `dataSync`, `camera`, `mediaPlayback`, `phoneCall`, `mediaProjection`, `microphone` FGS types. **`location` is not on the list** ([Android 15 changes](https://developer.android.com/about/versions/15/behavior-changes-15)). |
| "Survive force-quit" | **Not achievable by anyone** if it means Settings → Force stop | Android 15: the system "cancels all pending intents when the app enters the stopped state", and apps leave that state "only… through direct or indirect user action" ([Android 15, all apps](https://developer.android.com/about/versions/15/behavior-changes-all)). Transistorsoft can't do it either. On Android, ticket 03's "survives force-quit" can only mean swipe-away and OS kills. This doesn't depend on the stack; recorded so nobody reads it as a native regression. |

### 2.2 Supabase from Kotlin: `supabase-kt`

- **It's community-maintained, and Supabase says so.** From the [Kotlin reference](https://supabase.com/docs/reference/kotlin/introduction): "The Kotlin client library is created and maintained by the Supabase community, and is not an official library." It lives at [`supabase-community/supabase-kt`](https://github.com/supabase-community/supabase-kt) (MIT, 843 stars, not archived).
- **It's alive, with a bus factor of one.** Recent releases: 3.8.0 on 2026-08-26, 3.7.0 on 2026-07-20. Last push 2026-09-21. Contributors by commit count: `jan-tennert` 2,535, `dependabot` 363, next human 113 (GitHub API). The Supabase docs name jan-tennert as maintainer. Requirements: Android minSdk 26, Kotlin 2.3.21+, Ktor 3.4.3+ (README).
- **Auth: session refresh across an 8-hour duty day.** The `Auth` plugin defaults are `alwaysAutoRefresh = true`, `autoLoadFromStorage = true` and `autoSaveToStorage = true`, with a pluggable `sessionManager` ([initializing](https://supabase.com/docs/reference/kotlin/initializing)). Under native Kotlin the Transistorsoft foreground service keeps the app process alive, so the refresh loop runs in the same process as capture. React Native didn't have that (ticket 09 relied on JavaScript wake-ups). ⚠️ Not verified: what the default Android session storage is and whether it's encrypted.
- **Wiring the JWT into ingest.** There are two options, and neither is decided here.
  - (a) Let Transistorsoft's native HTTP layer post to the ingest Edge Function and hand it the Supabase JWT through `AuthorizationConfig`. That supports `strategy = "JWT"`, `accessToken`, `refreshToken`, `refreshUrl`, `refreshPayload` with a `{refreshToken}` template, and `expires` for proactive refresh ([AuthorizationConfig](https://docs.transistorsoft.com/kotlin/AuthorizationConfig/)). ⚠️ The SDK posts the refresh as `application/x-www-form-urlencoded`. I didn't verify that Supabase Auth's token endpoint accepts that encoding.
  - (b) Take fixes in `onLocation` and post them with the `supabase-kt` client, owning the retry (Room/WorkManager) ourselves.

  React Native faced the same choice, so this isn't a new problem. It is now a Kotlin-side decision, though.
- **Realtime Broadcast (ticket 06).** Supported through `channel.broadcastFlow<T>(event)` with `@Serializable` types ([subscribe](https://supabase.com/docs/reference/kotlin/subscribe)). **Private channels** (needed for Realtime Authorization on per-Delivery channels) are supported: `RealtimeChannelBuilder` has `var isPrivate = false` ([source](https://github.com/supabase-community/supabase-kt/blob/master/Realtime/src/commonMain/kotlin/io/github/jan/supabase/realtime/RealtimeChannelBuilder.kt)). `RealtimeImpl` calls `setAuth(session.accessToken)` whenever the session becomes `Authenticated` and then `updateAuth` on every subscribed channel ([source](https://github.com/supabase-community/supabase-kt/blob/master/Realtime/src/commonMain/kotlin/io/github/jan/supabase/realtime/RealtimeImpl.kt)), so a refreshed JWT reaches live channels.
- **Storage signed URLs (ticket 11).** `BucketApi.createSignedUrl(path: String, expiresIn: Duration)`, `createSignedUrls(...)` and `createSignedUploadUrl(...)` all exist ([source](https://github.com/supabase-community/supabase-kt/blob/master/Storage/src/commonMain/kotlin/io/github/jan/supabase/storage/BucketApi.kt)).
- **Generating Kotlin types from the schema: no official path.** `supabase gen types --lang` accepts only `typescript | go | swift | python` ([CLI reference](https://supabase.com/docs/reference/cli/supabase-gen-types)). `supabase-kt` has no code generator (no KSP or codegen module in the repo tree or the Postgrest README). The candidates:
  - Hand-written `@Serializable` data classes. The simplest, and they drift silently.
  - Generating from PostgREST's own OpenAPI description, which "PostgREST automatically serves… on the root path" ([PostgREST docs](https://docs.postgrest.org/en/stable/references/api/openapi.html)), through a Kotlin OpenAPI generator. ⚠️ Not verified: whether hosted Supabase exposes that description to an anon or service key, and how good generated Kotlin is.
  - Keeping the Kotlin surface narrow (a few RPCs and views) so there are fewer types to drift.

  This replaces ticket 08's "types stay in sync via Supabase's generated types" for mobile only. The web and backend keep `supabase gen types typescript`.

### 2.3 Maps: Mapbox Maps SDK for Android

- **Licence.** [`mapbox-maps-android/LICENSE.md`](https://github.com/mapbox/mapbox-maps-android/blob/main/LICENSE.md): "licensed under the Mapbox TOS for use only with the relevant Mapbox product(s)". The licence "terminates automatically if a developer no longer has a Mapbox account in good standing". Changes that "interfere with marked portions of the code related to billing, accounting, or data collection are not authorized". The SDK "sends limited de-identified location and usage data". The operative terms are the Mapbox TOS and **Product Terms**, the same document ticket 41 read.
- **These are not new terms.** `@rnmapbox/maps` is MIT itself, but its `android/build.gradle` rejects Mapbox v10 ("Mapbox v10 is no longer supported as of @rnmapbox/maps 10.3.0 — Please upgrade to Mapbox v11.x") and its MapLibre/MapboxGL implementations have been removed. The React Native path therefore already shipped this exact native SDK under these exact terms. **Ticket 41's rules (`permanent=true`, no Search Box, no stored Directions output, no raw lat/lng shown to end users) carry over unchanged.** Mobile billing is per MAU on either stack, because it's the same SDK.
- **What changes.** Mapbox maintains the Android SDK itself. The accepted risk ticket 02 recorded (Mapbox disclaims the React Native binding, and the repo is looking for maintainers) doesn't exist under native Kotlin.
- **Search SDK caution (for ticket 33).** The Mapbox Search SDK for Android has `ApiType.GEOCODING` (the default) and `ApiType.SBS` ("will soon be replaced with Mapbox Search Box API") ([search-engine guide](https://docs.mapbox.com/android/search/guides/search-engine/)). The SBS/Search Box path is forbidden by ticket 41. ⚠️ I didn't verify whether the GEOCODING engine targets v6 or can send `permanent=true`. Calling the Geocoding v6 REST API directly is the path known to comply.

### 2.4 Push: direct FCM instead of Expo push

- **Expo was never an alternative to FCM, only a layer on top of it.** Expo's docs: "Expo also handles sending push notifications off to FCM and APNs", and you must upload "FCM V1 server credentials" ([sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/)). Going direct removes a hop. It doesn't add a vendor.
- **What changes in ticket 12's model.**
  - **Credentials:** the Edge Function now holds a Google **service-account key** and mints an OAuth access token (scope `https://www.googleapis.com/auth/firebase.messaging`) to call FCM HTTP v1. Supabase's own guide shows exactly this, with the same "database webhook → Edge Function" trigger shape and an `fcm_token` column on `profiles` ([Supabase push guide](https://supabase.com/docs/guides/functions/examples/push-notifications)). That's one more secret to manage. The trigger doesn't change.
  - **Fire-and-forget:** unchanged, and slightly more honest. Expo's ticket only means Expo received the message, and Expo says "you must check your push receipts… 15 minutes after sending", which ticket 12 chose not to do. FCM's send response is per message and immediate.
  - **Token lifecycle:** FCM's [token guidance](https://firebase.google.com/docs/cloud-messaging/manage-tokens) says to store registrations with a timestamp refreshed on every upload. Firebase considers them stale after one month of inactivity, Android expires them after 270 days, and `UNREGISTERED` (404) or `INVALID_ARGUMENT` (400) mean delete ("verify message validity before deleting" for 400). Ticket 12's single overwritable token and its clear-on-deactivation rule stand. Pruning on `UNREGISTERED` is a cheap addition that doesn't need a receipt loop. (The current page talks about Firebase Installation IDs and an `onRegistered()` callback. Match the exact client API to the Firebase SDK version at build time.)
  - The Android 13+ notification runtime permission, channels, and ticket 35's device-local notification don't depend on the stack.

### 2.5 Build and release without EAS

- **Build variants per environment.** Standard Gradle `buildTypes` and `productFlavors`. Ticket 38's likely layout (local plus production, with on-demand preview branches) is a flavour or a `buildConfigField` for the Supabase URL and anon key.
- **The ticket 19 guardrail in Gradle terms.** The licence check keys on build type, and on native Kotlin the Transistorsoft docs say only "Debug builds work without one". The guardrail becomes: *the unlicensed pilot is the `debug` buildType, and no custom buildType is introduced for it.* The fact that Play rejects debuggable uploads (ticket 52's collision) doesn't depend on the stack.
- **Signing.** Play App Signing with your own upload key, as ticket 18 already recommended. That doesn't depend on the stack.
- **Publishing tools.**
  - [Gradle Play Publisher](https://github.com/Triple-T/gradle-play-publisher): MIT, 4.1.1 released 2026-08-11, active.
  - [fastlane](https://github.com/fastlane/fastlane) (`supply`): 2.240.1 released 2026-09-15.

  Either can drive Play tracks, including the closed-testing track tickets 20 and 21 chose.
- **The driver app on managed Google Play.** Ticket 18's private-app route (the EMM iframe, or the [Play Custom App Publishing API](https://developers.google.com/android/work/play/custom-app-api/get-started) for EMMs) takes the signed artifact, whoever built it. Nothing changes.
- **Over-the-air updates: none, and Play policy forbids them.** From the [Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/9888379): "An app distributed via Google Play may not modify, replace, or update itself using any method other than Google Play's update mechanism. Likewise, an app may not download executable code (such as dex, JAR, .so files) from a source other than Google Play." The exemption, "code that runs in a virtual machine or an interpreter… (such as JavaScript in a webview or browser)", is what makes EAS Update lawful, and native Kotlin can't use it. (EAS Update itself only ever covered "non-native pieces (such as JS, styling, and images)" ([EAS Update](https://docs.expo.dev/eas-update/introduction/)).)
  - **What's left for the customer app:** Play releases; the [Play In-App Updates API](https://developer.android.com/guide/playcore/in-app-updates) ("immediate" flow: "require the user to update and restart the app in order to continue using it"), which speeds up adoption of a Play build but isn't a code push; ticket 38's version gate; and ticket 38's feature-flag kill switches. In-App Updates was also available to React Native through community wrappers ⚠️, so it isn't a native-only gain.
  - **For the driver app nothing is lost.** It was always force-updated through the Android Management API (ticket 38 item 2).
  - **Scale of the loss.** EAS Update isn't on any closed ticket. The map never decided to rely on it. Ticket 52 calls it "the proposed fast path". What goes is a proposed mitigation, not a settled decision.

### 2.6 Code sharing with the TypeScript side

Both mobile apps would be Kotlin, so a Gradle module can hold one Kotlin copy used by both. The question is TypeScript versus Kotlin, **two copies, not three**.

**Already server-authoritative, so it can't diverge on any stack.** Submission totals and the four checkout gates (29: one Edge Function), the tolerance check and Price approval (28), conditional writes on every contested transition (37, 35), duty auto-end (34), rate limiting and the accuracy floor (06, 07), radius verdicts (23, recomputed server-side), RLS (09).

**Stays shared, TypeScript only (web and backend):** `packages/domain` for the dispatcher console and Edge Functions, `supabase gen types typescript`, `packages/config`. The Mapbox **style JSON** stays shared as a file (Android loads a style from a URI or JSON string, and it's an asset rather than code). The Android build can copy it in.

**Duplicated into Kotlin (the mobile copy):**

| Rule | Source ticket | Also in TypeScript? | Note |
|---|---|---|---|
| `interpolatePosition` (straight-line, freeze-on-gap, no extrapolation) | 02, 07 | Yes (dispatcher map) | Both copies must agree on behaviour. The driver's own map (32) and the customer map (14) share the Kotlin copy. |
| Staleness tiers (Live <90 s / Stale 90 s–3 min / Lost >3 min) | 07, 14 | Yes (console pin colouring) | Thresholds only. Could be served from config. |
| Status vocabulary: courier/prep enums | 01 | Yes | Postgres enums, hand-mirrored in Kotlin (no generator, §2.2). |
| Customer-facing label derivation ("on its way", "Delayed", "We're contacting you about a weight change", the time-confirmation label) | 01, 14, 28, 35, 36, 42 | **No.** Customer app only | One Kotlin copy. Could move server-side (a view or function returning the label) if a second client ever needs it. |
| Price formatting: centavos → `₱1,150`, `~` prefix on per-weight figures, `/kg` rate display, round-once rule for the cart's running estimate | 27, 30, 29 | Yes (console and packing bench show money) | The **binding** figures are computed server-side at submit. Client figures are display estimates, so a mismatch is cosmetic, not a money error. |
| Chip generation from `weight_step_grams` | 30 | No | Customer app only. |
| Haversine hero distance | 14 | Console ranking uses distance too (15) | Trivial function. |
| PH phone "light validation" | 33, 40 | Console may edit snapshot phone fields (33) | Loose rule by design. |
| Client-side gate courtesies (store hours, radius pre-check) | 22, 23, 29 | No | "The client half of every gate is a courtesy; the server half is the rule" (29). A drift only degrades a hint. |

**Options for keeping copies aligned (none recommended here):**

- Language-neutral fixture files (inputs plus expected outputs) run by both the Vitest and JUnit suites.
- Pushing more derivation server-side, into views or RPCs that return display-ready values.
- Kotlin Multiplatform compiled to JavaScript for the shared rules. Note that ticket 52 records the dev ruled out KMP *for iOS*, not for this. ⚠️ Not assessed.

---

## Not primary-sourced

- ⚠️ **Transistorsoft on native: termination and boot behaviour in detail.** The capability claims ("survives termination & reboot", SQLite persist-first queue) come from the native docs index and the Kotlin config example (`stopOnTerminate = false`, `startOnBoot = true`). I didn't read the detailed `AppConfig`/`PersistenceConfig` pages for Kotlin. The strongest evidence that behaviour matches the React Native plugin is structural: the plugin wraps the same `tslocationmanager` artifact.
- ⚠️ **Transistorsoft licence trigger on native.** "Debug builds work without one" is primary. That the trigger is the *build type* and not the `debuggable` flag rests on ticket 19's GitHub-issue evidence for the shared core, and I assumed it holds for direct native use.
- ⚠️ **`supabase-kt` Android session storage.** Whether the default session manager encrypts the persisted refresh token wasn't verified.
- ⚠️ **Transistorsoft `AuthorizationConfig` against Supabase's token endpoint.** The SDK refreshes with a form-encoded POST. Whether Supabase Auth accepts that body wasn't verified.
- ⚠️ **Kotlin types via PostgREST OpenAPI on hosted Supabase.** Access to the root OpenAPI description and the quality of generated Kotlin weren't verified.
- ⚠️ **Mapbox Search SDK for Android and `permanent=true` / Geocoding v6.** Not verified. The direct REST path is known to comply.
- ⚠️ **Transistorsoft Swift SDK and `CLBackgroundActivitySession`.** Not checked (iOS, post-MVP).
- ⚠️ **Play In-App Updates wrappers for React Native.** Asserted from general knowledge, not checked.
- ⚠️ **Play refusing debuggable uploads.** Taken from ticket 52's framing and Play community threads, not an official policy page. It doesn't depend on the stack in any case.
- **Judgement, not fact:** the effort estimate implied by "the motion state machine is the largest single piece" of a hand-rolled pipeline.

## Sources

- Transistorsoft: [native repo](https://github.com/transistorsoft/native-background-geolocation) · [native docs](https://docs.transistorsoft.com/native/) · [Kotlin setup](https://docs.transistorsoft.com/kotlin/setup/) · [Kotlin examples](https://docs.transistorsoft.com/kotlin/examples/) · [Kotlin reference](https://docs.transistorsoft.com/kotlin/) · [AuthorizationConfig](https://docs.transistorsoft.com/kotlin/AuthorizationConfig/) · [purchase](https://docs.transistorsoft.com/purchase/?platform=kotlin) · [React Native plugin `build.gradle`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/android/build.gradle) · `CHANGELOG-Android.md` (native repo)
- Supabase: [Kotlin intro](https://supabase.com/docs/reference/kotlin/introduction) · [Kotlin initializing](https://supabase.com/docs/reference/kotlin/initializing) · [Kotlin subscribe](https://supabase.com/docs/reference/kotlin/subscribe) · [CLI gen types](https://supabase.com/docs/reference/cli/supabase-gen-types) · [push notifications guide](https://supabase.com/docs/guides/functions/examples/push-notifications) · [`supabase-kt` repo](https://github.com/supabase-community/supabase-kt) plus source files linked inline · GitHub API (releases, contributors)
- PostgREST: [OpenAPI](https://docs.postgrest.org/en/stable/references/api/openapi.html)
- Mapbox: [Maps SDK for Android LICENSE](https://github.com/mapbox/mapbox-maps-android/blob/main/LICENSE.md) · [Search SDK engine guide](https://docs.mapbox.com/android/search/guides/search-engine/) · [rnmapbox `build.gradle`](https://github.com/rnmapbox/maps/blob/main/android/build.gradle)
- Firebase / Expo: [FCM token management](https://firebase.google.com/docs/cloud-messaging/manage-tokens) · [Expo sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/) · [EAS Update intro](https://docs.expo.dev/eas-update/introduction/)
- Android / Play: [FGS types](https://developer.android.com/develop/background-work/services/fg-service-types) · [Android 15 behaviour changes (targeting 15)](https://developer.android.com/about/versions/15/behavior-changes-15) · [Android 15 behaviour changes (all apps)](https://developer.android.com/about/versions/15/behavior-changes-all) · [In-App Updates](https://developer.android.com/guide/playcore/in-app-updates) · [Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/9888379) · [Play Custom App Publishing API](https://developers.google.com/android/work/play/custom-app-api/get-started)
- Tooling: [Gradle Play Publisher](https://github.com/Triple-T/gradle-play-publisher) · [fastlane](https://github.com/fastlane/fastlane)
