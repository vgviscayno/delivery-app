# ETA feasibility at zero cost

Type: research
Status: resolved
Blocked by: —
Map: ../map.md
Asset: ../research/eta-feasibility.md

## Question

The client asked to see an ETA for an order, **conditioned on it being achievable for free**. This reopens two existing decisions this map already made and would otherwise leave standing:

- Ticket 14 (customer live-tracking screen) chose **no ETA, ever** as part of its layout.
- The map's **Out of scope** section rules out ETA prediction entirely, explicitly to remove the routing-engine decision (OSRM, Valhalla, paid directions APIs) from the map.

Before either of those can be reopened as a grilling decision, someone needs to establish whether a genuinely low/no-cost path to an ETA actually exists. Investigate, preferring primary sources:

- **Mapbox Directions API's free tier.** This map already committed to Mapbox for maps and geocoding (ticket 02) and PostGIS is already in play (ticket 05) — check current published pricing/free-tier request limits for the Directions API specifically, and estimate whether a small single-location delivery business's order volume would plausibly stay inside it.
- **A non-routing heuristic that costs nothing at all.** Straight-line distance (already computed for ticket 07's tracking) divided by an assumed average speed, or a rolling historical-average delivery time per distance bucket, either of which needs no third-party API. Assess how misleading this would be in practice (traffic, non-straight-line real routes) versus a true routing ETA.
- **Self-hosted OSRM** as a fallback if Mapbox's free tier doesn't cover volume — free to license, but not free in total cost of ownership (infra to run and maintain), which matters since "for free" is the client's explicit condition.

Deliver a clear recommendation: is there a path to an ETA that is actually free (or close enough to zero infra cost to count), and if so which one. Write findings to `.scratch/courier-ops-spec/research/eta-feasibility.md`. This does not itself decide whether to reopen ticket 14 or remove the Out-of-scope line — it feeds the grilling ticket that will.

**Not fired yet** — written for the map owner to review and decide when to run, matching how tickets 18 and 19 were handled.

## Answer

Findings: [`research/eta-feasibility.md`](../research/eta-feasibility.md).

**Yes — a genuinely zero-cost path exists, and it's the non-routing heuristic, not Mapbox Directions.**

- **Zero-cost heuristic (recommended):** haversine distance (already computed by ticket 07's tracking) × a circuity-factor correction (~1.2–1.3 urban, ~1.3–1.6 suburban, per transportation-planning literature) ÷ an assumed average speed, evolving into a rolling historical-average-per-distance-bucket model once real delivery history accumulates. Zero third-party billing, zero new dependency, zero ceiling — free by construction, not just free today. Weaker accuracy than true routing (no live traffic, no stop-density awareness unless added explicitly); recommend biasing the speed assumption conservatively so errors skew toward under-promising rather than over-promising.
- **Mapbox Directions API free tier** (100,000 requests/month, confirmed at mapbox.com/pricing) would also very plausibly cover this business's volume — estimated 300–18,000 calls/month depending on order volume and recalculation policy, 5x–300x headroom. Gives routing-quality accuracy but adds a new external dependency, a new failure mode, and a ceiling that's "free today," not free by construction. The one real risk is a call-pattern mistake (e.g. calling Directions per position-ping instead of per route-change), not an order-volume problem.
- **Self-hosted OSRM** is free to license (BSD-2-Clause) but not free to run: estimated $20–60/month compute plus an unbounded, real maintenance burden (data refresh, patching, uptime) — the one piece of unmanaged infra in an otherwise fully-managed stack. Weakest fit for a literal "free" bar; not recommended.

This does not itself decide whether to reopen ticket 14 ("no ETA, ever") or remove the map's Out-of-scope ETA-prediction line — that's the follow-up grilling ticket's call, now that the feasibility question is answered.
