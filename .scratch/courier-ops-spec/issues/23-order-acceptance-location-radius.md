# Order-acceptance location radius

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

The client wants to restrict orders to customers within a delivery radius of the store — the store should not accept an order it can't reasonably deliver. New requirement, not previously in the domain model or map. Related to, but distinct from, the **Address entry and geocoding** item in Not yet specified — that item is about the UX of entering an address; this one is about a business rule applied once coordinates exist.

Sharpen with `/grilling` and `/domain-modeling`:

- **What's being measured against what.** The store has one fixed pickup location (single business, per `CONTEXT.md`). The radius check is presumably against the customer's **delivery address**, not their live device location — confirm that's the intent, not a "you must be standing near the store to order" rule.
- **The radius value.** A fixed number for MVP, or admin-configurable? Straight-line distance (consistent with the map's existing straight-line-only stance — no routing engine, per Out of scope) or does "radius" implicitly want road distance, which would reopen the routing-engine question this map has deliberately avoided?
- **Where it's enforced, and by whom.** A client-side pre-check (using Mapbox geocoding, already committed to in ticket 02) can guide the UX, but isn't authoritative — a spoofed or stale client could submit anyway. Does this need a server-side distance check (e.g. a Postgres/PostGIS function, given ticket 05 already put PostGIS on the table for the realtime-location requirement) before an Order is accepted?
- **Store location as a new fact.** No "Store" location/coordinates exist anywhere in the domain model or config yet — this may be the ticket that introduces the store's address as a config value, distinct from any customer or driver location.
- **Customer experience when out of radius.** Blocked at address entry (can't even save/select that address) vs. blocked at checkout with a message, and whether "how far over" is shown (e.g. "2km outside our delivery area") or just a flat rejection.

Deliver: the exact rule enforced (straight-line vs. road distance — and whether the latter is worth reopening the routing-engine question), where the store's coordinates live, and whether enforcement is client-only or has a server-side backstop.

## Answer

- **Measured against:** the customer's **delivery address**, not live device location. A customer can place an order from anywhere; what's checked is where the Delivery would go.
- **Distance type: road distance**, not straight-line. This deliberately reopens the routing-engine question the map's Out-of-scope line had closed for v1 — but it's answered by the same free-by-construction finding [ticket 24](24-eta-feasibility-for-free.md) already surfaced: **Mapbox Directions' free tier** (100k req/mo, ample headroom for this business's volume) is used for a distance-only Directions request per radius check. No self-hosted OSRM, no new vendor — this reuses the vendor relationship ticket 02 already committed to for maps/geocoding. This is a **routing dependency**, distinct from — and doesn't itself resolve — the ETA question still open in [ticket 25](25-eta-display-decision.md); ticket 25 should note that a Directions call now exists in the request path regardless of its own outcome.
- **Radius value: admin-configurable.** Lives alongside `store_hours`/`store_closures` in the dispatcher-console settings surface ticket 22 introduced — one settings screen, not two.
- **Store location as a new fact:** the store's own coordinates are a **new config value** — fixed (single business, doesn't move), not admin-editable like the radius is. Lives in `packages/config` per the monorepo layout from ticket 08.
- **Enforcement: client pre-check + server-side backstop.** The customer app calls Mapbox Directions at address-entry time to guide the UX; a server-side Postgres/Edge Function re-checks the same road-distance rule at Order-submission time before an Order is accepted, matching the fail-closed pattern already used for order-acceptance hours (ticket 22) and RLS auth (ticket 09) — a spoofed or stale client can't bypass it.
- **Customer experience:** **blocked at address entry** — an out-of-radius address can't be saved/selected in the first place, the earliest point this map's UX pattern (ticket 22) blocks at. The rejection **shows the distance over** the limit (e.g. "2km outside our delivery area"), since the Directions response already carries that number at no extra cost.

## Amendment — ticket 41 (Mapbox storage terms)

[Ticket 41](41-mapbox-geocoding-storage-terms.md) confirms this ticket is unaffected, and upgrades *why*. Product Terms §2.10.1 forbid exporting, downloading, caching, or storing results from **any** Navigation API request — Directions included — at **every** tier, with **no paid unlock** and no temporary/permanent split (unlike geocoding).

So "ticket 23 stores no Directions output" is a **hard licensing requirement**, not an incidental design choice. Persist the radius **verdict** — a derived business fact — and never the returned distance in metres. This ticket's stateless recomputation, and ticket 33's decision to persist no verdict at all, both already satisfy it; the constraint is recorded here so nothing later adds a cached-distance column as an optimisation.
