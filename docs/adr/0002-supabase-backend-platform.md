---
status: accepted
---

# Supabase as the backend platform

The backend runtime — auth, data storage, realtime location fan-out, and proof-of-delivery photo storage — is **Supabase** (Postgres + PostGIS + Realtime + Auth + Storage), not a custom TypeScript server or another managed BaaS (Firebase, Convex, Ably/Pusher + a separate database).

Nine options were priced against a shared workload anchor (~2.5M inbound position writes/month) in ticket 04; cost turned out to span only $1–56/mo across all of them, too flat to decide anything. Three properties did the deciding instead:

- **Geospatial.** "Drivers near this pickup" is a real v1 requirement for the dispatcher console. Only Supabase (PostGIS) and a custom Postgres server have a current, indexed spatial story — Firestore's geohash library is stale (unmaintained since 2022), Convex's geospatial support is beta, and none of the dedicated realtime transports (Ably, Pusher, Cloudflare Durable Objects) have any. Choosing a transport-only option would have forced a second database decision.
- **Fail-closed authorization.** A customer may read a driver's live position only while that driver is running that customer's job — a time-bounded, relationship-derived permission over sensitive data (ticket 09's crux). Supabase RLS expresses this declaratively and fails closed: a missing policy denies access. A custom server (including one built on managed Postgres hosts like Neon) puts the same check in application code, which fails open if a check is ever forgotten. Given the data involved, this was treated as decisive, not stylistic.
- **Who owns the realtime plumbing.** A custom server means this team writes and maintains reconnection, backfill, presence, and auth-token refresh indefinitely. Supabase is managed — that operational burden isn't ours. (Ably is the one option that gives reconnect message-continuity for free, but it fails the geospatial requirement outright.)

Team familiarity leaned toward Firebase, not Supabase, but Firebase was ruled out by the geospatial gap regardless — familiarity didn't have a technical requirement to outweigh.

## Rejected alternatives

- **Firebase (Firestore/RTDB).** Fails the geospatial requirement (stale `geofire-common`, no native index).
- **Convex.** In-function authorization checks fail open, same shape as a custom server; geospatial support is beta.
- **Ably / Pusher / Cloudflare Durable Objects.** No geospatial story at all — would force pairing with a separate database, and none solve the fail-open problem on their own (the database side would still need its own auth model).
- **Custom TypeScript server (self-hosted or on managed Postgres like Neon).** Fails open on authorization by default; the team would own the WebSocket/reconnection layer indefinitely. Rejected primarily on operational-appetite and less-code-to-own grounds — every hour spent on server ops is an hour not spent on the product itself.

## Consequences

- Supabase does not do push notifications natively; FCM/APNs (or Expo's push service) is composed on top regardless of platform, so this isn't a new gap introduced by the choice.
- Supabase's own docs recommend **Broadcast**, not Postgres Changes, for the realtime layer — Postgres Changes authorizes per-subscriber and doesn't scale with subscriber count. Left to ticket 06 (realtime transport) to apply.
- An 8-hour driver shift outlives a short-lived JWT; the Realtime channel needs token refresh wired in while backgrounded, or the connection drops mid-shift. Left to ticket 09 (auth) to design.
- Lock-in is accepted deliberately, not designed around: Supabase is Postgres underneath, so a future exit (e.g. to Neon + a custom server) stays possible via standard `pg_dump`/restore if a concrete reason to leave ever arises. No migration plan is written now.

## Reopened and upheld — 2026-09-23

Reopened in ticket 50 on new evidence: the dev had since used Convex hands-on, which moved the familiarity axis this ADR admits can decide things. Research ticket 49 found that neither gate had moved. Convex geospatial is still beta, and its authorization framework is still listed as a future feature. `convex-helpers` deny-by-default RLS closes the forgotten-rule hole but not the forgotten-wrapper one. Convex file URLs also can't be signed or expired, so ticket 11's photos would need a second vendor. The dev decided that familiarity alone doesn't justify the switching cost. **This ADR stands unchanged.**
