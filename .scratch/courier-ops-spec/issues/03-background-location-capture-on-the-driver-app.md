# Background location capture on the driver app

Type: research
Status: resolved
Blocked by: —
Map: ../map.md
Asset: ../research/background-location.md

## Question

How does a React Native app reliably report a driver's position while backgrounded or with the screen locked, and what does that cost in permissions, battery, and store review?

This is the producer end of the entire live-tracking feature. If it is unreliable, nothing downstream can compensate — so the spec needs the real constraints, not the happy path.

Investigate:

- The current options: `expo-location` background updates with `expo-task-manager`, versus `react-native-background-geolocation` (Transistorsoft) versus other maintained libraries. Which are viable in 2026 and under which Expo workflow.
- iOS specifics: the `Always` vs `When In Use` authorization tiers, what the system prompts actually say to the driver, background modes required in the entitlement, and how aggressively iOS suspends or defers updates.
- Android specifics: foreground service requirements for continuous location, the persistent notification obligation, `ACCESS_BACKGROUND_LOCATION` and its Play Store declaration requirements, and OEM battery-optimisation killers (Xiaomi, Huawei, Samsung) that silently stop background tasks.
- App-store review: what Apple and Google demand to justify background location — this is one of the most commonly rejected permissions, and the justification affects app copy and privacy disclosures.
- Practical delivery characteristics: achievable update frequency, distance-filter vs time-interval triggering, accuracy tiers and their battery cost, and what happens when the OS kills the app.
- Whether the library buffers points locally when the network is unavailable and replays them, or whether that is the app's job.

Deliver a recommendation plus a plain statement of what "live" can actually mean on each platform — ticket 07 depends on that number. Write findings to `.scratch/courier-ops-spec/research/background-location.md`.

## Reassessed by ticket 20

The driver app is now **permanently internal** and the **MVP is Android-only**. Consequences for this ticket's conclusions: the **Play target-API-36 submission deadline (31 Aug 2026) no longer applies to the driver binary** (it's never on Play) — it still applies to the customer app. The "separate binaries" constraint below **stands unchanged** — it's driven by the *customer* app's Play background-location policy, not the driver app's distribution. The library recommendation and cadence numbers are unaffected.

## Answer

Full findings: [`research/background-location.md`](../research/background-location.md).

**Recommendation: `react-native-background-geolocation` (Transistorsoft) v5.4.0**, on an Expo development-build / prebuild workflow via its config plugin.

The field has narrowed to two live options — `@react-native-community/geolocation` (last published 2024-09) and `react-native-geolocation-service` (2022) are effectively dead. The decision against `expo-location` + `expo-task-manager` turns on three capabilities that cannot be reconstructed on top of it:

- **Offline buffering.** Transistorsoft persists every fix to native SQLite and retries upload until `maxDaysToPersist`, working headless after the app process is gone. With `expo-location` this is the app's job, written in JS inside a background task the OS tears down at will.
- **Survives force-quit.** iOS via a ~200 m stationary geofence that relaunches the app; Android via a headless native service.
- **Motion-gated stationary/moving state machine** — the primary battery mechanism.

The cost is a commercial licence for release builds.

### The cadence number (input to ticket 07)

**One position roughly every 10–15 seconds while moving. Assume gaps of 30–120 s; assume rare multi-minute outages.**

- **iOS:** ~1 Hz is the technical ceiling with Always auth, the `location` background mode, and `allowsBackgroundLocationUpdates` — but it is not desirable. Target 5–15 s or 50–100 m.
- **Android:** 5–10 s reliably on stock Android with a `location`-typed foreground service; 30–60 s and intermittent total loss on Huawei / Xiaomi / OnePlus / Samsung battery managers.

The customer map must interpolate between fixes and show an explicit staleness indicator. It must never assume a cadence.

### Consequences for other tickets

- **The two RN apps must stay separate** — this is now a policy constraint, not a preference. Play's background-location documentation names "delivery/service tracking… for users (not drivers)" as a foreground-only use case, so the customer app must not request background location. Recorded against ticket 08.
- **Scope tracking to an active job**, not the working day. Better battery, better privacy, and a far easier store-review story. Feeds tickets 07 and 10, and sharpens the shift-model fog.
- **Two silent iOS failure modes** for the spec to handle: `pausesLocationUpdatesAutomatically` defaults to `true` and Core Location never resumes itself; and iOS 13+ never grants Always in a single prompt — there is a deferred second "Change to Always Allow" prompt days later that onboarding must chase. These, plus Android's foreground-service notice, justify the new ticket 16.
- **Deadline:** Play requires target API 36 for new submissions from **31 August 2026** — five weeks out.

### Not primary-sourced (carry as uncertainty)

Transistorsoft licence price; Apple's exact prompt wording; the widely-reported 2.5.4 "sole purpose of tracking employees" rejection and the battery-disclaimer requirement (forum-only, absent from published guidelines — mitigations adopted anyway); all quantitative battery figures, which have no primary source and must be measured on pilot handsets; the ~1 Hz iOS rate (observed, not documented); iOS 26 authorization regression reports; and whether `CLBackgroundActivitySession` — a when-in-use alternative that would sidestep the Always prompt entirely — is exposed by either library.
