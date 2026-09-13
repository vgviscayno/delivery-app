# Convex re-evaluation: have the two gates that ruled it out moved?

Research for [ticket 49](https://github.com/vgviscayno/delivery-app/issues/49). Feeds the decision ticket that reopens [ticket 05](https://github.com/vgviscayno/delivery-app/issues/5) and `docs/adr/0002-supabase-backend-platform.md`.

**Researched 2026-09-13.** Everything below was read from Convex's own docs, pricing page, public changelog (`ship.convex.dev`), npm registry metadata, and the GitHub source of the first-party components, on that date. Items that could not be confirmed from a first-party source are collected in [Not primary-sourced](#not-primary-sourced) and flagged inline with ⚠️.

**This document re-runs two gates and gathers facts. It does not pick a winner** — [ticket 50](https://github.com/vgviscayno/delivery-app/issues/50) does that. It also does not re-survey the nine-option field from [ticket 04](https://github.com/vgviscayno/delivery-app/issues/4); only Convex is in scope.

---

## Headline

| Question | Verdict |
|---|---|
| **Gate 1 — geospatial beta** | **Not moved.** Still beta, unchanged wording, last feature release 2025-12-11, no GA anywhere in 266 shipped changelog items. |
| **Gate 2 — fail-open authorization** | **Not moved.** Convex's own docs still list an authorization framework as a *future* feature and still publish the anti-RLS argument verbatim. |
| Preview deployments | **Moved, in Convex's favour.** Free on every tier since 2025-12-03. Themselves labelled beta. |
| Backups | **Partially better than Supabase Free.** Manual/downloadable backups on the free tier; *automatic* backups still need the $25 tier. No PITR. |
| "Function call" pricing ambiguity | **Resolved.** A first-party definition now exists. Re-priced: **~$22/mo Starter, $25/mo flat Professional** — inside ticket 04's $17–25 band, not 2–3× off. |

The one thing that genuinely changes the weight of Gate 1 is not a Convex change at all — it is [ticket 23](https://github.com/vgviscayno/delivery-app/issues/23). See [§1.5](#15-does-ticket-23-change-the-weight-of-this-gate).

---

## 1. Gate 1 — Geospatial

### 1.1 Beta status: unchanged, and the wording is identical

The component README is titled **"Convex Geospatial Index (Beta)"** and carries the same sentence ticket 04 quoted, word for word:

> "This component is currently in beta. It's missing some functionality, but what's there should work. We've tested the example app up to about 1,000,000 points, so reach out if you're using a much larger dataset."
> — [`get-convex/geospatial` README](https://github.com/get-convex/geospatial/blob/main/README.md), also embedded on [convex.dev/components/geospatial](https://www.convex.dev/components/geospatial)

The only published stability commitment is the generic clause covering every beta feature:

> "Features tagged with **beta** in these docs are still in development. They can be used in production but their APIs might change in the future, requiring additional effort when upgrading to a new version of the Convex NPM package and other Convex client libraries."
> — [Status and Guarantees](https://docs.convex.dev/production/state)

That is the whole story. There is no separate production-readiness statement, no support commitment, and no SLA attached to the component.

### 1.2 When it last changed

From the [npm registry](https://registry.npmjs.org/@convex-dev/geospatial) and the [repo](https://github.com/get-convex/geospatial):

| Fact | Value |
|---|---|
| Latest version | **0.2.1**, published **2025-12-11** |
| Previous | 0.2.0, 2025-11-11 · 0.1.9, 2025-05-30 |
| First published | 2024-10-16 |
| Last commits (2026) | 2026-06-30 Renovate security bump · 2026-05-22 lint workflow · 2026-04-27 linter · 2026-04-14 package scripts |
| Open issues | 27 |
| Archived | No |
| Stars | 29 |

The [CHANGELOG](https://github.com/get-convex/geospatial/blob/main/CHANGELOG.md) records 0.2.1 as "Adds filter support for querying for nearest points (credit: mackinleysmith)" and 0.2.0 as build-system work (static component API, drops CJS). **No functional release in nine months; 2026 activity is dependency bumps and lint config.** The two most recent substantive changes were both contributed, one by an outside contributor.

Convex's public changelog at [ship.convex.dev](https://ship.convex.dev/) lists 266 shipped items and **does not mention geospatial once**. Nothing on the public roadmap (9 planned, 5 in progress) concerns it either.

### 1.3 Query shapes, and a contradiction inside Convex's own pages

Source-verified from [`src/component/types.ts`](https://github.com/get-convex/geospatial/blob/main/src/component/types.ts), the only shape the component defines is:

```ts
export const rectangle = v.object({ west, east, south, north });
```

The documented query surface is:

- **`geospatial.query(ctx, { shape: { type: "rectangle", rectangle }, limit, filter })`** — bounding box, results sorted ascending by a custom `sortKey`, cursor-paginated.
- **`geospatial.nearest(ctx, { point, limit, maxDistance, filter })`** — **nearest-N is supported**, optionally capped by a radius in metres, with `eq` / `in` / `gte` / `lt` filters. The legacy `queryNearest` now delegates to it and is deprecated.
- Filters are pushed down: "These filters are enforced through the indexed `pointsByFilterKey` range before documents are loaded, so the database does the heavy lifting and the query avoids reading unrelated points."

**Nearest-N is a capability ticket 04 did not record.** It is exactly the shape "drivers near this pickup" wants, and `maxDistance` gives a radius query in effect.

⚠️ **The marketing copy on [convex.dev/components/geospatial](https://www.convex.dev/components/geospatial) overstates this.** Its "Benefits" section claims "Query points within polygons, circles, and bounding boxes", and its FAQ answers "Can I query points within custom polygon shapes?" with "Yes, the Geospatial component supports querying points within custom polygon regions defined by coordinate arrays." **No polygon shape type exists in the source or the README.** Circles are defensible via `nearest` + `maxDistance`; polygons are not. Two first-party pages disagree, and the page that disagrees is the one with no code behind it. I treated the README and the source as authoritative. (Ticket 04's "rectangles, circles, custom polygons" note appears to have come from this same marketing copy.)

**Is it indexed?** Yes — it is a real index, not a scan. It builds on **S2 cell IDs** (a Go S2 library compiled to WebAssembly, [`src/component/lib/s2Bindings.ts`](https://github.com/get-convex/geospatial/blob/main/src/component/lib/s2Bindings.ts)) with its own Convex tables and stream operators (`cellRange`, `filterKeyRange`, `intersection`, `union`, `zigzag`). It is an index built *in userspace on top of Convex documents* — which is the structural difference from PostGIS, where the index is inside the database engine.

### 1.4 Write cost of keeping ~20 live driver positions indexed

⚠️ **Not documented, and this is the sharpest unanswered question on this gate.** The component publishes no figure for the database I/O cost of an `insert`/`remove` cycle per point. Structurally, moving a point means rewriting its S2 cell key and the associated index rows in the component's own tables, and those are ordinary Convex documents — so they bill as database I/O and count toward function calls like any other write. At 2.53M position updates/month that multiplier is not negligible and is not knowable from the docs.

The only anchor Convex gives is capacity, not cost: "We've tested the example app up to about 1,000,000 points." 20 continuously-moving points is trivially inside that. **Nothing suggests the component would fail at this scale. What is unknown is what it costs**, and `npx convex deployment usage` (new in convex 1.43.0, 2026-07-31) is now the way to settle it empirically.

### 1.5 Does ticket 23 change the weight of this gate?

**Yes, and this is the strongest argument in Convex's favour in this document. It is an argument about our requirement, not about Convex.**

Ticket 23 settled that the order-acceptance radius is a **road-distance** check performed by a **Mapbox Directions** call, client-side at address entry and re-checked server-side at submission. Ticket 41 then made it a hard licensing requirement that no Directions output is ever stored. So for the radius rule, the database holds no distance at all and runs no spatial query — that gate is already answered outside the database.

"Drivers near this pickup" (ticket 15's assignment ranking) is a *different* query, and ticket 23 does not answer it. But the same shape applies: if an external routing call does the authoritative check, the database only needs a coarse pre-filter. And the pre-filter is over **20 driver rows**.

At 20 rows, a Convex query that reads every active driver's latest position and sorts by haversine in JavaScript is well inside the documented envelope — [limits](https://docs.convex.dev/production/state/limits) allow 1 second of user code and 16 MiB read per transaction, and 20 small documents is a rounding error against both. **No spatial index is required at v1 scale, on Convex or anywhere else.** That reframes Gate 1 from "Convex's spatial story is beta" to "we may not need a spatial index in v1 at all", which is a materially weaker gate than ticket 04 priced.

Two honest caveats:
- This is **my inference from documented limits**, not a first-party statement that the component is unnecessary.
- It stops holding if the fleet grows by orders of magnitude, or if ticket 10's position *history* is ever scanned spatially rather than just the 20 latest positions. PostGIS would absorb both without a rewrite; the pre-filter-in-JS approach would need replacing with the beta component at exactly the moment the load justifies caring about its beta status.

### 1.6 Gate 1 verdict

**Not moved.** The component is beta today on the same terms and in the same words as when ticket 04 read it, has had no functional release in nine months, and has never appeared in Convex's changelog. What *has* changed is our understanding of the requirement: nearest-N with a radius cap exists and works, and at 20 drivers the indexed-spatial-query requirement that ticket 05 treated as decisive may not be a real requirement in v1.

---

## 2. Gate 2 — Authorization failure mode

### 2.1 Convex's position is published and unchanged

The anti-RLS argument ticket 04 quoted is still live, and still on the auth overview page:

> "Convex enables a traditional three tier application structure: a client/UI for your app, a backend that handles user requests, and a database for queries. This architecture lets you check every public request against any authorization rules you can define in code.
>
> This means Convex doesn't need an opinionated authorization framework like RLS, which is required in client oriented databases like Firebase or Supabase. This flexibility lets you build and use an authorization framework for your needs.
>
> That said, the most common way is to simply write code that checks if the user is logged in and if they are allowed to do the requested action at the beginning of each public function."
> — [Authentication overview → Authorization](https://docs.convex.dev/auth/overview)

More decisively, Convex's own **Status and Guarantees** page still files authorization under *Future Features*:

> "Convex currently has an *authentication framework* which verifies user identities. In the future we plan to add an *authorization framework* which will allow developers to define what data a user can access.
>
> For now, you can implement manual authorization checks within your queries and mutations, but stay tuned for a more comprehensive, fool-proof solution in the future."
> — [Status and Guarantees → Future Features → Authorization](https://docs.convex.dev/production/state)

Convex describes its current state as not yet "fool-proof", in its own words, on its own guarantees page. **That is the gate, stated by the vendor.** It is not on the public roadmap as planned or in progress either — the 14 roadmap items on [ship.convex.dev](https://ship.convex.dev/requests) include "Convex auth v2" (in progress) but no authorization framework.

### 2.2 What has partially moved: `convex-helpers` row-level security

`convex-helpers` ships a real row-level-security wrapper, and it gained a **deny-by-default mode** in **0.1.104, published 2025-08-15** (changelog: "Allows RLS to deny access by default"). Current shape:

```ts
export type RLSConfig = {
  /** Default policy when no rule is defined for a table.
   *  - "allow": Allow access by default (default behavior)
   *  - "deny": Deny access by default */
  defaultPolicy?: "allow" | "deny";
};

const config: RLSConfig = { defaultPolicy: "deny" };

const queryWithRLS = customQuery(query, customCtx(async (ctx) => ({
  db: wrapDatabaseReader(ctx, ctx.db, await rlsRules(ctx), config),
})));
```
— [`convex-helpers` README](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/README.md#row-level-security), [`rowLevelSecurity.ts`](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/rowLevelSecurity.ts)

"Any access to `db` inside functions wrapped with these will check your access rules on read/insert/modify per-document."

This is a genuine improvement on ticket 04's picture and should be recorded as such. It converts **one** of the two failure modes:

- **Forgotten *rule* on a table → now fails closed**, if `defaultPolicy: "deny"` is set. A new `positions` table with no rule is inaccessible rather than open.
- **Forgotten *wrapper* on a function → still fails open.** `wrapDatabaseReader` is opt-in per function. Write `query({...})` instead of `queryWithRLS({...})` and `ctx.db` is raw and unmediated. Nothing prevents that.

And the caveats are real:
- `convex-helpers` describes itself as "A collection of useful code to complement the official packages" — it is in the `get-convex` org but is not a supported product, carries no stability commitment, and sits at `0.1.x` (latest 0.1.124, 2026-09-05).
- The older `RowLevelSecurity()` entry point is marked `@deprecated` in source in favour of the wrapper form.
- The docs mention it only as an aside, pointing at a Stack blog post: "Some apps use Row Level Security (RLS) to check access to each document automatically whenever it's loaded, as described in [this article]. **Alternatively**, you can check access in each Convex function instead" ([Best Practices](https://docs.convex.dev/understanding/best-practices)). It is presented as one option among two, not as the recommended path.

### 2.3 Is there anything that makes it *impossible* to skip the check?

**No.** The complete list of what the platform enforces:

- `internal.*` functions cannot be called from outside Convex — real, platform-enforced, but only protects functions you remembered to mark internal.
- The [Convex ESLint plugin](https://docs.convex.dev/eslint) has eight rules (`require-argument-validators`, `no-filter-in-query`, `explicit-table-ids`, `no-collect-in-query`, `no-old-registered-function-syntax`, `no-top-of-hour-crons`, `no-schema-import-cycle`, `import-wrong-runtime`). **None of them requires an access-control check in a public function.** Convex's own guidance is manual: "Search for `query`, `mutation`, `action`, and `httpAction` in your Convex codebase, and ensure that all of them have some form of access control."
- "Proper middleware support" is an open, **unplanned** feature request on the public roadmap.

So the strongest available posture is: `defaultPolicy: "deny"` RLS wrapper + a house rule that no raw `query`/`mutation` is ever exported + code review + grep. **That is convention plus review.** Postgres RLS is enforced by the engine regardless of who writes the query.

### 2.4 How ticket 09's crux would actually be written

Ticket 09's crux is currently a Postgres RLS `SELECT` policy: a customer reads a driver's position only while that driver is running that customer's Delivery, revoking as `courier_status` advances past `{Assigned, Picked up}`. In Convex it is a function body:

```ts
export const driverPositionForDelivery = query({
  args: { deliveryId: v.id("deliveries") },
  handler: async (ctx, { deliveryId }) => {
    const userId = await getAuthUserId(ctx);        // omit this line and it is open
    const delivery = await ctx.db.get(deliveryId);
    if (!delivery || delivery.customerId !== userId) return null;
    if (!ACTIVE_STATUSES.includes(delivery.courierStatus)) return null;
    return await ctx.db.query("positions")
      .withIndex("by_driver", q => q.eq("driverId", delivery.driverId))
      .order("desc").first();
  },
});
```

**Where the check lives:** in the handler, before the read. Not in the data layer.

**One property worth crediting honestly:** automatic revocation works, and works well. Because the query subscribes to everything it read — including the `deliveries` row — advancing `courier_status` re-runs the query and the live subscription flips to `null` immediately. That is the same no-separate-revoke-step property ticket 09 liked about RLS, and it falls out of ticket 01's state machine identically. Convex's reactivity is a real fit for the *time-bounded* half of the crux.

What it does not give is the *relationship-derived* half enforced by the engine. The scoping to one Delivery (so a driver's other concurrent multi-stop Deliveries stay invisible) is correct in the code above — and correct only because the code is correct.

### 2.5 File storage and ticket 11's photos — worse, not better

This is the part of Gate 2 that is materially *weaker* on Convex than ticket 04 recorded, because ticket 04 did not examine it.

Convex file URLs are **permanent bearer URLs**. From [Serving Files](https://docs.convex.dev/file-storage/serve-files):

> "File IDs, like `Id<"_storage">`, are safe to store and pass through Convex functions. File URLs are different: **anyone with the URL can access the file** without further authentication from your app.
>
> In your query you can control who receives the URL, but once shared, that URL can be reused or shared. **To revoke a shared URL, delete the file.**"

There is **no signed-URL equivalent** and no expiry. Convex's documented options for ownership-gated files are:

1. **An HTTP action that authenticates every request** — "The HTTP action should authenticate the request and check that the caller can access the file before returning bytes." This is the same fail-open, your-code shape as §2.4, now also on the file path. Capped at a **20 MB** response, so fine for proof-of-delivery photos.
2. **The Cloudflare R2 component**, which the docs recommend explicitly "If you need file URLs that automatically expire after some time" — i.e. a second vendor and a second storage system to get what Supabase Storage signed URLs give natively.

Ticket 11's photos are gated on the same ownership pattern as ticket 09's crux. On Supabase that reuses the existing RLS relationship and a signed URL with a TTL. On Convex it is a hand-written HTTP action, or R2.

### 2.6 Gate 2 verdict

**Not moved.** Convex still rejects RLS by design, still says so in the docs, and still lists an authorization framework as a future feature it has not built — describing its own current state as not yet "fool-proof". The partial movement is real and should be recorded: `convex-helpers` can now deny by default *within* a wrapped function, which closes the forgotten-rule hole. The forgotten-wrapper hole is open, there is no lint rule for it, and file storage adds a second surface with the same shape and a weaker default (permanent bearer URLs).

---

## 3. Preview deployments, DX, environments

### 3.1 Preview deployments: free, real, and themselves beta

**What is provisioned per PR:** a complete, isolated Convex backend per Git branch. "This deployment has separate functions, data, crons and all other configuration from any other deployments" and "Vercel Preview Deployments run against fresh Convex backends, which do not share data with development or production Convex deployments" ([Vercel guide](https://docs.convex.dev/production/hosting/vercel)).

Mechanics ([Working with Multiple Deployments](https://docs.convex.dev/production/multiple-deployments)):
- `npx convex deploy` with `CONVEX_DEPLOY_KEY` set to a preview key. Branch name is inferred automatically on **Vercel, Netlify, Cloudflare Pages, and GitHub Actions**; `--preview-name` / `--preview-create` override it.
- `--preview-run '<functionName>'` seeds data on creation. If the seed function throws, the deploy fails but the deployment is already provisioned.
- `--preview-name` reuses an existing preview and its data; `--preview-create` deletes and recreates each time.
- **Auto-cleanup: 5 days on Free/Starter, 14 days on Professional and above.**
- Counts against the team deployment limit: **40 on Free/Starter**, 300 on Professional.

**Tier and cost:** the [pricing page](https://www.convex.dev/pricing) feature table lists **Preview deployments: Yes / Yes / Yes** across Free & Starter, Professional, and Business & Enterprise. This changed on **2025-12-03**: "Preview Deployments for Everyone — You no longer need to sign up for Convex Professional to use preview deployments: you can now use them with a free Convex account" ([Product Updates Volume 25](https://news.convex.dev/product-updates-volume-25/)). **Genuinely free at this scale**, with the caveat that a preview deployment's own function calls and database I/O meter against the same team quota as everything else.

Two things to hold alongside that:

- ⚠️ **Preview deployments are themselves a beta feature.** The docs carry the standard admonition: "Convex preview deployments are currently a beta feature." Same clause as §1.1 — usable in production, APIs may change.
- ⚠️ **Convex's own docs contradict the pricing page.** [Deploying Your App to Production](https://docs.convex.dev/production/overview) still reads "Members of a team with the **Pro plan** can get separate preview deployments to test each other's pull-requests." That is stale against both the pricing page and the December 2025 changelog. I treated the pricing page and changelog as authoritative.

### 3.2 The local development loop

Two shapes, from [Local Deployments](https://docs.convex.dev/cli/local-deployments) and [Deploying to Production](https://docs.convex.dev/production/overview):

- **Default:** each developer gets their own **cloud** dev deployment; `npx convex dev` watch-syncs code to it. Real backend, real WebSockets, meters against quota.
- **Local:** `npx convex deployment select local` runs the backend as a subprocess of `npx convex dev`, state in a `.convex/` directory. "Since the deployment is running locally, code sync is faster and means resources like function calls and database bandwidth **don't count against the quotas for your Convex plan**." Works without a Convex account at all ("anonymous development"). ⚠️ **Also a beta feature.**

**What local does not reproduce** — and the first item matters a great deal for a React Native app:

- **No public URL.** "Cloud deployments have a public URL to receive incoming HTTP requests… local deployments listen for HTTP requests on your own computer. Similarly, you can't power websites with Convex WebSocket connections unless your users' browsers know how to reach your computer. Set up a proxy like ngrok or use a cloud deployment." A physical phone running the driver app cannot reach a local deployment without a tunnel. Any inbound webhook (push, SMS) is likewise out.
- **Node actions run unsandboxed** on your machine with full filesystem access, and require a locally installed Node version matching the project's configured one (Node 20 by default). Queries, mutations, and Convex-runtime actions stay isolated.
- **Logs are cleared** every time `npx convex dev` restarts.
- **Dashboard is broken in Safari and in Brave by default** (both block localhost requests); Brave needs a flag plus a per-site permission.
- "Local deployments are not recommended for production use" — they behave as dev deployments, sending function logs and full stack traces to connected clients.

Note the dev/prod behavioural split is a real thing to design around regardless of local-vs-cloud: dev and preview deployments send server logs and full server-error details to clients; production does not, "unless the error is wrapped in `ConvexError`".

### 3.3 Schema changes, versioning, and ticket 38's expand/contract problem

**This is the strongest first-party answer in this document**, and it addresses ticket 38's scenario directly.

Convex **enforces** schema/data agreement at deploy time:

> "**Schema must always match existing data.** Convex enforces this constraint. You cannot push a schema to a deployment with existing data that doesn't match it, unless you turn off schema enforcement."
> — [Deploying Your App to Production → Making safe changes](https://docs.convex.dev/production/overview)

And the docs then spell out expand/contract as a numbered recipe, without using the name:

> 1. Add new tables to the schema.
> 2. Add an `optional` field to an existing table's schema, set the field on all documents in the table, and then make the field required.
> 3. Mark an existing field as `optional`, remove the field from all documents, and then remove the field.
> 4. Mark an existing field as a `union` of the existing type and a new type, modify the field on all documents to match the new type, and then change the type to the new type.

There is a matching rule set for the **API** side, which is exactly ticket 38's un-force-updatable-client problem:

> "**Functions should be backwards compatible.** Even if your only client is a website, and you deploy it together with your backend, your users might still be running the old version of your website when your backend changes. Therefore you should make your functions backwards compatible until you are OK to break old clients."

Safe function changes: add new functions; add an optional named argument; mark an existing argument optional; widen an argument to a union; change behaviour such that old-client arguments still produce acceptable results. Plus a third rule for scheduled functions, which "always run their currently deployed version" against arguments serialised earlier.

**Data backfills** have a first-party-org component, [`@convex-dev/migrations`](https://www.npmjs.com/package/@convex-dev/migrations) — "Define, run, and track your database migrations. Run from a CLI or Convex server function." Latest **0.3.6, 2026-07-28**; actively maintained.

**What it is not:** guidance plus platform-enforced schema validation, not versioned migration files in the core product. No down-migrations, no migration history table, no `supabase db diff` equivalent. The type checker and the schema validator catch the mistakes; the ordering discipline is still yours.

For ticket 38's purposes: Convex can reject an unsafe schema push before it lands, which Postgres will not do for you. That is a real, platform-level safety property Supabase does not have.

### 3.4 Backups

From [Backups](https://docs.convex.dev/database/backup-restore) and the pricing page:

| | Free / Starter | Professional ($25/dev/mo) | Business / Enterprise |
|---|---|---|---|
| Manual backup ("Backup Now") | **Yes**, up to **2 stored per deployment** | Yes, many (usage-priced) | Yes |
| Automatic periodic backup | **No** | **Yes** — daily or weekly | Yes |
| Retention | 7 days | Daily 7 days, weekly 14 days | + physical backups, 7 days |
| Download as ZIP | Yes | Yes | Zip yes; physical no |
| Restore | Self-serve, destructive | Self-serve, destructive | Physical restore needs Convex support |

> "Periodic backups require a Convex Pro plan."

Restore specifics:
- "Restoring is a **destructive operation that wipes your existing data** and replaces it with that from the backup. It's recommended that you generate an additional backup before doing a restore."
- Cross-deployment restore works within a team (so prod → a dev deployment is a supported way to get real data for debugging).
- "Existing files in the deployment will not be deleted when restoring" — file storage restore is additive, not a replacement.
- **A backup is not a full deployment snapshot.** It excludes deployment code and configuration (`schema.ts`, `crons.ts`, `auth.config.js`), **environment variables**, and pending scheduled functions. The docs give an emergency runbook that pairs a restore with re-pushing known-good code and re-setting env vars.
- `npx convex export --path ~/Downloads` produces the same ZIP from the CLI. Format is one `<table>/documents.jsonl` per table, plus `_storage/`.
- Backups bill as usage: "Backups use database bandwidth to read all documents, and file bandwidth to include user files."
- **No point-in-time recovery.** PITR is an open *Requested* item on the public roadmap ("Point in Time Recovery (PITR, Backups by Second)", 75 chips) — not planned, not in progress. Neither is "Backup APIs" (115 chips).

Separately, Convex's platform-level durability claim (their own DR, not user-accessible restore): "All user data in Convex is encrypted at rest. Database state is replicated durably across multiple physical availability zones. Regular periodic and incremental database backups are performed and stored with 99.999999999% (11 9's) durability." Availability target 99.99%, with an SLA only on Business/Enterprise.

**Stated against ticket 38 honestly:** Supabase Free provides no backups, which is why ticket 38 reached for Pro. Convex Free/Starter provides **manual, downloadable backups you must remember to take**, capped at two. That is strictly better than nothing and is enough for a "take a snapshot before the risky migration" workflow. It is not automatic. Getting *automatic* backups costs the same $25/month tier jump as Supabase Pro — and on Convex that $25 is **per developer**, where Supabase Pro is per project. The pressure ticket 38 identified does not disappear; it changes shape.

---

## 4. Re-checks

### 4.1 The "function call" pricing ambiguity is resolved

**A first-party definition now exists.** On the [Limits](https://docs.convex.dev/production/state/limits) page, in the Notes column of the Function calls row:

> "**Explicit client calls, scheduled executions, subscription updates, and file accesses count as function calls.**"

That closes ticket 04's largest open item. Note what it says: **subscription updates are metered**. Ticket 04's meter taxonomy filed Convex under "per compute-duration / fan-out is free"; that is **wrong**, and this is a correction worth carrying forward. Convex does not bill per *message*, but it bills per *subscription update*, which for this workload is very nearly the same thing.

Current rates ([pricing](https://www.convex.dev/pricing), [limits](https://docs.convex.dev/production/state/limits)), US regions — EU is 1.3×:

| Meter | Free | Starter | Professional |
|---|---|---|---|
| Base | $0, hard caps | $0 + pay-as-you-go | **$25 per developer/month** |
| Function calls | 1M/mo total | 1M included, **$2.20/additional 1M** | 25M included, $2/additional 1M |
| Database I/O | 1 GB/mo total | 1 GB included, $0.22/GB | 50 GB included, $0.20/GB |
| Database storage | 0.5 GB total | 0.5 GB included, $0.22/GB-mo | 50 GB included, $0.20/GB-mo |
| Query/mutation compute | Free | Free | Free (billed only on dedicated) |
| Action compute | 20 GB-h | 20 GB-h included, $0.33/GB-h | 250 GB-h included, $0.30/GB-h |
| Data egress | 1 GB | 1 GB included, $0.132/GB | 50 GB included, $0.12/GB |
| Deployment class | S16 | S16 | S256 |
| Concurrent sessions | 1,000 | 1,000 | 10,000 |

Note Free and Starter are now distinct tiers: "Free has hard resource caps, while Starter can exceed its included resource amounts with usage-based pricing."

**Re-priced against ticket 04's anchor** (20 drivers × 1 position/5 s × 8 h × 22 days = 2.53M inbound writes; ~3 recipients each → ~7.6M outbound deliveries; 75 peak connections):

| Component | Calls |
|---|---|
| Position mutations (explicit client calls) | 2.53M |
| Subscription updates pushed to clients | ~7.6M |
| **Total function calls** | **~10.1M/month** |

- **Starter:** (10.1M − 1M) × $2.20/M = **$20.02**, plus database I/O ~10 GB (ticket 04's fleet-query amplification estimate) → (10 − 1) × $0.22 = **$1.98**. Connections are not a meter; 75 concurrent sessions is inside S16's 1,000. **≈ $22/month.**
- **Professional:** 10.1M < 25M included and ~10 GB < 50 GB included → **$25/month flat** for one developer. **$50** for two, since the base is per-developer.

**Ticket 04's ~$17–25 estimate survives.** The community-forum rule it rested on was close; the first-party definition lands the number at the top of that band rather than 2–3× outside it. Cost remains a non-discriminator, exactly as ticket 05 concluded.

⚠️ Two things this does *not* settle. First, whether one update fanned out to N subscribers is N function calls or 1 — the definition says "subscription updates" without disambiguating. Under the other reading (per re-execution) the total is ~7.6M and Starter drops to ~$17. **Both readings land inside $17–25, so the decision is not sensitive to it.** Second, the geospatial component's own writes are excluded (§1.4).

### 4.2 Realtime fan-out against ticket 06's shape

- **Push-based.** One WebSocket per client. "Convex tracks the dependencies to your query functions, including database changes, and triggers the subscription in the client libraries" ([Realtime](https://docs.convex.dev/realtime)). "Whenever any dependency changes, including any database rows, Convex reruns the query function and triggers an update to any active subscription on the client" ([FAQ](https://www.convex.dev/faq)).
- **No channel concept.** A subscription is a (query function, arguments) pair. Ticket 06's "customers subscribed per-Delivery" maps to `useQuery(api.positions.forDelivery, { deliveryId })`; "dispatcher on one global channel" maps to a single fleet query subscribed by both dispatcher consoles.
- **Cache sharing.** "Convex automatically caches the result of your query functions… If many clients request the same query, with the same arguments, they will receive a cached response", and "You don't get charged for database bandwidth for cached reads." The two dispatcher consoles genuinely share one re-execution. Per-Delivery customer queries have distinct arguments and share nothing.
- **Consistency.** "Every client subscription gets updated simultaneously to the same snapshot of the database."
- ⚠️ **No server-side rate floor exists.** Convex pushes on every invalidating write. Ticket 06's ~5 s floor must be imposed by the driver client's emission cadence (ticket 07) or by writing positions into a coarser aggregate on a schedule. There is no throttle knob.
- **The fleet-query amplification trap from ticket 04 stands.** A dispatcher query reading all 20 driver documents is invalidated by every one of the 2.53M position writes and re-reads all 20 each time. Sharding or paginating the fleet query is the documented mitigation shape; the query shape, not the write rate, sets the bill.
- ⚠️ **Still no documented mutations-per-second figure** — only concurrency (S16: 16 concurrent mutations, 4 MiB mutation write throughput, 1,000 concurrent sessions). Unchanged from ticket 04.

### 4.3 React Native, connection resilience, offline

- **Docs remain minimal.** [`/client/react-native`](https://docs.convex.dev/client/react-native) is nine lines pointing at the React client plus an Expo quickstart and a demo repo. There is no React Native page in the docs index beyond those two.
- **One thing ticket 04 could not find is now on the page:** "The `ConvexReactClient` connects to your Convex deployment by creating a WebSocket… **If the internet connection drops, the client will handle reconnecting and re-establishing the Convex session automatically**" ([React client → Under the hood](https://docs.convex.dev/client/react/overview)). Reconnection is first-party and automatic.
- ⚠️ **Still undocumented:** behaviour when a React Native app is backgrounded on iOS/Android (whether the socket survives, and what happens on resume), and auth-token refresh over a socket held for an 8-hour duty day (tickets 07/34). Ticket 04 flagged both; both are still gaps. They should be prototyped, not assumed. Note this is the mirror image of Supabase's documented risk — Supabase *tells* you the channel drops when the JWT expires; Convex tells you nothing either way.
- **Auth providers:** Convex Auth is **still beta** ("Convex Auth is currently a beta feature") and supports React Native. Clerk, WorkOS AuthKit, and Auth0 remain the production recommendations. "Convex auth v2" is In Progress on the public roadmap.
- **Ticket 03's offline SQLite buffering is unaffected by this choice.** It is client-side, sits in front of whatever backend, and is the backstop for a failed flush regardless.

---

## Not primary-sourced

Twelve items. The first three could move a decision.

1. ⚠️ **The ~7.6M subscription-update figure.** Convex's definition says "subscription updates … count as function calls" but does not say whether one update fanned out to N subscribers counts N times or once. I priced the per-subscriber reading (10.1M calls, ~$22 Starter); the other reading gives ~7.6M and ~$17. Both sit inside ticket 04's band, so the decision is not sensitive — but the number is not settled. **Settleable empirically** via `npx convex deployment usage` (convex 1.43.0, 2026-07-31) against a short load test.
2. ⚠️ **The geospatial component's write cost per position.** No first-party figure for database I/O per insert/remove of a moving point, and the component's index lives in ordinary Convex documents, so it bills. At 2.53M position updates/month this is an unpriced multiplier on both function calls and database I/O.
3. ⚠️ **Whether the query cache is shared across users for an identity-dependent query.** Ticket 09's crux query depends on `getAuthUserId(ctx)`. The docs only say caching keys on "the same arguments". An indirect signal suggests auth claims do participate in the cache key — Clerk's `fva` claim is dropped "because it's time-varying and would bust the query cache" ([Auth in Functions](https://docs.convex.dev/auth/functions-auth)) — which would mean 50 customers get 50 cache entries and share no database bandwidth. **Inference, not a statement.** It affects §4.1's database-I/O line, not the headline.
4. ⚠️ **Marketing-vs-source contradiction on query shapes.** convex.dev/components/geospatial claims polygon and circle queries; the README on the same page and `src/component/types.ts` define only `rectangle` (plus `nearest` by point + `maxDistance`). Resolved in favour of the source.
5. ⚠️ **Docs-vs-pricing contradiction on preview deployments.** `production/overview` still says Pro-only; the pricing page and the 2025-12-03 changelog say all tiers. Resolved in favour of pricing + changelog.
6. ⚠️ **React Native backgrounding and long-socket token refresh.** No first-party documentation. Unchanged from ticket 04.
7. ⚠️ **No documented mutations-per-second limit.** Only concurrency and byte throughput. Unchanged from ticket 04.
8. ⚠️ **Whether the geospatial component is maintained or merely alive.** The repo is not archived and dependency bots run, but there has been no functional release in nine months and 2026 commits are chores. Convex has published no statement of intent either way. This is the same hazard shape as ticket 04's PartyKit finding, at a much lower severity — the component is first-party, in use, and much smaller in blast radius.
9. ⚠️ **`convex-helpers` support status.** Self-described as "a collection of useful code to complement the official packages", `0.1.x`, no stability commitment, in the `get-convex` org. Whether Convex would treat a security bug in `rowLevelSecurity.ts` as its own is not stated anywhere.
10. ⚠️ **news.convex.dev appears to have stopped.** "Product Updates" ends at Volume 25 (2025-12-03); ship.convex.dev is the live changelog and runs to 2026-08-21. No deprecation notice on the older blog. I used ship.convex.dev as the current source of truth.
11. ⚠️ **Roadmap chip counts and item statuses** on ship.convex.dev are a public-voting product surface, not a commitment. "Requested" there means only that nobody at Convex has scheduled it.
12. ⚠️ **SOC 2 Type II / HIPAA / GDPR badges** on the pricing footer were not verified against an actual report; reports are listed as a Professional-tier entitlement.

Also: prices were read on 2026-09-13 and Convex renders parts of the pricing page client-side. EU-region pricing is 1.3× US. Re-verify before committing to any number.

---

## Summary of what changed since ticket 04

| Finding in ticket 04 | Status on 2026-09-13 |
|---|---|
| Geospatial component "explicitly beta" | **Unchanged.** Same wording, no functional release since 2025-12-11, never mentioned in the changelog. |
| Convex rejects RLS; in-function checks fail open | **Unchanged.** Argument still published; authorization framework still listed as a future feature Convex calls not yet "fool-proof". |
| No first-party definition of a "function call" | **Superseded.** Definition now on the Limits page. Re-price lands at ~$22 Starter / $25 flat Pro — inside the old band. |
| "Convex has no per-message meter; fan-out is free" | **Wrong, correct this.** Subscription updates are function calls. Fan-out is metered. |
| Geospatial supports "rectangles, circles, custom polygons" | **Partly wrong.** Source defines `rectangle` only — plus a real `nearest` (nearest-N + radius + filters) that ticket 04 missed. |
| No first-party docs on WebSocket reconnection | **Improved.** React client docs now state reconnection is automatic. Backgrounding and token refresh still undocumented. |
| Convex Auth is beta | **Unchanged.** Still beta; v2 in progress. |
| (not covered) Preview deployments | Free on all tiers since 2025-12-03; isolated backend per branch; 5-day cleanup on Free/Starter. Beta feature. |
| (not covered) Backups | Manual on Free/Starter (2 max, 7 days); automatic needs Pro at $25/**developer**/mo. No PITR. |
| (not covered) Expand/contract | Platform-enforced schema validation plus an explicit documented recipe, including the old-client case. Strongest first-party answer here. |
| (not covered) File storage auth | Weaker than Supabase. Permanent bearer URLs, no signing, no expiry; ownership gating means a hand-written HTTP action or the R2 component. |
