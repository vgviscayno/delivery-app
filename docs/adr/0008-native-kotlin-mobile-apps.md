---
status: accepted
---

# Both mobile apps are native Kotlin Android apps

The driver app and the customer app are native Kotlin Android apps, not React Native. The dispatcher console and the backend stay TypeScript. iOS, when it comes, is a separate Swift app for the customer side only; the driver app is Android-only for good.

**The reason is the developer's preference.** It is stated as that and nothing else. No research finding pushed the stack either way. Preference was enough here because nothing had to be overturned: the native Kotlin audit (map ticket 51) found no hard blocker, and no production code existed yet. That is the same standard map ticket 50 applied in the other direction: there, familiarity could not outweigh a backend that failed two gates. Here, both stacks pass and preference picks between them.

## Considered options

**Staying on React Native** was the default, and it keeps two things native gives up: one TypeScript domain layer shared with the web, and a near-free iOS customer app later. It also carries two accepted risks that native removes. Mapbox does not stand behind its React Native binding, and token refresh depended on JavaScript wake-ups inside the location library.

**Using the community Kotlin client, `supabase-kt`,** was rejected in favour of our own client on Ktor. `supabase-kt` covers everything the map needs, but Supabase does not maintain it and one person wrote most of it. Realtime is exactly where losing that maintainer would hurt most, so keeping the library there would leave the risk at its worst point.

**Kotlin Multiplatform compiled to JavaScript,** to share one copy of the display logic, was rejected. It adds a build toolchain to share roughly five pure functions.

## Consequences

- **The mobile apps talk to Supabase only through a narrow, named surface:** RPCs, views, Broadcast channels, Storage and Auth, never tables directly. Our own client implements Auth, PostgREST calls, Storage signed URLs and the Realtime protocol (Broadcast only) behind one `:core` module. Types for that surface are hand-written, since `supabase gen types` has no Kotlin target. Keeping the surface small keeps the hand-written types few.
- **Anything a customer reads as a statement is worked out on the server.** Status labels, "Delayed", and the weight-change and time-confirmation lines come back ready to display, so two clients can never say different things. Client-side math (`interpolatePosition`, staleness tiers, `₱` formatting, haversine distance) is written in TypeScript and in Kotlin, and shared fixture files of inputs and expected outputs keep the copies identical.
- **Map ticket 20's forward-compatible guardrail is rewritten.** "Android→iOS additive, not forks" can't hold literally when iOS is a second codebase. It now means that iOS is one more client on an unchanged server contract: no server change exists only for iOS, customer-facing text comes from the server, and an iOS client is compliant when it passes the same fixtures.
- **The customer app has no over-the-air updates.** Play policy forbids them for native code. The levers are a Play release, the version gate (which blocks outdated apps using Play's immediate In-App Updates flow), and the kill-switch flags. This dropped a proposal, EAS Update, not a settled decision.
- **Transistorsoft stays, through its native SDK.** It is the same code the React Native plugin wrapped, under the same licence. It posts location fixes to the ingest function and keeps its offline queue. Our client alone refreshes the login token and hands each new one to Transistorsoft, so Transistorsoft's own refresh endpoint is never used.
- **Push goes directly to FCM** from the same Edge Function, replacing Expo's push service. The trigger is unchanged.
- **One repo.** The mobile apps are one Gradle project under `mobile/` (`:driver`, `:customer`, `:core`), beside the pnpm/Turborepo TypeScript side. The Mapbox style JSON, the fixtures and the store's coordinates sit at the repo root, where both builds read them. A schema change and the Kotlin types it breaks land in the same PR.
