# Backend platform options for realtime location

Research for [ticket 04](https://github.com/vgviscayno/delivery-app/issues/4). Feeds the decision in [ticket 05](https://github.com/vgviscayno/delivery-app/issues/5), and secondarily tickets 06 (transport and fan-out), 09 (auth) and 10 (location storage).

**Researched 2026-07-27.** All pricing was read from official pricing pages on that date. Pricing changes frequently and several vendors render prices client-side — re-verify before committing to any number. Items that could not be confirmed from a first-party source are collected in [Unverified and uncertain](#unverified-and-uncertain) and flagged inline with ⚠️.

**This document gathers options. It does not choose one.** Ticket 05 makes the call.

---

## 1. The workload, quantified

Every option below is priced against the same anchor, so the numbers are comparable. These are assumptions, not settled facts — cadence is ticket 07's decision and will move these figures.

| Quantity | Value | Derivation |
|---|---|---|
| Active drivers | 20 | assumed small-fleet v1 |
| Emission cadence | 1 position / 5 s | assumption; ticket 07 owns this |
| Shift length | 8 h/day, 22 days/month | |
| **Inbound position writes** | **~2.53 M/month** | 115,200/day |
| Recipients per position | ~3 | 1–2 tracking customers + 2 dispatcher consoles |
| **Outbound deliveries** | **~7.6 M/month** | |
| Combined message volume | ~10.1 M/month | |
| Peak concurrent connections | ~75 | 20 drivers + 2 dispatchers + up to 50 customers |
| Connection duration | **hours**, unbroken | drivers and dispatchers |
| Payload size | ~100–300 bytes | lat/lng/heading/accuracy/timestamp |

Three properties of this workload drive everything that follows:

1. **Fan-out dominates volume.** 75% of all messages are outbound deliveries, not ingest. Any platform that bills per delivered message bills mostly for fan-out.
2. **Connections are long-lived.** This is the shape that per-connection-minute and per-function-duration meters punish, and the shape that serverless function timeouts break.
3. **Payloads are tiny.** Below every platform's billing chunk threshold (Ably 5 KiB, API Gateway 32 KB, Pusher 10 KB). No message inflates into multiple billable units. This is the single most favourable fact about the workload, and it makes byte-metered platforms look very cheap.

### The meter taxonomy

The most useful way to sort the option space is not "BaaS vs custom server" — it is **what each platform charges for**, because the workload maximises exactly the things realtime services meter.

| Billing shape | Platforms | Consequence for this workload |
|---|---|---|
| **Per delivered message** | Ably, Supabase Realtime, Firestore (as a document read) | Cost scales linearly with recipients-per-position. Fan-out *is* the bill. |
| **Per day-capped message tier** | Pusher | Flat fee, but you buy headroom in 2× jumps. |
| **Per byte downloaded** | Firebase RTDB | Tiny payloads → near-free. Best match for this shape of any managed option. |
| **Per compute-duration** | Cloudflare Durable Objects, Convex, always-on VM | Fan-out is free; you pay for the process being awake. |
| **Per connection-minute** | Ably (minor), AWS API Gateway | Punishes hours-long connections, but the rates are low enough to be a rounding error at 75 connections. |
| **Nothing per-connection** | Supabase (≤500 peak), Firestore, RTDB, Convex, Durable Objects | A continuously-connected client is free at the connection level on most managed options. |

**A continuously connected client costs surprisingly little almost everywhere.** The ticket's hypothesis — that realtime pricing bills connections and this workload maximises connections — turns out to be only half right at this scale. 75 connections is inside the free allowance of nearly every platform. It is the **message count**, not the connection count, that separates a $2/month option from a $56/month one.

---

## 2. Managed / BaaS options

### 2.1 Supabase — Postgres + Realtime + PostGIS

**Frequent small writes.** Postgres absorbs 4 writes/sec trivially. The constraint is the Realtime layer, and *which* Realtime mechanism you pick is the whole story:

- **Postgres Changes** reads the WAL and **authorises every event against every subscriber**: "When you make a single change to a table with 100 subscribed users, Realtime performs 100 authorization checks — one per user… throughput scales with the number of subscribers, not the write rate." Changes are processed on a single thread to preserve order, so "larger compute add-ons don't meaningfully increase Postgres Changes throughput" ([docs](https://supabase.com/docs/guides/realtime/postgres-changes)).
- **Broadcast** is what Supabase's own docs recommend: "the recommended method for scalability and security"; Postgres Changes "does not scale as well as Broadcast"; "We recommend using Broadcast for most use cases" ([docs](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)).
- **Broadcast from Database** bridges the two — a trigger calls `realtime.broadcast_changes()`, inserting into `realtime.messages`, which Realtime reads via a WAL publication. Note `realtime.messages` is day-partitioned and **rows older than 3 days are deleted** ([docs](https://supabase.com/docs/guides/realtime/broadcast)).

Benchmarks: Broadcast has been run at 250,000 concurrent users and >800,000 msgs/sec (median 58 ms). Postgres Changes on a Micro instance with RLS and 500 clients: **5 DB changes/sec** ([benchmarks](https://supabase.com/docs/guides/realtime/benchmarks)). ⚠️ The postgres-changes page quotes 30/sec for the same configuration — two official pages disagree. Our 4 changes/sec fits either figure at 75 clients, but the margin on Pro's default Micro compute is thin.

Pro quotas: 500 concurrent connections (10,000 with spend cap off), 500 messages/sec, 100 channels/connection ([quotas](https://supabase.com/docs/guides/realtime/quotas)).

**Fan-out cost.** Billed per delivery, explicitly: "Each broadcast message counts as one message sent plus one message per subscribed client that receives it" ([usage docs](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)). Three recipients = 4 billable messages per position.

**Geospatial.** Full **PostGIS** — the only option in this document with a real spatial index. GiST index on a `geography` column, `<->` nearest-neighbour operator, `&&` + `ST_MakeBox2D` for map-viewport queries ([docs](https://supabase.com/docs/guides/database/extensions/postgis)). "Drivers near this pickup" is one query. This also makes it the natural home for ticket 10's position history.

**Pricing** ([official](https://supabase.com/pricing)). Pro $25/mo includes 500 peak Realtime connections (then $10/1,000) and 5 M Realtime messages (then $2.50/1 M). Peak connections are billed as the highest concurrent count in the cycle ([docs](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-peak-connections)) — **75 connections is free**.

> **Estimate ≈ $38/month.** $25 Pro + Broadcast path 10.1 M messages → 5.1 M over → $12.75. Connections $0, egress ~2 GB $0. Free tier is not viable (10.1 M messages vs 2 M included).

**React Native.** First-party `@supabase/supabase-js` with an official Expo tutorial ([docs](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)); `AsyncStorage`, `autoRefreshToken`, `startAutoRefresh`/`stopAutoRefresh` for lifecycle.

⚠️ **Sharpest RN risk in this document:** "If a new JWT is never received on the Channel, the client will be disconnected when the JWT expires," and "Make sure to keep the JWT expiration window short." Policies are cached for the connection's duration and re-evaluated only on connect or on a new `access_token` message ([authorization docs](https://supabase.com/docs/guides/realtime/authorization)). An 8-hour driver shift therefore *requires* wiring token refresh into the channel, including while backgrounded. This connects directly to ticket 09's token-refresh question.

**TypeScript.** `supabase gen types typescript` produces per-table `Row`/`Insert`/`Update` types consumed via `createClient<Database>()`. Documented gaps: view columns can come out nullable when they aren't, and JSON columns need manual `MergeDeep` overrides ([docs](https://supabase.com/docs/guides/api/rest/generating-types)). Codegen-from-introspection, so it can drift; Realtime *payload* typing is not covered.

**Auth.** RLS plus a Custom Access Token Auth Hook injecting a role claim, with `authorize()` helpers reading `auth.jwt() ->> 'user_role'` ([RBAC docs](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)). The same RLS policies gate Realtime when channels are `private: true`. **One authorization model covering database and realtime together is a genuine structural advantage** for ticket 09's crux — "a customer may read this driver's position only while that driver is running that customer's job" is expressible as a single policy joining jobs to positions, and it fails closed.

---

### 2.2 Firebase — Cloud Firestore

**Frequent small writes.** ⚠️ **The widely-cited "1 sustained write/sec per document" limit is no longer in Firebase's docs.** Current wording: "The exact maximum rate that an app can update a single document depends highly on the workload" ([best practices](https://firebase.google.com/docs/firestore/best-practices)). Do not cite the retired figure. The one hard documented rate: **indexing a sequentially increasing field (like a timestamp) caps the collection at 500 writes/sec** — directly relevant if you index `updatedAt` on positions. Recommended ramp is 500 ops/sec, +50% every 5 minutes. At 0.2 writes/sec per driver document this workload is comfortably inside the envelope.

**Fan-out cost.** Billed per delivered document read: "When you listen to the results of a query, you are charged for a read each time a document in the result set is added or updated," with a minimum of one read per query even when empty ([pricing](https://firebase.google.com/docs/firestore/pricing)). Connections are not metered.

⚠️ **Reconnect trap, directly relevant to mobile:** "If offline persistence is enabled and the listener is disconnected for more than 30 minutes… you will be charged for documents and index entries read as if you had issued a brand-new query." Combine that with the RN SDK not supporting persistence (below) and a driver in a signal dead-zone becomes a billing event.

**Geospatial.** No native geoqueries. Official guidance is geohashing with `geofire-common`, with documented limitations: "querying by Geohash is not exact, and you have to filter out false-positive results on the client side," accuracy degrades near the poles, and a radius search needs up to 9 range query pairs ([docs](https://firebase.google.com/docs/firestore/solutions/geoqueries)). ⚠️ `geofire-common` is at **6.0.0, published 2022-07-13** — four years stale. The [`firebase/geofire-js`](https://github.com/firebase/geofire-js) repo is not archived but targets RTDB and points Firestore users to the doc above. Additionally, a geohash field rewritten every 5 s per driver is an indexed write on every position.

**Pricing.** Spark free daily: 50,000 reads, 20,000 writes. Blaze (nam5 multi-region, from the [official billing example](https://firebase.google.com/docs/firestore/billing-example)): reads $0.06/100 K, writes $0.18/100 K, storage $0.18/GB-mo, egress $0.12/GB beyond 10 GB.

> **Estimate ≈ $8–10/month.** Writes 2.09 M billable → ~$3.77; listener reads 6.50 M billable → ~$3.90; storage/egress negligible. Connections free.

⚠️ Single-region (`us-central1`) is cheaper, but cloud.google.com's regional price table renders client-side and could not be fetched. Only the nam5 figures are verified.

**React Native.** The Firebase JS SDK lists RN as supported with a notable exclusion: Firestore **"except persistence"** ([environments](https://firebase.google.com/docs/web/environments-js-sdk)). No offline persistence in RN via the JS SDK — which interacts badly with the 30-minute re-billing rule and with ticket 03's poor-signal requirements. [React Native Firebase](https://rnfirebase.io/) (native SDK wrappers) is the alternative; ⚠️ it describes itself as "the officially recommended collection of packages," but that endorsement appears only on Invertase's own site and is not corroborated on any firebase.google.com page — it is a third-party-maintained library.

**TypeScript.** Weakest of the managed options. Firestore is schemaless; there is no schema-derived codegen. `withConverter`/`FirestoreDataConverter` gives hand-written types plus a runtime converter — the guarantee is only as strong as the converter you wrote. Security Rules are a separate untyped language.

**Auth.** Firebase Auth custom claims read in Security Rules (`auth.token.role === 'dispatcher'`). Constraints: payload ≤1000 bytes; "The new custom claims will propagate to the user's ID token the next time a new one is issued" — so **role and permission changes are not immediate** ([docs](https://firebase.google.com/docs/auth/admin/custom-claims)). Docs warn claims are "not designed to store additional data." Three actor types are straightforward; the time-bounded customer↔driver permission from ticket 09 would have to live in Security Rules reading the job document, not in a claim.

---

### 2.3 Firebase — Realtime Database

Treated separately because it behaves and prices nothing like Firestore.

**Frequent small writes.** Documented limits ([usage limits](https://firebase.google.com/docs/database/usage/limits)): **200,000 simultaneous connections** (Spark: **100**), **1,000 writes/sec**, 64 MB written/minute, ~100,000 simultaneous responses/sec. At 4 writes/sec this is a natural fit — RTDB is the classic presence-and-location store. ⚠️ The Spark 100-connection cap against a 75-connection peak leaves no growth room; you would run Blaze from day one.

**Fan-out cost.** Billed by **bytes downloaded**, not per message and not per connection: "Firebase bills for the data you store… and all outbound network traffic at the session layer." Overhead counts — "realtime protocol overhead, WebSocket overhead, and HTTP header overhead," plus ~3.5 KB per TLS handshake and tens of bytes per record header ([billing docs](https://firebase.google.com/docs/database/usage/billing)). Connections are a capacity limit, not a meter.

**This is the meter that best matches the workload's shape**: tiny payloads mean the byte count stays small no matter how many messages there are.

**Pricing** ([official](https://firebase.google.com/pricing)). Blaze: $5/GB stored, **$1/GB downloaded**. Spark: 1 GB stored, 10 GB downloaded/month, 100 connections.

> **Estimate ≈ $1–3/month.** 7.6 M deliveries × ~150–250 B (payload + protocol + TLS overhead) ≈ 1.1–1.9 GB → $1–2, plus trivial storage. **Cheapest managed option by an order of magnitude.**

**Geospatial.** No native geoquery. [GeoFire](https://github.com/firebase/geofire-js) is the RTDB-targeted library and — unlike the Firestore geohash recipe — offers *live* geoqueries via `key_entered`/`key_exited`, which maps unusually well onto "drivers near this pickup." ⚠️ But the ecosystem is stale (see the 2022 publish date above) and no current maintenance statement exists.

**RN / TypeScript / Auth.** Same SDK situation as Firestore. TypeScript story is the weakest of any option here — an untyped JSON tree with no schema. Rules language is more limited than Firestore's. The denormalised tree model means the dispatcher fleet view and each customer's tracking view will likely be **separate duplicated subtrees you fan out to on write** — which is real modelling work, and it moves complexity from read time to write time.

---

### 2.4 Convex

**Frequent small writes.** Limits ([docs](https://docs.convex.dev/production/state/limits)): 1 s user-code execution per query/mutation; 16 MiB read and written per transaction; S16 default class allows 16 concurrent queries/mutations and **1,000 concurrent sessions**. At 4 mutations/sec and 75 sessions, S16 is fine. ⚠️ No documented mutations-per-second figure exists — only concurrency and byte throughput.

**Fan-out model — structurally different, and worth understanding.** Convex has no per-message meter. Fan-out appears as query re-executions plus database bandwidth, and **N clients subscribed to the same query with the same arguments share one re-execution**: "Convex automatically caches the result of your query functions… If many clients request the same query, with the same arguments, they will receive a cached response" ([docs](https://docs.convex.dev/functions/query-functions)). That is genuinely different from Supabase's and Firestore's per-recipient accounting.

⚠️ **The design trap:** a dispatcher whole-fleet map query depends on all 20 driver documents, so **every one of the 2.53 M position writes invalidates and re-runs it**, re-reading all 20 docs. Database I/O amplifies ~20×. Sharding or paginating the fleet query drops this by an order of magnitude — but it means the query shape, not the write rate, sets your bill.

**Geospatial.** First-party [`@convex-dev/geospatial`](https://www.convex.dev/components/geospatial) component — rectangles, circles, custom polygons; tested to ~1 M points. ⚠️ Explicitly **beta**: "This component is currently in beta. It's missing some functionality, but what's there should work." Better than Firebase's stale-geohash situation, materially weaker than PostGIS.

**Pricing** ([official](https://www.convex.dev/pricing)). Starter: 1 M function calls then $2.20/1 M; 1 GB DB bandwidth then $0.22/GB. Professional $25/dev/mo: 25 M calls, 50 GB bandwidth. Query/mutation compute is free. **WebSocket connections are not a billing meter.**

> **Estimate ≈ $17/month (Starter) or $25/month flat (Professional).** Assuming ~3 function calls per position (1 mutation + ~2 invalidated queries) → ~7.6 M calls, plus ~10 GB DB I/O from the fleet-query amplification. On Professional, both sit inside the included allowances.

⚠️ **This estimate is the least reliable in the document.** Convex publishes **no first-party definition of what counts as a "function call"** — not on the pricing page, the pricing FAQ, the limits page, or the usage-tracking API (whose per-execution fields are all byte/time meters, with no `function_calls` field). The "one mutation plus one re-run per subscription" rule came from Convex's community Q&A mirror, not from docs. The figure could be off by 2–3×.

**React Native.** Officially supported — same `convex` package and `ConvexReactClient` as React web, with an Expo quickstart ([docs](https://docs.convex.dev/client/react-native)). ⚠️ **Neither RN page documents WebSocket reconnection behaviour, backgrounding behaviour, or auth-token refresh on a long-lived socket.** For an 8-hour driver shift that is a real gap; it should be prototyped, not assumed.

**TypeScript.** Strongest of the managed options. `defineSchema` + `v` validators generate `Doc`/`Id` types; argument types are inferred from validators and flow through the generated `api` object into `useQuery`/`useMutation`, so client call sites are checked against server function signatures, and functions are typechecked before deployment ([docs](https://docs.convex.dev/understanding/best-practices/typescript)). A genuine compile-time link from schema to client, not codegen you must remember to re-run.

**Auth.** ⚠️ Convex Auth is first-party but **beta** ("may change in backward-incompatible ways"); Clerk, WorkOS AuthKit and Auth0 are the production recommendations ([docs](https://docs.convex.dev/auth)). **There is no RLS** — Convex explicitly rejects the model: "you simply write code that checks if the user is logged in and if they are allowed to do the requested action at the beginning of each public function."

For ticket 09 this is the key trade-off on this platform: three actor types are easy to express, but enforcement is **discipline-based and fails open**. A forgotten check in one public function exposes live location data. Supabase RLS and Firebase Security Rules fail closed by default. For a system whose security crux is a time-bounded permission over sensitive location data, that difference deserves weight.

---

## 3. Dedicated realtime transports (paired with a separate database)

All four have **no geospatial capability whatsoever**. That must come from the paired database — PostGIS on Neon/Supabase/RDS, or Redis geo commands. Pairing also means two systems to auth, two to monitor, and a decision about whether positions flow through the database or around it (ticket 06's "ingest and fan-out: shared path or decoupled through storage").

### 3.1 Ably

**Message counting.** Both directions: "1 inbound message when a client publishes" plus "1 outbound message for each subscriber that receives it," billed in **5 KiB chunks** ([counting docs](https://ably.com/docs/platform/pricing/message-counting.md)). Our payloads are one chunk. Note the default **echo** behaviour doubles outbound counts unless disabled.

**Limits** ([docs](https://ably.com/docs/pricing/limits)): 50 msg/s per channel and per connection; 200 channels/connection; 2,500 msg/s account-wide on Standard. Even funnelling all 20 drivers through one channel is 4 msg/s against a 50 msg/s cap — **nothing here is close to a limit**.

**Fan-out cost.** Each delivery billed separately: one publish to 3 subscribers = 4 billable messages. **75% of the Ably bill is fan-out, not ingest**, and it scales linearly with recipients.

**Pricing** ([official](https://ably.com/pricing)). Free: 6 M messages, 200 connections. Standard **$29/mo + usage**: messages $2.50/M, connection-minutes $1.00/M, channel-minutes $1.00/M, transfer $0.25/GiB. Minutes round up ([billing](https://ably.com/docs/pricing/billing)); a channel deactivates ~1 minute after its last client detaches.

> **Estimate ≈ $56/month.** $29 base + 10.1 M messages $25.35 + ~0.76 M connection-minutes $0.76 + ~0.21 M channel-minutes $0.21 + transfer ~$0.50. Free tier not viable (10.1 M vs 6 M). ⚠️ Assumes the $29 base includes no message allowance — the pricing page does not say. If allowances exist, this drops.

The connection-minute meter — the one the ticket predicted would hurt — comes to **under $1**. Messages are the whole bill.

**React Native.** Officially supported via the main `ably` package with React hooks (`AblyProvider`, `useChannel`, `usePresence`) ([RN guide](https://ably.com/docs/getting-started/react-native)); actively maintained (v2.26.0, 2026-07-23).

**Reconnection is Ably's genuine differentiator.** Connection state is retained ~2 minutes after a drop; **resume** transparently replays missed messages to existing listeners with no developer code; **recover** restores state across a process restart via a recovery key if the client re-subscribes within 15 seconds ([connection states](https://ably.com/docs/connect/states)). After the window, the connection goes `suspended` and continuity is lost. ⚠️ Ordering after reconnection is *not* guaranteed to match the undropped order — for a GPS trace, timestamp positions and sort client-side rather than trusting arrival order (relevant to ticket 07). Docs recommend explicitly `close()`ing on background and `connect()`ing on foreground.

This directly answers ticket 06's "on reconnect, does a client get the latest position only or a backfill" — Ably is the only option here that answers it for you.

**TypeScript.** First-class typings, but **`Message.data` is an untyped payload**. The transport does not carry domain types; you define and validate the position schema yourself. Types are a client-side convention, not enforced on the wire.

**Auth — the strongest declarative model of any option here.** Capability tokens map resources to operations with wildcards at colon-delimited segment boundaries, and token capabilities are the **intersection** of requested and issuing-key capabilities, so clients cannot escalate ([capabilities](https://ably.com/docs/auth/capabilities)). Issuable as a JWT signed with the API key secret carrying an `x-ably-capability` claim — no Ably SDK needed server-side. Maps onto the three actors almost declaratively:

- Driver: `{"job:driver-123:*": ["publish","presence"]}`
- Customer: `{"job:{theirJobId}:position": ["subscribe"]}`
- Dispatcher: `{"job:*": ["subscribe","presence","publish"]}`

The time-bounded customer permission from ticket 09 becomes a short-lived token scoped to one job — a clean fit.

### 3.2 Pusher Channels

**Counting.** Same both-directions model, stated plainly: a message is "the sum of the API requests you make to our service plus the number we have to deliver to connected clients" ([quotas](https://pusher.com/legal/quotas/)). The `info` parameter makes a publish count twice. Max payload 10 KB.

⚠️ **Presence channels cap at 100 members** ([docs](https://pusher.com/docs/channels/using_channels/presence-channels/)). At ~75 connections you would be at 75% of a hard limit on day one if you use a single global presence channel. Partition presence per-job or per-role.

**Pricing** ([official](https://pusher.com/channels/pricing/)) — meters are max concurrent connections and messages/day:

| Plan | Price | Msgs/day | Max conns |
|---|---|---|---|
| Sandbox | free | 200 K | 100 |
| Startup | $49 | 1 M | 500 |
| Pro | $99 | 4 M | 2,000 |
| Business | $299 | 10 M | 5,000 |

> **Estimate: $49/month (Startup).** 460,800 msgs/day fits 1 M/day with ~2.2× headroom. Sandbox is not viable (2.3× over the cap). Lowest sticker price of the transports and the simplest to reason about — but the next step up is a 2× jump, and doubling cadence or recipients pushes you toward it.

**React Native.** Official `@pusher/pusher-websocket-react-native` (v1.3.5, 2026-03-17) — a native-bridge wrapper, so it needs native build config and **does not work in Expo Go**. Maintenance cadence is visibly slower than `pusher-js`.

⚠️ **No documented message-continuity or backfill guarantee.** `pusher-js` auto-reconnects with backoff, but messages published during a disconnect are simply missed. For a GPS stream that is largely tolerable — the next position arrives in 5 s and supersedes the lost one — but any *discrete* event (job assigned, delivery completed) sent over the same transport must be made recoverable by your own read-on-reconnect. That is a ticket 06 design constraint, not just a caveat.

**TypeScript.** Weakest of the transports: events bound by string name, data arrives untyped (the RN SDK surfaces it as a string requiring manual parse).

**Auth.** Signed-endpoint model ([docs](https://pusher.com/docs/channels/server_api/authorizing-users/)): the client POSTs `socket_id` + `channel_name` to your server, which applies arbitrary logic and returns a signed token. Three actor types are handled by branching in that endpoint — more flexible than Ably's capabilities but imperative, per-subscription, and easier to get subtly wrong. No JWT support documented. ⚠️ No first-party per-channel publish rate limits are published (unlike Ably's explicit 50 msg/s).

### 3.3 PartyKit

A developer-experience wrapper over Cloudflare Durable Objects: each "party" is one DO holding WebSocket connections, and you write a plain TypeScript server class with `onConnect`/`onMessage`/`onClose`. No billing meters of its own — cost is Cloudflare's (§3.4), so **fan-out is free** and roughly $20/month. `partysocket` is a reconnecting-WebSocket client usable from React Native. Because the server is TypeScript you write, a **single shared type definition can span server and all three clients** — a real differentiator over Ably/Pusher. Auth and reconnect-with-backfill are entirely yours.

> ⚠️ **Status: effectively dormant. Do not start new work on it.** Cloudflare [acquired PartyKit on 2024-04-05](https://blog.cloudflare.com/cloudflare-acquires-partykit/). [docs.partykit.io](https://docs.partykit.io/) carries **no deprecation banner** and still reads as current. npm tells a different story: `partykit` is at 0.0.115, last published **2025-09-11**; the successor `partyserver` shipped 2026-06-14 and `agents` on 2026-07-23. Cloudflare's Agents SDK documents the layering as `DurableObject → Server` (from `partyserver`) `→ Agent` ([docs](https://developers.cloudflare.com/agents/concepts/agent-class/)).
>
> ⚠️ **This conclusion is inferred from release cadence and the Agents SDK architecture — Cloudflare has published no formal deprecation notice or migration guide.** Treat PartyKit as a *pattern*; if the ergonomics appeal, use `partyserver` on your own Cloudflare account.

### 3.4 Cloudflare Durable Objects

**Billing model is structurally different and strongly favours this workload** ([DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)):

> "For compute requests billing-only, a 20:1 ratio is applied to incoming WebSocket messages… For example, 100 WebSocket incoming messages would be charged as 5 requests."
>
> "There is no charge for outgoing WebSocket messages, nor for incoming WebSocket protocol pings."

**The 7.6 M outbound deliveries that dominate the Ably bill and consume Pusher's daily cap cost zero here.** Inbound is additionally discounted 20:1, so 10.1 M messages reduce to ~127 K billable requests. Limits ([docs](https://developers.cloudflare.com/durable-objects/platform/limits/)): 1,000 requests/sec soft limit per Object, 30 s CPU per message, unlimited Objects. At 4 msg/s across 20 Objects nothing is close.

**Pricing.** Workers Paid has a $5/month minimum ([docs](https://developers.cloudflare.com/workers/platform/pricing/)); DO includes 1 M requests + 400,000 GB-s/month, then $0.15/M requests and $12.50/M GB-s. Duration is "billed in wall-clock time as long as the Object is active and not eligible for hibernation… regardless of actual usage" (128 MB allocation). **WebSocket Hibernation** ([best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)) keeps clients "connected to the Cloudflare network" while the Object is evicted, and "Billable Duration (GB-s) charges do not accrue during hibernation." Per-connection state survives via `serializeAttachment()`/`deserializeAttachment()`, but in-memory state resets and the constructor re-runs on wake — **your code must tolerate that**, which is the engineering price of the cheap tier.

> **Estimate ≈ $20/month worst case, possibly ~$5.** $5 base + requests inside the included 1 M + duration 20 DOs × 8 h × 22 d × 0.125 GB ≈ 1.58 M GB-s, less 400 K included → ~$14.80.
>
> ⚠️ **The worst case assumes hibernation never engages**, because a message every 5 seconds may keep each Object continuously resident. **Cloudflare does not document the idle threshold for hibernation eligibility**, so this cannot be resolved from primary sources — it is the largest single swing in any estimate here ($5 vs $20). Worth a load test before committing.
>
> Note duration is per-Object wall-clock regardless of connection count, so one DO **per job** (20 concurrent) is far cheaper than one per connection; consolidating all drivers into a single DO would approach the $5 floor at the cost of isolation. That is a ticket 06 topology decision with a direct price tag.

**Geospatial: none.** DO SQLite has no PostGIS or spatial extension. A DO can hold current positions in memory for fast last-known-location reads, but radius and bounding-box queries need a real database.

**React Native.** No vendor SDK — the standard `WebSocket` API, which RN implements natively, or `partysocket` for backoff. Nothing to break on RN upgrades, no native modules. Backgrounding, token refresh, and resume are all hand-rolled.

**TypeScript: strongest of the transports.** The server is a plain TypeScript class you author, so a shared `types` package can define a discriminated union of wire messages imported by the DO, the dispatcher console, and both RN apps, with Zod validation at the boundary. Compare with Ably/Pusher, where `data` is inherently opaque.

**Auth.** Entirely yours. Standard pattern: a Worker fronts the DO and validates a JWT on the upgrade request, rejecting before the DO is instantiated — Cloudflare explicitly recommends validating in the Worker to avoid billing invalid upgrade attempts. Token refresh on an hours-long connection needs an in-band re-auth message, since upgrade headers cannot be updated.

---

## 4. Custom TypeScript server

### 4.1 Runtime and transport

**Bun vs Node.** `Bun.serve()` has first-party WebSocket support with a single handler object shared across connections, plus a **built-in topic pub/sub layer** — `ws.subscribe(topic)`, `ws.publish(topic, msg)` (excludes sender), and `server.publish(topic, msg)` callable from outside a socket handler, i.e. from the HTTP route that ingests positions ([docs](https://bun.com/docs/api/websockets)). That is precisely the fan-out primitive this workload needs, with no dependency. Bun claims ~700 K msg/sec vs ~100 K for Node + `ws`, built on uWebSockets internally.

Bun's own [Node compatibility page](https://bun.com/docs/runtime/nodejs-apis) flags `node:cluster` as "implemented but not battle-tested" (no FD passing between workers; HTTP load balancing Linux-only via `SO_REUSEPORT`) and `node:worker_threads` as missing several fields. **None of those bite a single-process 75-connection server.** Node's alternatives are `ws` (baseline), Socket.IO (reconnection, rooms, Redis adapter free), and [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) — which is the same C++ engine Bun uses internally.

**At 4 inbound and ~12 outbound msg/sec, raw throughput is irrelevant.** Choose on ecosystem maturity, not benchmarks.

**WebSockets vs SSE.** The workload is asymmetric, which argues for a split: driver→server is a plain HTTP `POST` every 5 s (no persistent connection needed at all — 4 req/sec), and server→customer/dispatcher is pure unidirectional fan-out, which is exactly SSE's shape. SSE gets automatic reconnection with a `Last-Event-ID` request header for server-side resume, and server-controlled backoff via the `retry:` field ([WHATWG spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)) — though it does *not* reconnect on a fatal failure.

Two things complicate the SSE case:

- **The HTTP/1.1 connection limit.** MDN: "When not used over HTTP/2, SSE suffers from a limitation to the maximum number of open connections… the limit is *per browser* and is set to a very low number (6)… When using HTTP/2, the maximum number of simultaneous HTTP streams is negotiated (defaults to 100)" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)). A dispatcher with 3 console tabs burns 3 of 6. Every host below terminates TLS with HTTP/2, so this is mostly a local-dev footgun.
- ⚠️ **React Native has no `EventSource`.** RN's official [Networking doc](https://reactnative.dev/docs/network) lists Fetch, XMLHttpRequest and WebSocket — SSE is not mentioned anywhere. The standard workaround is the third-party `react-native-sse` shim over XHR; ⚠️ npmjs.com returned HTTP 403, so its exact capabilities (custom headers, POST bodies, `Last-Event-ID` handling, maintenance status) are **unverified**.

**Net:** SSE is architecturally the better fit for the fan-out direction, but needs a third-party shim on two of the three clients. WebSocket is native in browsers and RN with zero polyfill.

**Horizontal scaling.** A single process holds connections in its own memory; two processes means a driver's position lands on A while the customer watching lands on B and the message is silently lost. Fixing that needs a backplane — Redis pub/sub (Socket.IO has an official adapter, ~$10–15/mo managed), Postgres `LISTEN`/`NOTIFY` (free if you already run Postgres, but 8000-byte payload cap and not durable), or NATS.

**At 75 connections you do not need this.** uWebSockets.js documents "100k secure websockets with raspberry pi 4"; even with Node/`ws` being far heavier per socket, 75 connections and ~16 msg/sec total is three orders of magnitude below saturation on one small instance. ⚠️ That is an inference from vendor claims, not a measured figure — but the margin is large enough that the conclusion is safe. **The real reason to want a second instance is availability during deploys, not capacity** (§4.4).

### 4.2 Hosting — which hosts actually hold a connection for 8 hours

This is the crux the ticket flags, and **the answer has moved.** The trap is no longer "serverless can't do WebSockets" — Vercel added support and AWS has API Gateway WebSockets. The trap is that **both cap connection lifetime far below a driver's shift.**

| Host | Persistent connections | Small-instance price | Key caveat |
|---|---|---|---|
| **Hetzner Cloud** | ✅ | CX22 2 vCPU/4 GB **€3.79/mo** ⚠️ stale | You own OS, TLS, deploys, monitoring |
| **Fly.io** | ✅ | shared-cpu-1x 512 MB **$3.32/mo**; 1 GB $5.92 | ⚠️ Idle-timeout policy undocumented — send pings |
| **Railway** | ✅ | **$5/mo** Hobby incl. $5 usage; RAM $10/GB/mo, CPU $20/vCPU/mo | ⚠️ WS behaviour not documented first-party |
| **Render** | ✅ best documented | Starter 512 MB/0.5 CPU ⚠️ price unverified | Random LB assignment; **every deploy severs every socket**; 30 s SIGTERM (→300 s) |
| **DO App Platform** | ✅ | **$5.00/mo** (512 MiB/1 vCPU), 50 GiB transfer | Free tier is static-only; ⚠️ WS policy unverified |
| **AWS Fargate/ECS** | ✅ | ~**$9/mo** (0.25 vCPU/0.5 GB) + ALB | ⚠️ ALB (~$16/mo, unverified) dominates cost; don't use Spot |
| **Vercel Functions** | ⚠️ **the trap** | Functions pricing: provisioned memory time for the whole connection + transfer | **Connection dies at max duration: 300 s Hobby / 800 s Pro / 1800 s beta** |
| **AWS API GW WebSocket** | ⚠️ caveat | $1.00/M msgs (32 KB units) + $0.25/M conn-min ≈ **~$13/mo** | **2 h max connection (hard), 10 min idle timeout (hard)** |
| **AWS Lambda direct** | ❌ | — | Hard 900 s timeout, stateless by design |
| **Netlify Functions** | ❌ | — | 60 s sync / 15 min background, none configurable; no WS in docs at all |
| **Cloudflare Workers** | ⚠️ DO required | — | Plain Workers cannot coordinate across connections |

**Vercel, in detail** — because this is the most likely trap to walk into. Vercel Functions *can* now serve WebSockets (`ws`, Socket.IO, Express, Hono, and a Next.js `experimental_upgradeWebSocket()` hatch), requiring Fluid compute ([docs](https://vercel.com/docs/functions/websockets)). But from that same page: **"WebSocket connections close when a Vercel Function reaches its maximum duration."** Max duration is 300 s on Hobby (hard maximum), 300 s default / 800 s maximum on Pro, 1800 s in beta ([limitations](https://vercel.com/docs/functions/limitations)). For an 8-hour shift that is a **forced disconnect every ~13 minutes at best — ~36 reconnects per driver per day** — and every 5 minutes on Hobby. Vercel's docs acknowledge this and hand you a reconnect-with-backoff snippet as the expected pattern. They also warn connections aren't guaranteed to reach the same instance and suggest Redis for presence and pub/sub. Billing charges provisioned memory time **for the entire duration the connection is open**, plus transfer on every byte.

**AWS API Gateway WebSocket, in detail.** Lambda's 900 s timeout is non-increasable and it is "designed for short-lived compute tasks" ([docs](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)), so API Gateway holds the socket instead. Its quotas ([official table](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html)): **connection duration 2 hours, not increasable; idle timeout 10 minutes, not increasable**; 32 KB frames; 128 KB payloads. So an 8-hour shift is **at least 4 forced reconnects**, and a parked driver or an idle dispatcher map needs heartbeats to survive the idle timeout. Pricing: $1.00/M messages (sent *and* received, in 32 KB increments) + $0.25/M connection-minutes; ping/pong frames are **not** metered ([pricing](https://aws.amazon.com/api-gateway/pricing/)) → ~$13/month here, **plus** Lambda invocations **plus** a DynamoDB/Redis connection registry, because API Gateway does not track who is subscribed to what and you must reap stale connection IDs on `GoneException`.

**Netlify** ([config docs](https://docs.netlify.com/build/functions/configuration/)): 60 s synchronous, 15 min background, all marked non-configurable, and WebSockets are not mentioned anywhere in the functions docs. The 60 s cap also rules out SSE.

**Cloudflare Workers** ([docs](https://developers.cloudflare.com/workers/runtime-apis/websockets/)): a Worker can accept a WebSocket, but the same page draws the line at exactly this use case — "If your application needs to coordinate among multiple WebSocket connections… you will need clients to send messages to a single-point-of-coordination. Durable Objects provide" that. Fanning one driver's position to 3 recipients *is* coordination, so plain Workers are insufficient (see §3.4).

**Idle timeouts — the universal rule.** Three hosts have documented connection-killers (API Gateway, Vercel, Render-on-deploy). Fly.io, Railway and DO App Platform have **undocumented** idle behaviour, and intermediate proxies, CDNs and corporate NATs impose their own regardless. **Implement application-level ping/pong (~30 s) and client reconnect-with-jittered-backoff unconditionally, on every host.** This is not optional anywhere, and it is an input to ticket 06.

### 4.3 Geospatial and write handling

**PostGIS on managed Postgres** is the natural answer, and the historically uncertain case is now settled: ✅ **Neon supports PostGIS** — "an open-source extension for Postgres that can be installed on any Neon Project," via `CREATE EXTENSION IF NOT EXISTS postgis;`, with pgRouting and Tiger Geocoder documented separately ([docs](https://neon.com/docs/extensions/postgis)). ⚠️ The shipped PostGIS version is not stated. Supabase likewise ([docs](https://supabase.com/docs/guides/database/extensions/postgis)). ⚠️ RDS and Timescale PostGIS availability was not verified first-party in this pass.

**Postgres native `earthdistance`** is a lighter alternative: `ll_to_earth()`, `earth_distance()`, `earth_box()` for indexed bounding-box search, plus a `point <@> point` operator returning **statute miles**. Requires the `cube` module (`CREATE EXTENSION … CASCADE`) and assumes a perfectly spherical Earth — the PostgreSQL docs themselves say "If that's too inaccurate for you, you might want to look at the PostGIS project" ([docs](https://www.postgresql.org/docs/current/earthdistance.html)).

**Redis geospatial** is the strongest fit for *live* positions specifically: `GEOADD` into a sorted set, `GEOSEARCH` (since Redis 6.2.0, replacing deprecated `GEORADIUS`) with `BYRADIUS`/`BYBOX`, `ASC` for nearest-first, `WITHDIST`, and `COUNT n ANY` for early return. Complexity O(N+log(M)) ([docs](https://redis.io/docs/latest/commands/geosearch/)).

With only 20 drivers, "drivers near pickup" is a 20-row scan and *any* approach works. The clean architecture is **Redis `GEOADD` on the hot path (in-memory, no WAL) with PostGIS for historical and analytical queries** — but PostGIS alone on a small `current_positions` table with a GiST index is entirely sufficient at this scale.

**Frequent small writes into Postgres.** 2.53 M writes/month is ~1/sec average, 4/sec peak — genuinely small. But the *pattern* matters: a naive `UPDATE current_position … WHERE driver_id = ?` every 5 s writes a new row version, dirties the index, generates WAL and creates autovacuum work — a 20-row table rewritten 240×/minute. Mitigations, in order of value (all relevant to ticket 10):

1. **Split `current_position` (20 rows, hot) from `position_history` (append-only, 2.5 M rows/month).** Different access patterns, tuning and retention. Highest-value structural decision.
2. **Batch history inserts** — buffer 1–5 s, multi-row `INSERT`. ~10× less transaction and WAL overhead at negligible latency cost.
3. **Unlogged tables for `current_position`.** Postgres docs: "not written to the write-ahead log… considerably faster… However, they are not crash-safe: an unlogged table is automatically truncated after a crash or unclean shutdown… also not replicated to standby servers," and not supported for partitioned tables ([docs](https://www.postgresql.org/docs/current/sql-createtable.html)). Losing "where is each driver right now" on a crash is fine — the next ping repopulates it in 5 s. Losing it on a replica is less fine if you read from replicas. This is the same argument that says keep the hot path in Redis entirely.
4. **RANGE-partition `position_history` by timestamp.** Beyond index locality, the retention benefit is explicit: "Dropping an individual partition using `DROP TABLE`, or doing `ALTER TABLE DETACH PARTITION`, is far faster than a bulk operation. These commands also entirely avoid the `VACUUM` overhead caused by a bulk `DELETE`" ([docs](https://www.postgresql.org/docs/current/ddl-partitioning.html)). GDPR-driven retention (ticket 10) becomes instant instead of a multi-million-row delete and vacuum storm. TimescaleDB automates the same pattern; ⚠️ its specifics were not verified first-party.

### 4.4 TypeScript, auth, and the honest operational cost

**TypeScript — this option's strongest card**, structurally: you own both ends of the wire, in one language, in one repo. No generated client, no codegen step, no drift between a hosted service's model and your types.

- **tRPC subscriptions** support **both** WebSockets and SSE (`httpSubscriptionLink`), and the docs now recommend SSE by default: "If you are unsure which one to use, we recommend using SSE for subscriptions as it's easier to setup and doesn't require setting up a WebSocket server." Both transports support resumability via the `tracked()` helper — SSE via `lastEventId`, and `wsLink` sends and updates the last known ID automatically. Documented gotcha: when replaying from `lastEventId`, establish listeners *before* querying the database or you miss events emitted during the initial yield ([docs](https://trpc.io/docs/server/subscriptions)). ⚠️ Note the tension with §4.1: tRPC recommends SSE, but RN has no native `EventSource` — so `wsLink` may be the pragmatic choice for the mobile apps even if the console uses SSE.
- **Zod** shared client/server: one schema validates the inbound GPS payload on the server *and* types it on the client, so a driver-app/server contract mismatch is a compile error.
- **Drizzle or Prisma** for DB→TS types, and a shared `packages/types` in the monorepo (ticket 08).

**No managed realtime alternative gives a compile-time-checked contract on the message payloads.** That is this option's concrete, defensible advantage — and it is the one that speaks directly to the map's fixed TypeScript-everywhere constraint.

**Auth.** DIY JWT, or [Better Auth](https://www.better-auth.com/docs/introduction) — "a universal authentication and authorization framework for TypeScript," self-hosted, framework-agnostic, with email/password, social, 2FA, passkeys, SSO, multi-session and a JWT plugin — or Auth.js, or hosted Clerk/Auth0/Supabase Auth standalone. Over a WebSocket handshake there are three patterns:

1. **Token in query string** — works everywhere including RN, but the token lands in access and proxy logs. Avoid if possible.
2. **First-message auth** — accept, require an `auth` frame within N seconds, close otherwise. This is what tRPC's `connectionParams` implements ([docs](https://trpc.io/docs/server/websockets)).
3. **Cookie** — automatic on the browser upgrade request (tRPC notes web apps can skip `connectionParams` entirely), but awkward in RN. Likely cookies for the console, pattern 2 for mobile.

⚠️ **Token refresh on an 8-hour connection is the real gap, and tRPC's WebSocket docs do not address it at all.** A JWT validated at connect and never re-checked means a revoked driver stays connected all shift. You own this: periodic server-side revalidation against a revocation list, an in-band `auth-refresh` message from the client, or `wssHandler.broadcastReconnectNotification()` to force all clients to re-establish (which is also the deploy-drain mechanism). Direct input to ticket 09.

**Operational cost, stated honestly.** Everything a managed service does for you, you now own:

- **Reconnection logic** on three clients, with exponential backoff and jitter.
- **Presence** — "is this driver online?" is in-memory in one process, and needs Redis the moment there are two.
- **Backpressure** — a customer on a bad connection cannot drain as fast as you produce. Bun surfaces this via `drain()`, `ws` via `socket.bufferedAmount`. At 12 msg/sec it is a slow leak rather than an outage, and position updates are the ideal case for *dropping* stale messages rather than queueing them — a 30-second-old fix has no value. (Ticket 06's backpressure question.)
- **Deploys and the 75-socket thundering herd.** Render documents the reality bluntly: WebSocket connections "close automatically when the instance is replaced (for example, during a deploy)," clients "are not guaranteed to reconnect to the same instance," and you get a 30-second SIGTERM window extendable to 300 s ([docs](https://render.com/docs/websocket)). Every deploy is 75 simultaneous reconnects against your handshake path and its auth/DB lookups. **Zero-downtime for stateful sockets genuinely requires ≥2 instances plus a backplane** — which is the one real argument for the Redis dependency at this scale, and it is an *availability* argument, not a capacity one.
- **Monitoring** — connection count, message rate, buffered-amount distribution, reconnect rate. None of it free. (This is exactly the map's "observability for the location pipeline" fog.)

**The infrastructure bill is tiny (~$5–15/month). The labour is where this option is expensive, and it is recurring, not one-time.**

---

## 5. Cross-cutting comparison

### Cost at the anchor workload

| Option | Est. monthly | Dominant meter | Sensitivity |
|---|---|---|---|
| Firebase RTDB | **~$1–3** | bytes downloaded | very low — tiny payloads |
| Firestore | ~$8–10 | per delivered doc read | linear in recipients |
| Custom TS server (VM) | ~$5–15 | flat instance | flat until capacity |
| AWS API GW WebSocket | ~$13 + Lambda + registry | per message + conn-minute | linear in messages |
| Convex | ~$17 (Starter) / $25 flat (Pro) | ⚠️ function calls (undefined) | swings on query shape |
| Cloudflare Durable Objects | ~$20 worst / possibly ~$5 | wall-clock duration | ⚠️ hinges on hibernation |
| Supabase | ~$38 | per delivered message | linear in recipients |
| Pusher | $49 flat (Startup) | day-capped tier | step function, 2× jumps |
| Ably | ~$56 | per delivered message | linear in recipients |

**The structural point, not the sticker prices:** options that bill per delivered message (Ably, Supabase, Firestore) scale their bill linearly with recipients-per-position. Options that bill duration or bytes (Durable Objects, RTDB, a VM) do not. At 3 recipients the gap is ~3–10×; **at 10 recipients per position Ably's bill roughly triples while Durable Objects' and a VM's are unchanged.** How many people watch one driver is therefore a *pricing-model* question for ticket 06, not just a UX one.

Equally: **the connection meter, which the ticket expected to dominate, is a rounding error at 75 connections everywhere** — under $1 on Ably, free on Supabase/Firestore/RTDB/Convex/DO. It would matter at 5,000 customers, not at 75.

### Capability matrix

| | Supabase | Firestore | RTDB | Convex | Ably | Pusher | CF DO | Custom TS |
|---|---|---|---|---|---|---|---|---|
| Geospatial | **PostGIS** | geohash lib ⚠️2022 | GeoFire ⚠️stale | first-party ⚠️beta | none | none | none | **PostGIS / Redis** |
| Fan-out billed? | per delivery | per delivery | by bytes | shared cache | per delivery | per delivery | **free** | **free** |
| Connection billed? | free ≤500 | no | no | no | ~$1 | tier cap | no | no |
| RN SDK | first-party | JS SDK (no persistence) / RNFirebase ⚠️3rd-party | same | first-party | first-party, active | native bridge, no Expo Go | raw WebSocket | raw WebSocket |
| Reconnect continuity | ⚠️ JWT expiry kills socket | ⚠️ 30-min rebill | — | ⚠️ undocumented | **~2 min auto-resume** | ⚠️ none documented | DIY | DIY |
| TS end-to-end | good (codegen) | weak | weakest | **strongest (managed)** | payload opaque | payload opaque | **shared types** | **strongest overall** |
| Auth for 3 actors | RLS + JWT claims, **fails closed** | claims + rules, **fails closed** | claims + rules | in-function, ⚠️**fails open** | **capability tokens** | signed endpoint | DIY in Worker | DIY / Better Auth |
| Ops burden | low | low | low | low | lowest | low | medium | **highest** |
| Status risk | — | — | — | ⚠️ beta components | — | — | — | — |

### Recurring axes the decision will actually turn on

These are the trade-offs, stated without a recommendation:

1. **Geospatial capability is the sharpest sorting criterion.** Only Supabase and a custom server on Postgres have a real, current, indexed spatial story. Firebase's is a stale 2022 library, Convex's is beta, and the transports have none at all — meaning any transport choice implicitly *also* requires a database decision, and the "drivers near pickup" requirement is what forces it.

2. **Fan-out billing model vs operational burden is the core tension.** The options that make fan-out free (Durable Objects, custom server) are the options where you write the reconnection, presence, backfill and auth-refresh code yourself. The options that solve reconnection for you (Ably above all) bill you per delivery. There is no option in this space that is both cheap at fan-out and hands you connection resilience.

3. **Auth failure mode deserves more weight than usual here.** Ticket 09 names the security crux — a customer may read a driver's position *only* while that driver runs their job. Supabase RLS, Firebase Security Rules and Ably capability tokens all express that and **fail closed**. Convex's in-function checks and any custom server **fail open** on a forgotten check. Live location is sensitive personal data (ticket 10), which raises the cost of that asymmetry.

4. **TypeScript end-to-end strength runs opposite to managed-ness.** Custom server (tRPC + Zod + Drizzle) and Durable Objects give compile-time-checked message payloads; Convex gives the strongest managed story; Ably and Pusher payloads are inherently opaque blobs crossing a vendor boundary; Firebase is weakest. Given TypeScript-everywhere is the map's one *fixed* constraint, this axis is not cosmetic.

5. **Serverless hosting is a trap that has changed shape.** It is no longer "serverless can't do WebSockets." Vercel and AWS API Gateway both will — and then disconnect you every 5–13 minutes (Vercel) or every 2 hours with a 10-minute idle timeout (AWS), while metering you per connection-minute and forcing you to build the external state store anyway. **You absorb the full complexity of the custom-server option and still pay per-connection.** Netlify offers nothing; plain Cloudflare Workers cannot coordinate across connections.

6. **Composition vs single platform.** Ticket 05 asks whether one platform serves auth, data, realtime, file storage (proof-of-delivery photos, ticket 11) and push (ticket 12). Supabase and Firebase plausibly cover all five. Convex covers most. Every transport option (Ably, Pusher, DO) is explicitly a *composition* — transport + database + auth + storage + push as separate decisions, which multiplies ticket 05's blast radius into 09, 10, 11 and 12.

7. **Two prototype-sized unknowns could move the ranking**, and neither can be resolved from documentation: whether Cloudflare DO hibernation engages at a 5-second cadence (a 4× swing in its cost), and how Convex's WebSocket behaves on a backgrounded RN app across an 8-hour shift (undocumented entirely).

---

## Unverified and uncertain

Flagged because ticket 05 should not treat these as established.

**Pricing generally.** All figures were read from official pages on 2026-07-27 and may have changed. Several vendors render pricing client-side and could not be fetched at all — see below.

**Managed/BaaS**

1. **Convex's definition of a "function call"** — not defined on the pricing page, pricing FAQ, limits page, or usage-tracking API (whose fields are all byte/time meters, with no `function_calls` field). The "mutation plus one re-run per subscription" rule came from Convex's community Q&A mirror, not docs. **The entire Convex estimate rests on it** and could be off 2–3×.
2. **Convex per-subscriber query re-execution billing** — docs confirm identical (query, args) pairs share a cached response, but not whether billing counts one re-run or one per subscriber.
3. **Convex React Native connection resilience** — no first-party documentation of reconnection, backgrounding, or token refresh on a long-lived socket. Must be prototyped.
4. **Firestore regional pricing outside nam5** — cloud.google.com's table renders client-side. Only the nam5 figures are verified; single-region is cheaper by an unconfirmed amount.
5. **Firestore realtime limits** — the commonly cited 1,000,000 concurrent connections / 100 snapshot listeners figures are **not present** on Firebase's or Google Cloud's current quota pages. Do not cite them.
6. **The "1 sustained write/sec per Firestore document" limit is retired** — current docs say the max rate "depends highly on the workload." Any comparison quoting 1/sec is quoting a dead figure.
7. **Supabase Micro + Postgres Changes throughput** — two official Supabase pages disagree (30 changes/sec vs 5 changes/sec at 500 clients with RLS).
8. **React Native Firebase's "officially recommended" status** — claimed on rnfirebase.io (Invertase); not corroborated on any firebase.google.com page. Third-party maintained.
9. **`firebase/geofire-js` maintenance status** — repo not archived, no maintenance statement. Staleness inferred from `geofire-common@6.0.0` published 2022-07-13.

**Transports**

10. **Cloudflare DO hibernation eligibility threshold** — whether a 5-second inter-message gap permits hibernation is undocumented. Largest single swing in any estimate here ($5 vs $20/month). Load-test before committing.
11. **Ably Standard base-fee allowances** — the pricing page says "$29/month + usage" without stating whether the base includes any message allowance. The estimate assumes none (pessimistic).
12. **Pusher overage behaviour** — whether exceeding the daily cap throttles, blocks or auto-bills is not stated first-party.
13. **Pusher per-channel/per-connection publish rate limits** — not published (unlike Ably's explicit 50 msg/s).
14. **PartyKit end-of-life** — no official deprecation notice or migration guide exists. The "dormant" conclusion is inferred from npm release cadence and the Agents SDK's documented layering. Its docs still present it as current, which is itself the hazard.
15. **Max WebSocket connections per Durable Object** — not documented. Not a constraint at 75, relevant if you consolidate topology.

**Custom server and hosting**

16. **`react-native-sse`** — npmjs.com returned HTTP 403. That RN *lacks* native `EventSource` **is** verified from reactnative.dev; the shim's capabilities and maintenance are not.
17. **Render's monthly prices** — render.com/pricing is JS-rendered and yielded no figures across repeated attempts. Instance *specs* are verified; dollar amounts are not. Render also bills a workspace plan fee separately from compute.
18. **Hetzner pricing is likely stale.** The CX22 €3.79/mo figure predates Hetzner's own [price adjustment effective 2026-06-15](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) (CAX11 €4.49 → €5.99 verified). Re-check before quoting.
19. **Fly.io proxy idle timeout** — not stated in the networking docs. Assume one exists; send heartbeats.
20. **Railway WebSocket support and idle timeout** — no first-party doc located. Long-running containers strongly imply support, but it is undocumented.
21. **DigitalOcean App Platform WebSocket support and idle timeout** — pricing verified, connection policy not.
22. **AWS ALB pricing (~$16/mo)** — not fetched. It dominates the Fargate total, so it matters.
23. **PostGIS version on Neon** — availability verified, version not stated.
24. **RDS and Timescale PostGIS availability** — asserted, not verified first-party in this pass.
25. **TimescaleDB specifics** (hypertables, compression, retention policies) — not verified. Native Postgres declarative partitioning **is** verified.
26. **Single-instance capacity for 75 connections** — inferred from uWebSockets.js's "100k sockets on a Raspberry Pi 4" README claim and Bun's throughput claims, not measured. The margin is three orders of magnitude, so the conclusion is safe even if the inputs are marketing.
