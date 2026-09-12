# Transistorsoft licensing, and whether CLBackgroundActivitySession is an escape hatch

Follow-up research for [issue 03](https://github.com/vgviscayno/delivery-app/issues/3), resolving the two items its research file flagged as unverified. Cross-reference: [issue 16](https://github.com/vgviscayno/delivery-app/issues/16) (open — Always-permission onboarding flow). Researched 2026-07-29.

---

## TL;DR — the two headline facts

1. **Pricing is public and modest.** Transistorsoft sells a perpetual, cross-platform (iOS + Android) per-app-identifier license starting at **$399** (Starter, 1 app), scaling to **$599 / $749 / $999** for 5/25/100 app identifiers, each with 1 year of updates included. If the annual update subscription lapses, **the SDK does not stop working** — the installed version keeps running in production; you just can't pull new releases until you renew. This is not expensive enough to reopen ticket 03 on cost grounds alone.

2. **CLBackgroundActivitySession does NOT need "Always."** Apple's own docs state plainly it "allows a when-in-use authorized app to receive location updates or monitoring events" (iOS 17+). It genuinely sidesteps the two-stage Always prompt — but **neither Transistorsoft nor expo-location exposes it**, and it has real constraints (must be created in the foreground; shows its own always-on background indicator; app must recreate the session immediately on background relaunch). Adopting it means writing native Swift, which is a real cost against the "avoid custom native code" incentive that helped justify Transistorsoft in the first place.

Net: **ticket 03's recommendation stands** — licensing cost is not a blocker, and CLBackgroundActivitySession is not a drop-in replacement for either candidate library today. **Ticket 16 should note CLBackgroundActivitySession as a possible future de-risking path** (fewer permission-friction complaints) but should not be scoped around it now, since exploiting it requires custom native code the team doesn't currently plan to write.

---

## 1. Transistorsoft licensing

### Price

Transistorsoft's shop lists four tiers, each a **perpetual license** bundling both iOS and Android:

| Plan | App identifiers covered | Price | Updates included |
|---|---|---|---|
| Starter | 1 | $399 | 1 year |
| Venture | 5 | $599 | 1 year |
| Pro | 25 | $749 | 1 year |
| Studio | 100 | $999 | 1 year |

([Plans & Pricing](https://docs.transistorsoft.com/purchase/), [shop product page](https://shop.transistorsoft.com/products/react-native-background-geolocation-premium-license))

For a single driver app (one iOS bundle ID + one Android application ID counted as one "app"), the relevant tier is **Starter at $399 one-time**, plus optional annual renewal for continued access to new SDK releases.

### What it covers

- **Per app identifier, per platform, unlimited users/devices.** One key purchase covers both iOS and Android for a given app, but you generate a separate key per platform: the Android key binds to `applicationId`, the iOS key to `bundleIdentifier`. There is no seat/developer count and no device-install cap. ([Plans & Pricing](https://docs.transistorsoft.com/purchase/); confirmed via [FAQ](https://docs.transistorsoft.com/help/faq/))
- **One-time perpetual fee**, not a recurring subscription for the license itself — you pay once for the key. The recurring part is *optional*: renewing annually only buys continued access to new plugin releases, not continued function of what you already shipped. ([Plans & Pricing](https://docs.transistorsoft.com/purchase/))
- Support tier scales with plan: Starter/Venture get GitHub-issue support; Pro/Studio add Slack. Not relevant to the licensing decision itself. ([Plans & Pricing](https://docs.transistorsoft.com/purchase/))

### What happens if the license/update subscription lapses

Per Transistorsoft's own FAQ:

> "your key and the plugin version you have installed continue to work — but if a new release is published after your subscription lapses, you cannot install it until you renew"

([FAQ](https://docs.transistorsoft.com/help/faq/))

So: **the plugin does not stop functioning, degrade, or phone home to disable itself.** The installed version keeps operating in production indefinitely. The only consequence of not renewing is losing the ability to upgrade to newer SDK releases (bug fixes, new OS-version support) and losing priority support. This is a materially different (and better) risk profile than a SaaS-style kill switch — worth stating explicitly in the spec's budget/ops section, since it affects how urgently the business needs to keep paying versus just needing to re-budget before the next OS-compatibility bump.

License-validation-failure reports on GitHub ([issue #2091](https://github.com/transistorsoft/react-native-background-geolocation/issues/2091), [#900](https://github.com/transistorsoft/react-native-background-geolocation/issues/900), [#828](https://github.com/transistorsoft/react-native-background-geolocation/issues/828)) are overwhelmingly caused by a mismatched `applicationId`/`bundleIdentifier` between the key and the build, not license expiry — an integration-hygiene risk, not a pricing risk.

### Contrast with expo-location

`expo-location` is free — no license, no per-app fee, no renewal decision. This was already the stated tradeoff in the issue-03 research (buffering/replay/termination-survival capability vs. cost); the $399–$999 pricing now found confirms the cost side of that tradeoff is small relative to typical fleet-app engineering budgets, not a reason to reconsider.

---

## 2. Apple's CLBackgroundActivitySession

### What it is, and OS requirement

Apple's Core Location documentation, `CLBackgroundActivitySession` class reference:

> "An object that manages a visual indicator that keeps your app in use in the background, allowing it to receive updates or events."

Introduced **iOS 17.0 / iPadOS 17.0 / Mac Catalyst 17.0 / watchOS 10.0** (visionOS 1.0). ([Apple: `CLBackgroundActivitySession`](https://developer.apple.com/documentation/corelocation/clbackgroundactivitysession))

Overview section, verbatim:

> "Use `CLBackgroundActivitySession` to start a background activity session that allows a when-in-use authorized app to receive location updates or monitoring events."

This is the load-bearing sentence for ticket 16 — **it is Apple's own, explicit statement that the session works with When-In-Use authorization, not Always.**

Introduced alongside the modern `CLLocationUpdate.liveUpdates(_:)` async-sequence API at **WWDC 2023, session 10180, "Discover streamlined location updates"** ([session reference via forum discussion](https://developer.apple.com/forums/thread/731823); [`liveUpdates(_:)` docs](https://developer.apple.com/documentation/corelocation/cllocationupdate/liveupdates(_:))).

### What it guarantees, and under what conditions

From Apple's companion article "Handling location updates in the background":

> "Create an instance of [`CLBackgroundActivitySession`] to start a background activity session so that you can receive location updates. It's your responsibility to communicate that location updates will arrive before going to the background, and handle updates as they arrive."
>
> "Create a [`CLBackgroundActivitySession`] requiring the relevant form of authorization (when-in-use or always). Create the session while your app is in the foreground. **If your app terminates, you must recreate the [session] immediately upon launch in the background.**"
>
> "Core Location sets When in Use authorization implicitly when you process events from [`CLLocationUpdate.liveUpdates`], [`CLMonitor`], or use a [`CLBackgroundActivitySession`]."

([Apple: Handling location updates in the background](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background))

Key constraints this implies:
- **Must be created while the app is in the foreground.** Starting a session (or live updates) from the background with only When-In-Use authorization produces an `insufficientlyInUse` diagnostic — i.e., you cannot silently spin one up from a backgrounded state; the OS must have relaunched the app into the background first, and the app's own code must recreate the session on that relaunch. ([Apple Developer Forums, "Details on CLBackgroundActivitySession and CLServiceSession Diagnostic enum"](https://developer.apple.com/forums/thread/767865))
- It **does** manage a persistent visual indicator (like the existing blue-pill background-location indicator) — the class doc explicitly frames it as managing "a visual indicator that keeps your app in use in the background." There is no way to get background location silently; the driver always sees the indicator, exactly as with the Always-mode "location" background service already documented in the issue-03 research.
- Apple docs do not state a hard time limit on session duration; the session persists until you call `.invalidate()` or the object deallocates. There is no published numeric "N minutes of background time" guarantee in the primary docs I retrieved — behavior is "keeps receiving events for as long as the session is valid and the app can process them," which in practice depends on system resource pressure like any background execution.
- A forum thread from a developer notes `CLBackgroundActivitySession` **can relaunch the app to resume location updates even after the user force-quits it**, despite requiring only When-In-Use authorization — mirroring (via a different mechanism) the behavior Transistorsoft achieves on iOS today via its stationary-geofence trick under Always. This specific claim is sourced to a developer's reading of WWDC session 10180 reported in an **unanswered** forum thread, not confirmed by an Apple engineer in that thread — treat as plausible but not Apple-confirmed. ([Forum: "What is the difference between CLBackgroundActivitySession and the current Always Allow location authorization?"](https://developer.apple.com/forums/thread/731823))

### Does it avoid Always? — precise answer

**Yes, by Apple's own class documentation**, `CLBackgroundActivitySession` is explicitly designed to let a **When-In-Use**–authorized app receive location updates (and monitoring events) while backgrounded. It does not silently escalate to Always and does not require the two-stage Always prompt flow described in the issue-03 research. It trades the "off-shift tracking" objection and the Always-prompt friction for: (a) an always-visible background-activity indicator, and (b) the operational discipline of recreating the session in app code on every foreground entry and again immediately after any background relaunch.

### Does either library expose it?

**No, neither does, as of the versions checked (2026-07-29):**

- **`react-native-background-geolocation` (Transistorsoft) v5.4.0**: grepped the full public [`CHANGELOG.md`](https://raw.githubusercontent.com/transistorsoft/react-native-background-geolocation/master/CHANGELOG.md) for `CLBackgroundActivitySession`, `CLLocationUpdate`/`liveUpdates`, and `CLServiceSession` — zero hits. The changelog's iOS entries as recently as `4.15.0` (2024-02-27) are still describing tuning of the classic `CLLocationManager`-based stop-detection system, not the iOS 17 modern API family. No config surface for it exists in the SDK's [`Config.d.ts`](https://github.com/transistorsoft/react-native-background-geolocation/blob/master/src/declarations/interfaces/Config.d.ts) either (spot-checked against the issue-03 research, which already surveyed that file in full).
- **`expo-location`**: no reference to `CLBackgroundActivitySession` found in the Expo monorepo's `expo-location` changelog or in a targeted search of expo/expo GitHub issues. Its documented API (`startLocationUpdatesAsync`, `watchPositionAsync`) is still built on the classic `CLLocationManager` background-modes path described in the issue-03 research, not the iOS 17 session-based API.

**Using it today would require dropping to native Swift** — either a bare React Native native module, or an Expo config plugin paired with a hand-written native Swift file that creates/holds/invalidates the `CLBackgroundActivitySession` and bridges its events back to JS. This is real native-code ownership the team does not currently have budgeted, and it would run in parallel with (not replace) whatever Android background-location mechanism is chosen, since `CLBackgroundActivitySession` is iOS/iPadOS/watchOS/visionOS-only — Android's foreground-service model in the issue-03 research is unaffected either way.

---

## Implications

### Ticket 03 (resolved: chose `react-native-background-geolocation`) — does this reopen it?

**No.** Both open questions resolve in favor of the existing recommendation:

- The license is a one-time $399 (for a single driver app) with no hard cutoff on renewal lapse — cheap relative to the offline-buffering, termination-survival, and motion-state-machine capability it buys, which the issue-03 research already established as the deciding factor over `expo-location`. Nothing here changes that cost-benefit call.
- `CLBackgroundActivitySession` is real and does what the issue-03 research speculatively flagged it might do, but it is not something either candidate library ships — adopting it now would mean the team builds and maintains native Swift, which contradicts the reason `react-native-background-geolocation` was chosen (avoiding hand-rolled native background-location code). It also only solves the iOS half of the problem; Android's foreground-service/Always-analog story is untouched.

Leave ticket 03 as resolved. Optionally add a note in its "Open items" section marking the license price and the CLBackgroundActivitySession non-exposure as now confirmed (not just flagged).

### Ticket 16 (open: "Driver location permission onboarding") — does this simplify it?

**Not now, but it's worth a forward-looking note.** `CLBackgroundActivitySession` is a genuine escape hatch from the painful two-stage Always-prompt flow described in the issue-03 research — Apple's own docs confirm When-In-Use is sufficient — but exploiting it today means the team writes and maintains a custom native Swift module (Expo config plugin + native file), on top of whichever library handles Android. That is a materially larger engineering commitment than "configure Transistorsoft's `locationAuthorizationRequest: 'Always'` and write onboarding copy for the two prompts," which is the scope ticket 16 already has.

Recommendation for ticket 16:
1. Keep its current scope (Always-permission onboarding, two-stage prompt UX) as the near-term plan — it's buildable today with the chosen library.
2. Add a forward-looking note: if the product later needs to reduce permission friction (e.g., a job-scoped tracking model where the driver only grants access for the duration of an active delivery), `CLBackgroundActivitySession` is a validated, Apple-documented path to When-In-Use-only background tracking on iOS — but it is a custom native module, iOS-only, and would need a separate Android-side design (the existing foreground-service model already effectively achieves the equivalent "only track when relevant" outcome on Android via job-scoped service start/stop, per the issue-03 research's recommendation #5, "scope tracking to an active job").
3. Do not treat this as blocking or reopening ticket 16's estimate — it's a "watch this" item, not a redesign trigger.

---

## Sources consulted

- [Transistorsoft: Plans & Pricing](https://docs.transistorsoft.com/purchase/)
- [Transistorsoft shop: React Native Background Geolocation Premium License](https://shop.transistorsoft.com/products/react-native-background-geolocation-premium-license)
- [Transistorsoft: FAQ](https://docs.transistorsoft.com/help/faq/)
- [react-native-background-geolocation CHANGELOG.md](https://raw.githubusercontent.com/transistorsoft/react-native-background-geolocation/master/CHANGELOG.md)
- [react-native-background-geolocation GitHub issue #2091 (license validation)](https://github.com/transistorsoft/react-native-background-geolocation/issues/2091)
- [Apple: `CLBackgroundActivitySession` class reference](https://developer.apple.com/documentation/corelocation/clbackgroundactivitysession)
- [Apple: Handling location updates in the background](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background)
- [Apple: `CLLocationUpdate.liveUpdates(_:)`](https://developer.apple.com/documentation/corelocation/cllocationupdate/liveupdates(_:))
- [Apple Developer Forums: "What is the difference between CLBackgroundActivitySession and the current Always Allow location authorization?"](https://developer.apple.com/forums/thread/731823) (unanswered thread — cited only for the WWDC session pointer and as a plausible-but-unconfirmed claim, flagged as such above)
- [Apple Developer Forums: "Details on CLBackgroundActivitySession and CLServiceSession Diagnostic enum"](https://developer.apple.com/forums/thread/767865)
- WWDC 2023, session 10180, "Discover streamlined location updates" (referenced via the forum thread above and Apple's own doc cross-links; not independently re-verified against the video/transcript)

## Open items / could not verify from primary sources

- No numeric maximum background duration for a `CLBackgroundActivitySession` is published by Apple; behavior described only qualitatively ("keeps your app in use in the background").
- The claim that `CLBackgroundActivitySession` can relaunch a force-quit app under When-In-Use is sourced to an unanswered developer forum post's reading of the WWDC session, not to Apple's written docs or a DTS-confirmed answer. Verify with a spike/device test before relying on it for any future design.
- Did not independently watch/transcribe WWDC 2023 session 10180; relied on Apple's written API docs (authoritative for the API contract) plus a secondhand forum summary for the session's specific claims.
