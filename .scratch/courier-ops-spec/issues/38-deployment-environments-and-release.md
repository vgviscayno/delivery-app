# Deployment, environments, and release

Type: grilling
Status: claimed
Blocked by: —
Map: ../map.md

## Question

Carried as fog since charting; ticket 20 and ticket 18 have since pinned down the artifacts, so the remaining question is environments and the path to production.

Settled inputs: MVP ships **three artifacts** — a public Play customer app (Android), an internal driver app distributed as a **managed Google Play private app** to fully-managed MDM devices (18), and a dispatcher web app. iOS is deferred but retained. Ticket 21 chose a **controlled pilot** on Play's closed-testing track, promotable to production on the same signing key. Ticket 19 found the pilot can run on **Expo dev builds unlicensed**, with the guardrail that the stock `development` profile in `eas.json` is what routes Android to `assembleDebug` — hand-editing `gradleCommand`/`buildType` silently trips the $399 Transistorsoft gate. Ticket 08 settled pnpm workspaces + Turborepo.

Open:

- **How many environments,** and what a non-production one means when one app is public, one is MDM-managed, and one is a web app. Supabase is the backend (05) — separate project per environment, or one project with schema separation? Ticket 09's RLS is fail-closed and load-bearing; whatever the answer, it must not make staging the place where RLS is accidentally relaxed.
- **Seed and test data.** Realtime location and a moving driver are hard to fake — this overlaps the still-fogged testing strategy, so draw the boundary rather than solving both.
- **The release path per artifact.** EAS build profiles for both mobile apps (including the ticket 19 guardrail encoded so nobody trips it by hand), managed-Google-Play publishing for the driver app, and web deploy for the dispatcher console. Are Supabase migrations part of the same release, and what orders a schema change against a mobile release nobody can force-update?
- **Forward compatibility.** Ticket 20's guardrail is that pilot→public and Android→iOS stay **additive, not forks**. Whatever environment layout this picks has to still hold when iOS arrives and when the customer app is promoted out of closed testing.

**Domain-modeling impact:** none expected. Likely warrants an ADR.
