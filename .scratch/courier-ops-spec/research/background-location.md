# Background location capture on the driver app

Research for [issue 03](../issues/03-background-location-capture-on-the-driver-app.md). Researched 2026-07-27.
Platform baseline at time of writing: **iOS 26**, **Android 16 (API 36)**, Expo SDK 57.

---

## TL;DR — the number ticket 07 needs

**"Live" realistically means a position roughly every 10–15 seconds while the vehicle is moving, with occasional gaps of 30–120 seconds, and rare gaps of minutes.** Design the customer map for interpolation between sparse points, not for a smooth 1 Hz feed.

Per platform:

| | Achievable while moving | Realistic worst case | Hard failure |
|---|---|---|---|
| **iOS** (Always auth, `location` background mode) | 1 point / 5–15 s, or 1 point / 50–100 m | 1 point / 2 min in dense urban canyon / poor GPS | User force-quits app → tracking stops until a ~200 m stationary-geofence exit relaunches it (Transistorsoft) or until the driver reopens the app (expo-location) |
| **Android** (foreground service, `location` type, background permission) | 1 point / 5–10 s (Pixel/AOSP/stock) | 1 point / 30–60 s on OEM-throttled devices | Aggressive OEM battery manager kills the service silently; no location until the driver reopens the app |

Do **not** promise sub-5-second freshness in the spec. Do not build a UI whose correctness depends on a point arriving on a fixed cadence.

---

## 1. Library choice

### The shortlist, with maintenance status (npm registry, checked 2026-07-27)

| Package | Latest | Published | Verdict |
|---|---|---|---|
| `expo-location` | 57.0.6 | 2026-07-22 | Actively maintained (part of Expo SDK) |
| `expo-task-manager` | 57.0.6 | 2026-07-22 | Actively maintained |
| `react-native-background-geolocation` (Transistorsoft) | 5.4.0 | 2026-07-24 | Actively maintained, commercial |
| `react-native-background-fetch` (Transistorsoft) | 4.4.2 | 2026-04-15 | Maintained; complementary, not a location solution |
| `@react-native-community/geolocation` | 3.4.0 | 2024-09-01 | Stale ~2 years; foreground only. **Not viable.** |
| `react-native-geolocation-service` | 5.3.1 | 2022-09-23 | Abandoned ~4 years. **Not viable.** |

There are effectively **two** viable options in 2026, not five.

### Recommendation: `react-native-background-geolocation` (Transistorsoft)

Use it under an **Expo development-build / prebuild (CNG)** workflow. It ships an Expo config plugin (`app.plugin.js`) that performs all native configuration during `expo prebuild` — no manual `Info.plist` / `AndroidManifest.xml` edits.
([README](https://github.com/transistorsoft/react-native-background-geolocation), [setup docs](https://docs.transistorsoft.com/react-native/setup/))

**Why, not expo-location:**

1. **It buffers and replays.** The SDK persists every recorded location to a native SQLite database and HTTP-POSTs to a configured `url`. `autoSync: true` (default) uploads each location as it is recorded; if the server does not answer `HTTP 200 OK` the record stays in the database and is retried until `maxDaysToPersist` (default **1 day** — raise this) elapses. `batchSync` + `maxBatchSize` batch the replay; `locationsOrderDirection` (default `ASC`) syncs oldest-first. `maxRecordsToPersist` defaults to `-1` (no limit). This is the single biggest differentiator: with `expo-location` **offline buffering and replay is entirely the app's job**, and it has to be done in JS inside a background task that the OS may kill mid-flight.
   ([`Config.d.ts`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/src/declarations/interfaces/Config.d.ts))

2. **It survives app termination, differently per platform.** `stopOnTerminate` defaults to `true`; set it `false` and:
   - **iOS**: before termination the SDK registers a *stationary geofence* of `stationaryRadius` (default 25 m, effectively ~200 m in practice) around the last known position. iOS maintains geofences at OS level across app termination *and device reboot*, so when the driver moves beyond it iOS cold-launches the app in the background and tracking resumes.
   - **Android**: the native background service simply keeps running headless. With `enableHeadless: true` you can respond to events in native/JS headless context; with a configured `url` the service keeps uploading with no JS involved at all.
   - `startOnBoot` (default `false`) resumes after device reboot.

   `expo-location`'s own docs state the opposite: *"Background location will stop if the user terminates the app"*, and *"on Android, a terminated app will not automatically restart when a location or geofencing event occurs due to platform limitations."* ([Expo Location docs](https://docs.expo.dev/versions/latest/sdk/location/))

3. **Motion-based state machine.** The SDK runs a two-state model — *stationary* (location services **off**) and *moving* (location services on) — switching on the native MotionActivity API (still / on_foot / in_vehicle …) plus a ~200 m geofence around the last position. `stopTimeout` (default **5 minutes**) is how long it waits in *moving* with no detected movement before powering location down — explicitly designed for "car waiting at a traffic light". This is the main battery mechanism and it is not reproducible on top of `expo-location`.
   ([Philosophy of Operation](https://github.com/transistorsoft/react-native-background-geolocation/wiki/Philosophy-of-Operation))

4. **Elastic distance filter.** `distanceFilter` (default 10 m) auto-scales with speed: rounded speed / 5 m/s × `distanceFilter`. At 27 m/s highway speed with `distanceFilter: 50` the effective filter becomes 300 m. Disable with `disableElasticity: true`, tune with `elasticityMultiplier`. For a courier van in city traffic this is roughly what you want; for a customer-facing map you may want `disableElasticity: true` and a fixed filter.

**The cost:** it is **commercial**. The SDK is fully functional in DEBUG builds without a licence; a licence key is required for **release** builds (iOS: `TSLocationManagerLicense` JWT in `Info.plist`; Android: `com.transistorsoft.locationmanager.license` manifest meta-data). Android also requires `minifyEnabled = true` and `shrinkResources = false` in the release build. ([setup docs](https://docs.transistorsoft.com/react-native/setup/))

> ⚠️ **Not verified from a primary source:** the actual licence price. The Transistor Software shop lists a "React Native Background Geolocation Premium License" but I could not retrieve a current price figure. Treat as a budget line item to confirm before committing.

### When `expo-location` + `expo-task-manager` would be enough

It is *not* enough here, but for the record it is genuinely viable if you accept: no offline replay (you write it), no tracking after termination, and a JS background task as the write path. `TaskManager.defineTask()` **must** be called in the global scope of the JS bundle, not inside a React lifecycle method, because the OS boots the JS runtime, runs the task, and shuts it down without mounting views. Expo Go cannot run it at all (TaskManager is unavailable on Android Expo Go; background execution is unsupported on iOS Expo Go) — a **development build is mandatory either way**. ([TaskManager docs](https://docs.expo.dev/versions/latest/sdk/task-manager/))

Its `startLocationUpdatesAsync` options map cleanly onto the natives: `accuracy` (Lowest ~3 km / Low ~1 km / Balanced ~100 m default / High ~10 m / Highest / BestForNavigation), `distanceInterval` (both platforms), `timeInterval` (**Android only**), `deferredUpdatesDistance` / `deferredUpdatesInterval` / `deferredUpdatesTimeout` (batching, background only), `pausesUpdatesAutomatically` + `activityType` (iOS), `showsBackgroundLocationIndicator` (iOS), `foregroundService` (Android notification config).

Its config plugin properties: `isIosBackgroundLocationEnabled`, `isAndroidBackgroundLocationEnabled`, `isAndroidForegroundServiceEnabled` (defaults to `true` when background location is on), `locationAlwaysAndWhenInUsePermission`.

The Expo issue tracker has a long tail of background-location reliability reports — [#27933](https://github.com/expo/expo/issues/27933) (iOS updates dead after termination), [#22445](https://github.com/expo/expo/issues/22445) (Android updates stop on backgrounding), [#32545](https://github.com/expo/expo/issues/32545) ("Foreground service cannot be started when the application is in the background"). These are mostly correct-behaviour-misunderstood-as-bugs, but they illustrate how much platform detail you inherit.

---

## 2. iOS specifics

### Authorization tiers

- **When In Use** — foreground only *by default*.
- **Always** — required for the app to be launched/resumed into the background for location.

Since iOS 13 **you cannot get Always in one prompt.** `requestAlwaysAuthorization()` first shows a When-In-Use-style prompt; iOS later, at a moment of its choosing, shows a second "provisional Always" prompt offering *Change to Always Allow* vs *Keep Only While Using*. If the driver taps *Change to Always Allow*, the app can subsequently be woken from a killed state.

> ⚠️ **Partly unverified:** I could not retrieve Apple's own current wording of these prompts from a primary source (the flow is described in WWDC 2019 session 705 and reproduced widely in Apple developer forum threads). Assume the driver sees two prompts on different days and design onboarding around confirming the second one landed. **Do not** assume Always is granted just because the first prompt succeeded.

### Background mode — mandatory and fatal to get wrong

From Apple's `allowsBackgroundLocationUpdates` documentation, verbatim:

> Apps that receive location updates when running in the background must include the `UIBackgroundModes` key (with the `location` value) in their app's `Info.plist` file. After including the `UIBackgroundModes` key, set the value of `allowsBackgroundLocationUpdates` to `true`.
>
> When the value of this property is `true` and you start location updates while the app is in the foreground, Core Location configures the system to keep the app running to receive continuous background location updates, and arranges to show the background location indicator (blue bar or pill) if needed. Updates continue even if the app subsequently enters the background.
>
> **Important:** Setting the value to `true` but omitting the `UIBackgroundModes` key and `location` value in your app's `Info.plist` file is a fatal error that terminates the app.

([Apple: `allowsBackgroundLocationUpdates`](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates))

Required `Info.plist` purpose strings: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription` (and legacy `NSLocationAlwaysUsageDescription`). Transistorsoft additionally requires `NSMotionUsageDescription` (motion detection) and `BGTaskSchedulerPermittedIdentifiers` containing `com.transistorsoft.fetch`, plus the `fetch` and `processing` background modes.

### The blue pill

The background location indicator (blue bar / Dynamic Island pill) will be visible to the driver whenever background location is live. This is not suppressible in any legitimate configuration. It is arguably a feature for a fleet app — visible consent — but it must be in the driver onboarding copy.

### The two traps that silently kill iOS tracking

**Trap 1 — `pausesLocationUpdatesAutomatically`.** Apple's default on iOS is `true`. Verbatim from the docs:

> After a pause occurs, it's your responsibility to restart location services again when you determine that they're needed. […] For apps that have in-use authorization, a pause to location updates ends access to location changes until the app launches again and is able to restart those updates.

([Apple: `pausesLocationUpdatesAutomatically`](https://developer.apple.com/documentation/corelocation/cllocationmanager/pauseslocationupdatesautomatically))

**Set this to `false`** for a courier app, or accept that iOS will stop delivering updates at the first long stop and never resume itself. Transistorsoft handles this with its own stop-detection state machine instead; with raw `expo-location`, `pausesUpdatesAutomatically: false` is the correct setting and `activityType: 'automotiveNavigation'` is the right hint.

**Trap 2 — force-quit.** If the driver swipes the app out of the app switcher, iOS will not restart it for standard location updates. The only recovery paths are region monitoring / significant-change (which *do* survive termination and reboot at OS level) or the driver reopening the app. This is exactly the gap Transistorsoft's `stopOnTerminate: false` stationary-geofence trick closes.

### iOS 17+ modern APIs

`CLLocationUpdate.liveUpdates(_:)` (iOS 17+) is the modern async-sequence API, with `LiveConfiguration` values `.default`, `.automotiveNavigation`, `.fitness`, `.airborne`, `.otherNavigation`. `CLBackgroundActivitySession` (iOS 17+) — *"An object that manages a visual indicator that keeps your app in use in the background"* — lets a **when-in-use** authorized app receive background location updates without Always, at the cost of an always-visible indicator.
([liveUpdates](https://developer.apple.com/documentation/corelocation/cllocationupdate/liveupdates(_:)), [CLBackgroundActivitySession](https://developer.apple.com/documentation/corelocation/clbackgroundactivitysession))

**This is worth flagging to the spec as a possible privacy-friendlier variant** — a driver grants only When In Use, and the app holds a `CLBackgroundActivitySession` for the duration of a job. It avoids the awkward two-stage Always prompt and the "you're tracking me off-shift" objection entirely, since the session is scoped to the job. Caveats: neither `expo-location` nor Transistorsoft exposes it as a first-class option today (**not verified** — I found no config surface for it in either library's public API), and Apple's own docs note Core Location will not keep a backgrounded app alive without a Live Activity or a `CLBackgroundActivitySession` in effect. If the driver-shift model (map: "Not yet specified") lands on explicit on-shift/off-shift, this deserves a follow-up spike.

> ⚠️ **Unverified, treat with suspicion:** developer-forum reports of iOS 26 authorization-status regressions (status staying `.notDetermined` where iOS 18.5 returned `.authorizedWhenInUse`). I could not confirm this against Apple release notes. Budget device-testing time on iOS 26 specifically.

---

## 3. Android specifics

### Foreground service is not optional

Continuous location in the background **requires** a foreground service typed `location`:

- Manifest: `android:foregroundServiceType="location"` on the service
- Permission: `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`
- `startForeground()` constant: `FOREGROUND_SERVICE_TYPE_LOCATION`
- Runtime prerequisite: location services enabled **and** `ACCESS_COARSE_LOCATION` or `ACCESS_FINE_LOCATION` granted

Android's own listed use case for this type is *"Long-running use cases that require location access, such as navigation and location sharing"* — a courier app is squarely inside it.
([Android: foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types))

Since Android 14 (API 34), failing to declare the type **and** its matching permission throws `SecurityException`. ([FGS changes](https://developer.android.com/develop/background-work/services/fgs/changes))

**Good news for us:** Android 15's foreground-service timeouts apply to `dataSync` and `mediaProcessing`, and Android 16's runtime quotas apply to *background jobs started from* a foreground service (JobScheduler / WorkManager / DownloadManager). The `location` FGS type is **not** listed as time-bounded. A location FGS may run indefinitely. Do not do your uploading via WorkManager jobs spawned from the service on Android 16 — let the native SDK's own HTTP layer do it.

### The persistent notification

Non-negotiable and non-dismissible. Transistorsoft's own docs are blunt: since Android 8, `foregroundService` *"Defaults to `true` and cannot be set to `false`… A persistent Notification is required by the operating-system with a foreground-service. It cannot be hidden."*

Spec implication: the notification is a product surface. It should say something useful ("Delivering job #1234 — tap to open") and it doubles as the driver's proof that tracking is live. Design it deliberately.

### `ACCESS_BACKGROUND_LOCATION`

- Required on Android 10+ (API 29+) for any location access while backgrounded. Without it declared, the system never offers the user the **"Allow all the time"** option.
- Must be requested **separately and after** the foreground permission — a two-step flow, never bundled.
- The critical interaction: *"You cannot create a `location` foreground service while your app is in the background, unless you've been granted the `ACCESS_BACKGROUND_LOCATION` runtime permission."* So a foreground service started while the app is visible does not itself need the background permission — but restarting the service after the OS kills it, or on boot, does.
- Without a foreground service and without this permission, a backgrounded app *"can receive location updates only a few times each hour"* (Android 8.0+ background location limits).

([Android: access location in the background](https://developer.android.com/develop/sensors-and-location/location/background))

### OEM battery-optimisation killers

This is the biggest unfixable reliability hole on Android, and the spec must acknowledge it rather than pretend it away. Per [dontkillmyapp.com](https://dontkillmyapp.com/) the worst offenders, in order: **Huawei, Xiaomi (non-Android-One), OnePlus, Samsung** (notably worse since Android P), Meizu — followed by Asus, Oppo, Vivo, realme, Motorola, Sony, Tecno and others. AOSP, Google Pixel, Nokia and HTC score zero violations.

These devices kill foreground services and clear alarms despite the platform contract. Mitigations, none of them complete:

1. Request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` / send the driver to the battery-optimisation exemption screen during onboarding.
2. Walk the driver through the OEM's *autostart* manager (Xiaomi Security app, Huawei phone manager, Samsung "Sleeping apps" / "Never sleeping apps").
3. `startOnBoot: true` so a reboot-based kill recovers.
4. Server-side staleness detection — treat "no point for N minutes from an on-shift driver" as an alert, not as a driver standing still. This is a hard dependency for the map's *"Observability for the location pipeline"* item.

**Strong recommendation for the spec:** if the fleet's device policy is under the business's control, standardise on stock-Android or Pixel handsets. It is cheaper than engineering around Xiaomi.

### Play target-API deadline (operational, near-term)

From **31 August 2026**, new apps and updates must target **Android 16 (API 36)** or higher to be submitted to Google Play; extensions to 1 November 2026 can be requested. This is five weeks away and affects the very first release. ([Play Console: target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878))

---

## 4. App-store review

### Google Play — the harder of the two

Background location requires a **Permissions Declaration Form** in Play Console. Requirements, from the policy page:

- Describe **one** location-based feature only. *"We can only evaluate one feature at a time. The inclusion of multiple features will result in an app's rejection."*
- Supply a **video of 30 seconds or less** demonstrating that feature, and it must show the prominent disclosure dialog and the runtime prompt.
- Supply **working test credentials** so the reviewer can verify. For a driver app this means a demo driver account with a job that can be started on demand — a genuine build requirement, not an afterthought.

Review criteria: background location must be essential to the app's core purpose, deliver clear user value, be something users would reasonably expect, and be impossible to deliver otherwise.

**Prominent disclosure** must appear *before* the runtime prompt, must contain the word "location", must state the background nature with wording like *"when the app is closed"* or *"not in use"*, and must list every feature that uses it. Recommended template: *"[App name] collects location data to enable [features] even when the app is closed or not in use."*

([Play Console: understanding location in the background permissions](https://support.google.com/googleplay/android-developer/answer/9799150))

**The trap that matters most for us.** The policy lists as an example of a use case that should use *foreground* location instead:

> Delivery/service tracking (for things like food, packages, or a ride) **for users (not drivers)**.

Read the parenthetical carefully — it excludes *users*, not drivers. The **customer** app must therefore **not** request background location; it consumes positions from the server. The **driver** app has the legitimate claim. Two separate binaries with two very different permission profiles: this is a strong argument against ever merging them into one app with a role switch.

Google's 2026 permissions guidance reiterates "minimum scope" — coarse over fine, foreground over background — and requires background location be restricted to *"essential functions that directly benefit the user and are central to the app's core purpose"*, never for advertising or analytics. ([Permissions and APIs that access sensitive information](https://support.google.com/googleplay/android-developer/answer/16585319))

The new **"Minimum Scope: Foreground Location Access and the Location Button"** policy (enforcement expected **late October 2026**, ~28 Oct, applying to apps targeting **Android 17 / API 37**) mandates a system location button for *transactional* precise-location use cases. It **explicitly excludes background access** and exempts continuous fine location where essential to core functionality, naming turn-by-turn navigation. It does not block the driver app, but the **customer** app's "where am I / show me nearby" flows may fall under it once we target API 37. ([Minimum scope policy](https://support.google.com/googleplay/android-developer/answer/17033915))

### Apple — less paperwork, sharper rejection

Relevant guidelines, verbatim:

> **2.5.4** Multitasking apps may only use background services for their intended purposes: VoIP, audio playback, location, task completion, local notifications, etc.

> **5.1.5** Use Location Services in your app only when it is directly relevant to the features and services provided by the app. […] Ensure that you notify and obtain consent before collecting, transmitting, or using location data. If your app uses Location Services, be sure to explain the purpose in your app.

([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))

There is no Apple equivalent of Play's declaration form; enforcement is via reviewer judgement plus your `NSLocation*UsageDescription` strings, which reviewers read closely. Write them as specific job-scoped sentences ("…so the customer can see your van approaching while you deliver"), never generic ones.

> ⚠️ **Not verified from a primary source, but consistently reported and high-stakes:** two long-standing 2.5.4 rejection patterns surface repeatedly in Apple Developer Forums — (a) apps using the location background mode *for the sole purpose of tracking employees* get rejected, and (b) apps declaring the location background mode are asked to add a battery disclaimer to the App Store description, conventionally *"Continued use of GPS running in the background can dramatically decrease battery life."* Neither appears in the current published guidelines text I retrieved. **Mitigation is cheap and should be baked into the spec regardless:** frame the feature as *customer-facing delivery tracking* (which it genuinely is), give the driver visible in-app benefit from their own location (job navigation, arrival detection, proof of delivery), scope tracking to an active job rather than to the working day, and include the battery sentence in the store description.

### Privacy disclosures

Both stores need matching answers: Play **Data safety** section and Apple **Privacy Nutrition Label** must both declare precise location, collected, linked to identity, used for app functionality. Cross-check these against whatever retention decision the backend ticket lands on — a mismatch between the label and reality is its own rejection class.

---

## 5. Practical delivery characteristics

### Triggering: distance vs time

- **iOS**: distance-based only from Core Location's own filter. `distanceFilter` default is `kCLDistanceFilterNone` ("all movement should be reported"). ([Apple: `distanceFilter`](https://developer.apple.com/documentation/corelocation/cllocationmanager/distancefilter)) A time interval is not a Core Location concept; it must be emulated in app code.
- **Android**: both. Fused Location Provider takes an interval. In Transistorsoft, `locationUpdateInterval` (default **1000 ms**) is **Android-only and ignored unless `distanceFilter: 0`**; `fastestLocationUpdateInterval` defaults to 10000 ms. Apps holding only coarse permission *"may have their interval silently throttled"*.

**Recommendation:** drive off `distanceFilter` as primary (it is the only cross-platform mechanism), and add an app-level heartbeat so a stationary-but-on-job driver still produces a "still here" ping. Transistorsoft's `heartbeatInterval` (default 60 s) gives you this on both platforms.

Suggested starting config for a delivery van (to be tuned on real devices):

```
desiredAccuracy: DESIRED_ACCURACY_HIGH   // GPS; only HIGH gives speed/heading/altitude
distanceFilter: 50                        // ~1 point / 50 m at low speed
disableElasticity: false                  // let it stretch at highway speed
stopTimeout: 5                            // minutes; survives traffic lights
heartbeatInterval: 60
stopOnTerminate: false
startOnBoot: true
maxDaysToPersist: 7                       // default is 1 — too short for a weekend outage
autoSync: true
```

### Accuracy tiers and battery

Transistorsoft's accuracy ladder (identical semantics to the natives underneath):

| Constant | Providers | Cost |
|---|---|---|
| `DESIRED_ACCURACY_NAVIGATION` (iOS only) | GPS + WiFi + Cellular | Highest power, highest accuracy |
| `DESIRED_ACCURACY_HIGH` | GPS + WiFi + Cellular | Highest power, highest accuracy |
| `DESIRED_ACCURACY_MEDIUM` | WiFi + Cellular | Medium |
| `DESIRED_ACCURACY_LOW` | WiFi (low power) + Cellular | Lower, **no GPS** |
| `DESIRED_ACCURACY_VERY_LOW` | Cellular only | Lowest |

**Only `HIGH` (and iOS `NAVIGATION`) uses GPS**, and `speed`, `heading` and `altitude` are available *only* from GPS. A map that draws a heading arrow therefore forces `HIGH`. Expo's equivalent enum: `Balanced` ≈ 100 m (its default), `High` ≈ 10 m, `Highest`, `BestForNavigation`.

> ⚠️ **Unverified:** I found **no primary-source battery benchmark** for any of these libraries or for continuous GPS on modern iOS/Android hardware. Transistorsoft's docs describe the mechanism (turning location services fully off when stationary) but publish no quantitative claim. Vendor blog numbers circulating for "continuous GPS costs X %/hour" are not traceable to Apple or Google. **Action: measure on the actual fleet handsets during a pilot shift before committing any battery promise to the spec.** The qualitative ordering — GPS-on continuously ≫ motion-gated GPS ≫ network-only — is safe; the magnitudes are not.

### Achievable frequency, honestly

**iOS.** With Always authorization, `UIBackgroundModes: [location]`, `allowsBackgroundLocationUpdates = true`, `pausesLocationUpdatesAutomatically = false`, `desiredAccuracy` best and `distanceFilter` none, Core Location delivers standard-location updates continuously while backgrounded and screen-locked. In practice that is roughly one fix per second while GPS has a lock.

> ⚠️ **The ~1 Hz figure is not documented by Apple.** It is the conventional GNSS fix rate and is universally observed, but Apple documents no delivery-rate guarantee. Treat 1 Hz as an upper bound, not a contract.

You should not *want* 1 Hz. Recommend targeting **one point every 5–15 seconds or every 50–100 m while moving**, which is more than smooth enough for a customer watching a van, and cuts both battery and ingestion cost by an order of magnitude. Expect degradation to 30–120 s in urban canyons, underground car parks and lifts.

**Android.** With a `location`-typed foreground service, `ACCESS_BACKGROUND_LOCATION`, `PRIORITY_HIGH_ACCURACY` and `locationUpdateInterval: 5000`, 5-second updates are reliably achieved on stock Android. Android's own documentation warns the interval is *inexact* — *"You may not receive updates at all (if no location sources are available), or you may receive them slower than requested."* On OEM-throttled handsets, assume 30–60 s and intermittent total loss.

**Therefore the spec's contract should be: a point roughly every 10–15 seconds while moving, with gaps.** Anything the customer app shows must be built on interpolation plus an explicit staleness indicator ("last seen 2 minutes ago"), not on a guaranteed cadence.

### When the OS kills the app

| Scenario | iOS | Android |
|---|---|---|
| Backgrounded, screen locked | Keeps running (background mode + Always) | Keeps running (foreground service) |
| Memory pressure | App may be jetsammed; geofence relaunch via `stopOnTerminate: false` | FGS is *"mostly immune"* to memory-pressure termination |
| User force-quits (app switcher) | Stops. Relaunched on ~200 m stationary-geofence exit if `stopOnTerminate: false`. **Not** relaunched with `expo-location`. | Native service continues headless if `stopOnTerminate: false`; with `expo-location`, stops and does not restart |
| Device reboot | Geofence survives at OS level; app relaunches | `startOnBoot: true` (note: Android 15 restricts *some* FGS types from `BOOT_COMPLETED` — `location` is not among the blocked ones, but verify on device) |
| OEM battery manager | n/a | Silent kill; only mitigation is user-granted exemption + server-side staleness alerting |
| Driver disables location services | Tracking stops; `onProviderChange` event fires | Same |

### Buffering and replay — answering the ticket's last bullet directly

**With Transistorsoft: the library's job, and it does it well.** Native SQLite persistence, automatic HTTP POST with retry until `maxDaysToPersist`, `batchSync` for bulk replay, oldest-first ordering. This runs in the native layer, so it works even in Android headless mode after the app process is gone. Raise `maxDaysToPersist` from its 1-day default.

**With `expo-location`: entirely the app's job.** You would write points to local storage from inside the background task, then drain the queue on reconnect — in JS, in a runtime the OS spins up and tears down, with no guarantee your drain completes. This is the single strongest argument for paying for the Transistorsoft licence, and it directly de-risks the map's *"Offline and poor-signal behaviour on the driver app"* fog item.

One design note for the backend ticket: because points are replayed out of band, **every position must carry the timestamp of capture, not of receipt**, and the ingestion endpoint must be idempotent and tolerant of out-of-order arrival. `locationsOrderDirection: 'ASC'` gives oldest-first replay by default, but a batch can still land after newer real-time points.

---

## 6. Summary of recommendations for the spec

1. **Use `react-native-background-geolocation` (Transistorsoft) v5** on an **Expo development build / prebuild** workflow, via its Expo config plugin. Budget for the release licence.
2. **Two separate apps.** The driver app requests background location; the customer app must **not** — Play policy explicitly points delivery-tracking-for-users at foreground location.
3. **iOS**: Always authorization, `location` background mode, `pausesLocationUpdatesAutomatically: false`, `stopOnTerminate: false`. Onboarding must handle the deferred second "Change to Always Allow" prompt. Accept the visible blue indicator.
4. **Android**: `location`-typed foreground service with a designed, useful persistent notification; two-step permission flow; onboarding step for battery-optimisation exemption; standardise on stock-Android handsets if the business controls procurement.
5. **Scope tracking to an active job**, not to the working day. It is better privacy, better battery, an easier review story on both stores, and it feeds the map's unresolved driver-shift question.
6. **Plan for staleness, not for cadence.** Server-side detection of "on-shift driver, no point for N minutes" is a required feature, not observability polish.
7. **Contract for downstream (ticket 07): one position every 10–15 seconds while moving; assume gaps of 30–120 s; assume rare multi-minute outages.** Interpolate on the map and show last-updated explicitly.

---

## Open items / could not verify from primary sources

- **Transistorsoft licence price** — shop page exists, current figure not retrieved.
- **Apple's current prompt wording** for the two-stage Always flow.
- **The "employee tracking" 2.5.4 rejection pattern** and the **battery disclaimer** requirement — widely reported in Apple Developer Forums, absent from the published guidelines text. Mitigations recommended anyway.
- **Any quantitative battery figure** for continuous vs motion-gated GPS. No primary source exists; measure during pilot.
- **The ~1 Hz iOS update rate** — conventional and observed, not documented by Apple.
- **iOS 26 authorization-status regression reports** — forum-only, unconfirmed against Apple release notes.
- **`CLBackgroundActivitySession` exposure** in either RN library's public API — I found no config surface; worth a spike if the shift model makes when-in-use viable.
- **Android 15 `BOOT_COMPLETED` FGS restrictions** — `location` is not listed among blocked types, but the docs enumerate blocked types rather than allowed ones; verify `startOnBoot` on an Android 15/16 device.
