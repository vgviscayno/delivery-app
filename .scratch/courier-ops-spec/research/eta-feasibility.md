# ETA feasibility at zero cost

Research for [ticket 24](https://github.com/vgviscayno/delivery-app/issues/24).

**Researched 2026-07-29.** Pricing was read from Mapbox's official pricing page on that date. Pricing pages change and often render client-side — re-verify before committing to any number. Items that could not be confirmed from a first-party source are collected in [Unverified and uncertain](#unverified-and-uncertain) and flagged inline with ⚠️.

**This document does not decide whether to reopen ticket 14 ("no ETA, ever") or remove the map's Out-of-scope ETA line.** That is a future grilling-ticket call. This document only establishes the feasibility facts a free-path ETA decision would need — what a free tier actually covers, how good a zero-cost heuristic actually is, and what self-hosting really costs — so that decision can be made with real numbers instead of vibes.

---

## Top-line recommendation

**Yes — there is a path to an ETA that is genuinely free (zero third-party billing, zero new infra), and it is option 2, the zero-cost heuristic, not the Mapbox Directions API.**

Reasoning, in order of how "free" each option actually is:

1. **Mapbox Directions API free tier (100,000 requests/month) would very likely cover this business's volume with wide margin** — estimated realistic usage lands somewhere between ~600 and ~12,000 calls/month against a 100,000 ceiling (see §1). This is the option closest to "a true routing ETA for $0," and if the client wants routing-quality accuracy, this is the recommendation. But it is not risk-free-forever: it adds a new external dependency (an API that ticket 02 committed to for maps/geocoding but explicitly not for routing), a new failure mode (what does the app show if Mapbox is down or the key is misconfigured), and a ceiling that could be breached by growth, a promo push, or a bug that double-calls Directions per order. "Free today" is not "free by construction" the way option 2 is.
2. **The zero-cost heuristic (straight-line distance × circuity factor ÷ assumed average speed, refined over time by a historical-average-per-distance-bucket table) costs nothing, ever, by construction** — no external API, no request ceiling, no new dependency, no new infra. It reuses the haversine distance ticket 07 already computes for live tracking. Its accuracy ceiling is lower than a true routing ETA (see §2), but for a *rough, clearly-caveated* customer-facing estimate ("arriving in about 20-30 minutes") rather than a precise promise, it is very plausibly good enough, and it is the only option in this document with zero exposure to a vendor's pricing page changing under the business later.
3. **Self-hosted OSRM is free to license but not free to run** — realistic infra + maintenance cost is estimated in the range of low-to-mid tens of dollars a month in compute alone, plus a nontrivial ongoing maintenance burden (map data refresh, patching, uptime ownership) that has no dollar figure but is real labor (see §3). This does not meet a literal "free" bar and is the weakest fit for this ticket's condition.

**If the client's bar is "as accurate as possible, and $0 is very likely but not mathematically guaranteed forever," Mapbox Directions is defensible.** **If the client's bar is "must never generate a bill, full stop," the heuristic is the only option that actually satisfies that.** A hybrid — heuristic by default, with Mapbox Directions available as a later upgrade if the client wants tighter accuracy and accepts the small residual cost risk — is a reasonable middle path, but note that any hybrid still means calling the Directions API in the normal case, which reintroduces the same non-zero (if very unlikely) cost exposure as option 1 alone.

None of this speaks to whether reopening ticket 14 or the Out-of-scope line is worth the churn — that's for the grilling ticket.

---

## 1. Mapbox Directions API free tier

**Source:** [mapbox.com/pricing](https://www.mapbox.com/pricing) (fetched 2026-07-29). Directions API is billed per request, separately from the Maps SDK (which bills by monthly active users) and separately from the Geocoding API (which has its own request tiers). Confirmed figures:

| Monthly requests | Price |
|---|---|
| 0 – 100,000 | Free |
| 100,001 – 500,000 | $2.00 / 1,000 |
| 500,001 – 1,000,000 | $1.60 / 1,000 |
| 1,000,001+ | $1.20 / 1,000 |
| 5,000,000+ | Contact sales |

This matches what third-party pricing trackers (Vendr, APICostCalc, buildmvpfast) independently report for the same figures, which is corroborating but not first-party — the mapbox.com/pricing fetch above is the primary source.

⚠️ Mapbox also publishes a per-endpoint reference page (`docs.mapbox.com/api/navigation/directions/#directions-api-pricing`) that the pricing guide links to for authoritative per-API numbers; that page did not return pricing content when fetched directly (likely rendered client-side), so the $/1,000 figures above are sourced from `mapbox.com/pricing` only. Re-verify both pages before committing to a number in an implementation ticket.

### Estimation: will this business's volume fit inside 100,000/month?

**Estimation — the following is judgment, not a documented fact about this business (no order-volume data exists yet for a system not yet built):**

- This is a single-location, own-fleet meat delivery business, not a chain. A plausible range for daily completed deliveries is **10–100/day**. The low end fits a business just getting its delivery arm running; the high end assumes a mature local operation. 100/day already implies ~15-25 concurrent stops across a fleet at any hour, which is a lot for "own drivers, single location" — most of the plausible range is probably lower-middle, but 100/day is a reasonable upper bound to stress-test against.
- Assume Directions is called **once per order to produce the customer-facing ETA**, plus a **conservative allowance for recalculation** — e.g. once more if the driver's route changes materially (a new order gets added to the same run, or the driver deviates). Call it **1–3 Directions calls per order** as a working range.
- At 10 deliveries/day × 1 call × ~30 days/month ≈ **300 calls/month** on the low end.
- At 100 deliveries/day × 3 calls × ~30 days/month ≈ **9,000 calls/month** on the high end.
- Even doubling the high-end estimate again (200/day, 3 calls, to account for growth or an aggressive recalculation policy — e.g. recalculating every time the driver's live position updates materially, not just once per route change) lands around **18,000/month** — still under a fifth of the 100,000 free ceiling.
- To actually threaten the free tier at $2/1,000 overage rates, the business would need something like 1,000+ deliveries/day with several Directions calls each, or a recalculation policy that calls Directions on every driver position ping rather than on route changes (which would be a design mistake, not a volume problem — ticket 07's ~1 ping/5s cadence times 20 drivers over an 8-hour shift is ~115,000 pings/day; calling Directions per ping would blow through the free tier in hours, not months). **The free-tier risk is a call-pattern risk (calling Directions too often per order), not an order-volume risk, for a business of this stated size.**

**Conclusion for §1:** for the order-volume range this ticket's framing implies (small, single-location, own-fleet), the Mapbox Directions free tier plausibly covers actual usage with a wide margin (roughly 5x to 300x headroom depending on where in the volume range the business actually lands), **provided the implementation calls Directions per-route/per-recalculation-event and not per-position-update.** That caveat is a real implementation-detail risk worth flagging to whichever ticket eventually specs this.

---

## 2. Zero-cost non-routing heuristic

**This entire section is reasoning and estimation, not a documented API fact.** There is no vendor pricing page to cite here because the point of this option is that it doesn't call a vendor at all.

### 2a. Straight-line distance ÷ assumed average speed

Ticket 07 already computes haversine (great-circle) distance between driver and destination for live tracking, so this needs no new computation, only a speed assumption and unit conversion — zero marginal infra or API cost.

**Estimation on accuracy:** straight-line distance systematically *understates* real driving distance, because real roads are not straight. Transportation-planning literature calls this ratio (real network distance ÷ straight-line distance) the **circuity factor** (also "detour index" or "route factor"). Multiple summarized sources (Wikibooks' *Transportation Geography and Network Science/Circuity*; academic circuity-factor literature such as Giacomin & Levinson's *Road network circuity in metropolitan areas*) converge on:

- Dense/grid urban areas: circuity factor roughly **1.2–1.3** (i.e., real driving distance is 20-30% longer than straight-line).
- Suburban and rural areas: roughly **1.3–1.6**.
- Short trips tend to be *more* circuitous than long trips (a well-established finding in this literature), which matters here since local meat delivery is mostly short trips.

⚠️ These circuity-factor ranges are drawn from summarized secondary/tertiary sources (search-engine synthesis of academic literature), not from reading the underlying papers directly — treat as a reasonable planning-level estimate, not a precise citation. If this heuristic is ever actually implemented, pulling the real circuity factor for the business's specific metro/suburban area (or just calibrating it empirically from a handful of real trips) would be cheap and more trustworthy than the literature average.

Applying a circuity factor corrects the *distance* estimate, but ETA also depends on speed, which the heuristic must assume as a flat constant (e.g. "25 mph average with stops"). Real average speed varies with:

- **Traffic variability** — time of day, day of week, and unmodeled congestion. A flat assumed speed cannot see live traffic at all; this is the single biggest source of error versus a true routing ETA, since routing APIs increasingly incorporate live/historical traffic and a haversine heuristic structurally cannot.
- **Stop density** — because this is a single route serving multiple stops per run (own-fleet local delivery typically batches several orders per driver trip), the "time to reach *your* delivery" isn't just distance-to-you ÷ speed — it's distance-to-you ÷ speed **plus however many stops are ahead of you in the driver's current route**, each costing several minutes of parking/handoff time that a pure distance-based heuristic ignores entirely unless the heuristic is stop-aware (e.g. adds a fixed per-stop-ahead penalty).
- **Compounding for a customer promise:** distance error (from ignoring circuity) and speed error (from ignoring traffic and stops) multiply, not add. A heuristic that's individually "20% under on distance" and "30% off on speed assumption" can produce an ETA that's wrong by a much larger margin in the worst case. **Estimation:** for CX purposes, the asymmetry matters more than the average error — a customer who's told "10 minutes" and waits 25 is aggravated in a way that "25 minutes, arrives in 15" is not. Any zero-cost heuristic implementation should bias its assumed speed conservatively (i.e., assume slower than optimistic free-flow speed) so the heuristic's typical error direction is over-estimate-time / under-promise, not the reverse.

### 2b. Rolling historical-average delivery time per distance bucket

Zero third-party cost, but requires the business to have accumulated its own delivery-time history first (a cold-start problem — early on there's no history to average, so this only becomes viable after the system has been live a while and logged completed deliveries with actual elapsed time and haversine distance for each).

**Estimation:** this option is structurally the *best long-run fit* for a zero-cost ETA, because it automatically bakes in this specific business's real circuity, real stop density, real average speeds, and real traffic patterns — all the things §2a has to approximate with borrowed constants — without ever calling an external API. Its accuracy should improve over time and, with enough historical volume, could plausibly approach or beat a generic routing-API estimate for *this specific delivery area*, since it's calibrated on the exact roads and exact stop patterns this fleet actually drives, whereas Mapbox Directions has no idea this business habitually makes 4 stops per run. The tradeoff is the cold-start gap and the need for some minimal data-bucketing logic (e.g. bucket by distance in reasonable increments, maybe by time-of-day) — engineering effort, not third-party cost, and worth flagging as a build cost even though it's not a *billing* cost.

**Combining 2a + 2b:** a natural design is to use 2a (haversine × circuity ÷ assumed speed, stop-density-adjusted) as the estimate until there's enough delivery history, then blend in or switch to 2b once the historical-average table has enough samples per bucket to be trustworthy. This is still entirely zero-cost and needs no new ticket-02/05 dependency.

---

## 3. Self-hosted OSRM total cost of ownership

**License:** OSRM (`osrm-backend`) is BSD-2-Clause ("Simplified BSD"), confirmed by reading [the repository's `LICENSE.TXT`](https://github.com/Project-OSRM/osrm-backend/blob/master/LICENSE.TXT) directly — permissive, free to use/modify/redistribute, no royalty, warranty disclaimed. The software itself is genuinely free. **The infrastructure to run it is not.**

### Compute sizing (estimation, informed by community-reported figures — no first-party OSRM sizing guide was found)

⚠️ No official OSRM sizing guide with hard numbers was located; the figures below come from GitHub issues, blog posts, and community wikis on the `Project-OSRM/osrm-backend` repo, not from OSRM's own documentation. Treat as informed estimation, not vendor-published spec.

- Community-reported rule of thumb: **runtime RAM needed is roughly 5x the size of the processed map data file** (the OSRM graph is loaded fully into memory for query performance).
- Reported real-world extract sizes for city-scale (not planet-scale) regions are small: a Berlin-sized extract has been reported at roughly ~2GB during processing; single-country/single-metro extracts (as opposed to continental or planet-wide) are commonly described as requiring single-digit GB of RAM for the extract step.
- Planet-scale figures (**not applicable here but worth noting to avoid over-scoping**: community reports cite 48-175+ GB of RAM for planet-wide preprocessing/runtime) are the numbers most OSRM discussion threads focus on, because most people asking about OSRM sizing online are trying to serve large or global areas. **This ticket's use case — one metro area around a single delivery location — is far smaller than what most published OSRM sizing discussion is actually about,** so the pessimistic planet-scale numbers should not be mistaken for what this business would actually need.
- For a single-city/metro extract specifically, a small-to-moderate cloud VM (in the range of 2-4 vCPU, 4-8 GB RAM) is plausibly sufficient to both preprocess and serve car-routing queries at this business's request volume, based on the "5x file size" rule of thumb applied to city-scale (not planet-scale) extract sizes. **Estimation:** at typical cloud VM pricing for that size class, this is likely on the order of **$20-$60/month** in raw compute, though this figure was not read from any specific cloud vendor's current price list for this exercise and should be re-priced against a real vendor (e.g. AWS/DigitalOcean/Hetzner) before being used in a cost comparison.

### Maintenance burden (not a dollar figure, but a real, non-zero cost)

This is the part that most clearly disqualifies "self-hosted OSRM" from counting as "free," independent of the compute bill:

- **Map data refresh.** OSM data changes continuously (new roads, closures, address changes). A self-hosted OSRM instance serves stale routing data until someone re-runs the extract/contract pipeline against a fresh OSM extract and redeploys. This is a recurring task with no vendor doing it for you — someone at this business (or a contractor) now owns a data pipeline that didn't exist before.
- **Security patching and dependency upkeep** of the OSRM binary/container image and its host OS — the same ongoing burden as any other self-hosted service, but new relative to this map's other backend choices (ticket 05's Supabase is managed; this would be the one piece of unmanaged infra in the whole stack).
- **Uptime monitoring and on-call ownership.** If OSRM goes down, the ETA feature breaks (or must degrade gracefully to the §2 heuristic, which somewhat undercuts the case for running OSRM at all — if the app needs a heuristic fallback regardless, that fallback might just be the primary path).
- **This is a genuinely new category of operational responsibility for a small, single-location business that has otherwise chosen entirely managed services (Mapbox, Supabase) everywhere else in this map.** That inconsistency — self-hosting one piece of infra while everything else is managed-by-vendor — is itself a cost worth naming, even though it doesn't show up on a cloud invoice: it's a new skill/ownership requirement, not just a new server.

**Conclusion for §3:** OSRM is free software but not a free feature. Between compute (~tens of dollars/month, estimated) and the ongoing maintenance burden (unbounded, falls on whoever owns it), this is the option furthest from satisfying a literal "achievable at zero cost" bar, and it introduces the one piece of self-managed infrastructure in an otherwise fully-managed stack.

---

## Unverified and uncertain

- ⚠️ **Mapbox's per-endpoint Directions pricing reference page** (`docs.mapbox.com/api/navigation/directions/#directions-api-pricing`) did not yield pricing content on fetch (likely client-side rendered); the $/1,000-request figures in §1 come from `mapbox.com/pricing` only, corroborated by third-party trackers (Vendr, APICostCalc) but not cross-checked against Mapbox's own per-API reference page. Re-verify both before committing to a number.
- ⚠️ **Circuity factor ranges** in §2a (1.2-1.3 urban, 1.3-1.6 suburban/rural) are drawn from search-synthesized summaries of transportation-planning literature (Wikibooks, and academic circuity-factor papers referenced secondhand), not from directly reading the primary academic sources. Treat as planning-level estimation.
- ⚠️ **OSRM compute sizing** in §3 (VM class, $20-60/month estimate) has no first-party OSRM sizing guide behind it — it's inferred from community GitHub issues/blogs discussing mostly planet- or country-scale deployments, scaled down by judgment to city-scale. No specific cloud vendor's current price list was checked against this estimate.
- ⚠️ This business's actual order volume (used throughout §1's estimate) does not exist yet — the system hasn't shipped. The 10-100 deliveries/day range is this document's own judgment call about what's plausible for "single location, own fleet," not a number sourced from the business.
- All Mapbox pricing figures should be re-verified against `mapbox.com/pricing` at implementation time — usage-based pricing pages are the most likely of any cited source in this document to have changed by the time a later ticket acts on this research.
