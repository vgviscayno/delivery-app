# Backend platform decision

Type: grilling
Status: resolved
Blocked by: — (04 resolved)
Map: ../map.md

## Question

Which backend platform does this system build on — a managed BaaS, or a custom TypeScript server?

This is the keystone of the map: the realtime transport, auth model, location storage, and push pipeline all inherit from it. Decide it deliberately rather than by drift.

Weigh, using the findings from ticket 04:

- Operational appetite: is running a persistent-connection server acceptable, or should infrastructure be someone else's problem.
- The write-heavy location workload against each platform's pricing and performance shape.
- Lock-in tolerance: how hard would it be to leave the chosen platform in a year, and does that matter at this stage.
- Whether one platform can serve all of auth, data, realtime, file storage (proof-of-delivery photos), and push — or whether the design is a composition of specialist services.
- The team's existing familiarity, which is often the deciding factor and should be admitted rather than rationalised.

**Ticket 04 is resolved and reframes this decision.** Cost is not the discriminator anyone expected — the whole nine-option field spans roughly $1–56/mo at this volume, which is noise against a single day of engineering time. What actually sorts the options:

- **Geospatial**: only Supabase and a custom Postgres server have a current, indexed spatial story. Everything else forces a separate database decision.
- **Fail-closed authorisation**: Supabase RLS, Firebase Rules, and Ably capability tokens can express ticket 09's crux declaratively and fail closed. Convex and a custom server put that check in application code, where forgetting it leaks live human location.
- **Who writes the resilience**: only Ably gives reconnect message-continuity off the shelf. Everywhere else, reconnection, backfill, presence, and token refresh are code this team writes and maintains.

Given cost is near-flat, treat this as a decision about **geospatial support, authorisation failure mode, and how much realtime plumbing you want to own** — not a price comparison.

**Two facts to settle before committing**, both flagged as unverified by ticket 04: Convex's cost estimate rests on a community-forum definition of a "function call" and could be off 2–3×, and Cloudflare's undocumented hibernation threshold is a 4× swing needing a load test. Only chase these if the decision actually narrows to those options. Note also that **PartyKit appears dormant** with no deprecation notice — treat it as unavailable.

Record the outcome as an ADR under `docs/adr/` via `/domain-modeling` — this is exactly the kind of decision a future reader will need the reasoning for.

## Answer

**Supabase** (Postgres + PostGIS + Realtime + Auth + Storage). Full reasoning: [`docs/adr/0002-supabase-backend-platform.md`](../../../docs/adr/0002-supabase-backend-platform.md).

Geospatial ("drivers near this pickup") was confirmed as a real v1 requirement, which immediately narrows the field to Supabase or a custom Postgres server. Fail-closed authorization over live location data was then treated as decisive, ruling out the custom-server shape (including a Neon-backed variant) since app-code checks fail open where RLS fails closed. Operational appetite favored avoiding a self-run persistent-connection server. Team familiarity leans Firebase, but that didn't have a technical requirement to outweigh — Firebase fails the geospatial gate regardless. Lock-in accepted for now without a documented exit plan, since Supabase is Postgres underneath.

Handed off, not resolved here: ticket 06 should use Supabase Broadcast (not Postgres Changes) for the realtime layer; ticket 09 needs to wire JWT refresh into the Realtime channel for 8-hour driver shifts.
