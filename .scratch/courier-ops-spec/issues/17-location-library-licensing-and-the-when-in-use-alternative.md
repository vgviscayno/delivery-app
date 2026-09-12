# Location library licensing and the when-in-use alternative

Type: research
Status: resolved
Blocked by: —
Map: ../map.md

## Question

What does `react-native-background-geolocation` actually cost to licence, and does `CLBackgroundActivitySession` make the Always permission avoidable?

Two facts ticket 03 recommended a library without being able to verify. Both could change that recommendation, so they should be nailed before the spec commits.

- **Licensing.** Transistorsoft's library requires a commercial licence for release builds. Establish the current price, what a licence covers (per app, per platform, per seat, perpetual vs annual), and what happens to an app whose licence lapses. This is a real line item and it sits opposite `expo-location`, which is free — so the cost needs a number before the trade-off is honest.
- **`CLBackgroundActivitySession`.** Apple's newer API allows continued location updates under **When In Use** authorization rather than Always. If it is usable here it would sidestep the entire two-stage Always prompt problem, materially simplify ticket 16, and soften the store-review posture. Establish: what it actually guarantees, its OS version floor, whether it survives backgrounding and for how long, and — critically — whether either candidate library exposes it, or whether using it would mean dropping to native code.

Prefer primary sources: Apple's Core Location documentation and WWDC material, Transistorsoft's own pricing page and licence terms, and the library source itself for what is exposed.

If the answers materially undercut ticket 03's recommendation, say so plainly — reopening that decision is cheaper now than after the spec is written.

Write findings to `.scratch/courier-ops-spec/research/licensing-and-when-in-use.md`.

## Answer

Full findings: [`research/licensing-and-when-in-use.md`](../research/licensing-and-when-in-use.md).

**Licensing:** Transistorsoft sells a perpetual, cross-platform (iOS+Android) per-app-identifier license — **$399 one-time** for a single app (Starter tier), scaling to $599/$749/$999 for more app identifiers, no per-seat or per-device cost. If the optional annual update subscription lapses, the installed SDK **keeps working in production** — you only lose access to new releases/support, not function. Cheap relative to the offline-buffering/termination-survival capability it buys; does not change the cost-benefit call ticket 03 made against `expo-location`.

**`CLBackgroundActivitySession`:** Apple's own docs confirm it genuinely works under **When-In-Use** authorization (iOS 17+), avoiding the two-stage Always-permission flow entirely. But it must be created while foregrounded, shows its own persistent background indicator, and — critically — **neither `react-native-background-geolocation` nor `expo-location` exposes it**. Using it would mean writing and owning a custom native Swift module, iOS-only, with Android's story unaffected.

**Net:** ticket 03's recommendation stands — not reopened. Ticket 16 keeps its current scope (Always-permission onboarding for the chosen library) but gets a forward-looking note that `CLBackgroundActivitySession` is a validated future de-risking path, contingent on the team taking on native-module ownership it doesn't currently plan for.
