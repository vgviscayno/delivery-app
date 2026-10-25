---
status: accepted
supersedes: ADR-0008
---

# Both mobile apps are React Native, in the one TypeScript workspace

The driver app and the customer app are React Native (Expo dev builds), living as packages in the same pnpm/Turborepo workspace as the dispatcher console and the backend. iOS, when it comes, is the customer app built from the same codebase. This reverses ADR 0008.

**The reason is one TypeScript workspace.** Domain logic and the generated Supabase types then exist once, shared by web, backend and both apps. ADR 0008's parts that only existed because of a second language go away: the hand-written client and types, and the shared fixtures that kept two copies of client math identical. "One repo" isn't the reason, since ADR 0008 had that too. The audit for this switch (map ticket 102) found no hard blocker, and no mobile code exists yet. **The stack is locked from the first line of mobile code.** Reopening it again would mean rewriting apps, not tickets.

## Considered options

**Staying on native Kotlin** keeps ADR 0008's advantages: no reliance on a community map binding, and token refresh inside our own native client. Rejected because the dual-implementation apparatus costs more over the life of the app than those two risks, and both risks now have a named answer (below).

**Transistorsoft refreshing the token natively** through its `AuthorizationConfig`. Rejected as built: it posts form-encoded and Supabase Auth's refresh accepts JSON only. A small form-to-JSON endpoint of our own would make it work. That stays the fallback if the pre-pilot check below fails.

**Expo's push service.** Rejected in favour of direct FCM. It would hold our FCM key at a third party and report dead tokens only through receipts fetched later, which map ticket 12 declined to fetch.

## Consequences

- **Kept from ADR 0008:** the apps reach Supabase only through a narrow named surface (RPCs, views, Broadcast channels, Storage, Auth), never tables. Anything a customer reads as a statement is worked out on the server.
- **`@rnmapbox/maps` is accepted again, with an exit.** Mapbox doesn't support the binding and one maintainer does most of the work. It only draws the map, on top of Mapbox's own native SDK, so if it stalls the cost is a library swap, unlike a stalled auth or Realtime client. If it goes a full quarter without a release, move to MapLibre's React Native library. Writing against the style spec keeps that cheap.
- **`supabase-js` is the only thing that refreshes the driver's token.** Supabase refresh tokens work only once, so two refreshers can sign a driver out mid-shift. JS refreshes when Transistorsoft wakes it (heartbeat, location event, headless task) and hands each new access token to Transistorsoft, whose own refresh is never configured. Fixes queue offline whenever no JS runs. **Pre-pilot check:** with the phone locked and the app backgrounded for over an hour, location must keep arriving at ingest.
- **Over-the-air JS updates through EAS Update**, runtime version policy `fingerprint`. The customer app takes them in place of Play's In-App Updates flow. The version gate and kill-switch flags stay, and a native change (Transistorsoft, Mapbox) still needs a Play release.
- **Push goes directly to FCM HTTP v1** from the same Edge Function. The apps get the device token through `expo-notifications`. `UNREGISTERED` clears the token.
- **Map ticket 20's guardrail is restored literally:** Android→iOS additive, not forks.
- **No shared fixtures directory.** One TypeScript copy of the client math is tested once. Simulator GPS tracks live with the simulator.
- **The driver pilot build changes** (ADR 0009 amended below it): a `debug` build carrying its JS through `expo-updates`, on a `pilot` update channel.
