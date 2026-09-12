# May Mapbox geocoding output be stored permanently? (ticket 41)

Primary sources only: Mapbox Product Terms (July 21, 2026), Mapbox ToS, docs.mapbox.com, mapbox.com/pricing. Read 2026-08-29.

## Verdict

**No — not by default, and there is no cache window to hide in.** Mapbox's Product Terms say flatly: *"Customer shall not export, store, or cache Temporary Geocodes"* (§2.7.2). Zero days, not thirty. Every Geocoding API response is a Temporary Geocode unless you explicitly ask for a Permanent one.

**But the fix is cheap and self-serve.** Set `permanent=true` on the Geocoding v6 request. That converts the response into a Permanent Geocode, which *"Customer may permanently store"* (§2.7.3). It costs **$5.00 per 1,000 requests, billed from the first request** (no free allowance), and requires only *"a valid credit card on file or an active enterprise contract"* — a card is enough; you do not need to sign an enterprise Order. At this project's volume (a few hundred to a few thousand new saved addresses per month, geocoded once each) that is **roughly $2–$15/month**.

**Three things in ticket 33's current shape are actually non-compliant and must change:**

1. `formatted_address` stored from a default (temporary) geocode → must come from a `permanent=true` request.
2. If address search is built on the **Search Box API** (the default path in Mapbox Search JS, and the natural read of "search → confirm pin"), there is **no permanent option at all** — Search Box output is temporary-only, full stop. Search must be built on **Geocoding v6** (`/search/geocode/v6/forward`) with `permanent=true`, not Search Box.
3. **Do not display lat/lng to end users.** §2.7.1(b) forbids displaying latitudes or longitudes directly to End Users or third parties, and §2.7.3(iv) repeats it for Permanent Geocodes. A courier screen showing raw coordinates would breach this independently of any storage question.

**Ticket 23's Directions calls are fine only because they store nothing** — and that is not a soft preference. §2.10.1: *"Customer shall not export, download, cache or store results from any request to a Navigation API."* There is no paid unlock. Storing a road distance from Directions is prohibited outright.

---

## Sources

| Source | URL |
|---|---|
| Mapbox Product Terms, July 21, 2026 (PDF, the operative contract) | https://cdn.prod.website-files.com/609ed46055e27a02ffc0749b/6a60463142f6478d57642594_Mapbox%20Product%20Terms%20(July%2021%2C%202026).pdf (linked from https://www.mapbox.com/legal/product-terms) |
| Mapbox Terms of Service | https://www.mapbox.com/legal/tos |
| Geocoding API v6 reference | https://docs.mapbox.com/api/search/geocoding/ |
| Search Box API reference | https://docs.mapbox.com/api/search/search-box/ |
| Temporary vs Permanent geocoding help page | https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/ |
| Directions API reference (under `/api/navigation/`) | https://docs.mapbox.com/api/navigation/directions/ |
| Mapbox Search JS `geocoding` core API | https://docs.mapbox.com/mapbox-search-js/api/core/geocoding/ |
| Pricing page | https://www.mapbox.com/pricing |

The ToS itself contains **no** geocoding storage clause — it incorporates the Product Terms by reference, and the Product Terms PDF is where all the operative language lives. Anyone checking `mapbox.com/legal/tos` alone will find nothing and wrongly conclude storage is unrestricted.

---

## Q1 — Does the free/standard Geocoding tier permit permanent storage? Is there a cache window?

**No permanent storage, and no cache window at all.** The restriction is not tier-gated; it is gated on the *request mode*.

Product Terms **§2.7.2 Temporary Geocodes** (verbatim):

> Customer shall not export, store, or cache Temporary Geocodes. Customer may display Temporary Geocodes (other than the latitudes and longitudes) to its End Users through its Licensed Application(s) and use Temporary Geocodes to position results on a map.

**§3.71**: *"'Temporary Geocode' means a Geocode other than a Permanent Geocode."*

**§3.30**: *"'Geocode' or 'Geocoding Result' means the response to any request to a Search API or Atlas Search."* — the whole response, string and coordinate alike.

**§3.54**: *"'Permanent Geocode' means a Geocode obtained from (i) using a Search API in `mapbox.places-permanent` mode (for Geocoding API v5 or earlier versions) or when the optional `permanent` parameter is set to `true` (for Geocoding API v6 or later versions) or (ii) an Atlas Permanent Geocode."*

So: **default request → Temporary Geocode → may not be stored or cached for any period.** There is **no 30-day allowance for geocoding**. The only thirty-day clause in the current Product Terms is §2.8.1, and it is about *Mapping* APIs (map tiles) on an end-user device — *"caching is limited to thirty (30) days on the same device making the Mapping API request"* — and has nothing to do with Search APIs. If anyone remembers "Mapbox lets you cache for 30 days," that is the tile clause, misapplied.

The docs restate the same thing plainly ([Geocoding v6, "Storing Geocoding Results"](https://docs.mapbox.com/api/search/geocoding/)):

> The Mapbox Geocoding API offers two types of result storage: Permanent and Temporary. Temporary results are not allowed to be cached, while Permanent results are allowed to be cached and stored indefinitely. Using Permanent storage with the Geocoding API requires that you have a valid credit card on file or an active enterprise contract. By default, the Geocoding API will use Temporary geocoding. To use Permanent geocoding, set the optional `permanent` parameter to `true`.

Two extra restrictions in **§2.7.1 General** that bear on this app and are easy to miss:

> Customer shall not use Geocoding Results (i) to develop a general database of points-of-interest, locations, addresses, areas or boundaries (of any geographic size) […] In addition, Customer shall not (a) resell, re-syndicate or otherwise make available any Geocoding Results to other publishers or third parties or (b) display the latitudes or longitudes directly to End Users or other third parties.

(i) is not a problem — a per-customer delivery-address book for one meat business is not "a general database of addresses." (b) **is** a problem if any screen prints coordinates.

---

## Q2 — Does storing the coordinate differ from storing the string? And does the pin-drop path escape?

**They do not differ.** A "Geocode" is defined as *the response* to a Search API request (§3.30) — there is no clause splitting the coordinate from the label. §2.7.2's prohibition covers the whole thing. What *does* split them is **display**: §2.7.2 permits displaying a Temporary Geocode *"other than the latitudes and longitudes"*. So the string may be shown but not stored; the coordinate may be neither shown nor stored.

**The pin-drop path does escape — for the coordinate only, and only when the pin is genuinely the customer's own placement.**

A coordinate the customer produces by dragging a pin on a map is not a response to a Search API request, so it is not a Geocode and §2.7 does not reach it. The general clause that makes this explicit is **§1.19 Data**:

> Notwithstanding anything herein to the contrary, nothing in this Agreement shall restrict or limit (i) use by Customer of any data that Customer has the right to access and use independent of the Agreement […]

Two caveats that matter for ticket 33's exact flow:

- **The "search → confirm pin" path taints the pin.** If the pin's position originates from a search result and the customer merely confirms it without moving it, the stored coordinate is a copy of a Temporary Geocode's `latitude`/`longitude`, not independent customer data. Only a genuinely customer-*placed* or customer-*moved* pin is clean. Treating "customer tapped Confirm" as laundering is not a defensible reading.
- **The map tile underneath is not the issue.** Reading a coordinate off a rendered Mapbox map is a Mapping API interaction, and §2.8 restricts caching *Licensed Map Content* (tiles, styles, sprites) — a lat/lng the user picked is not Licensed Map Content.

So: **pin coordinate from a real drop = storable forever, free. Address string = Geocoding Result either way = needs `permanent=true`.**

---

## Q3 — Does reverse geocoding sit differently from forward?

**No.** The Product Terms never distinguish direction of the query — §3.30 covers *"the response to any request to a Search API"*, and §2.7.2/§2.7.3 turn only on Temporary vs Permanent. The Geocoding v6 reference lists the identical optional `permanent` parameter on both `/search/geocode/v6/forward` and `/search/geocode/v6/reverse`, with the same description: *"Specify whether you intend to store the results of the query (true) or not (false, default)."* The pricing page confirms the paid SKU covers both: *"Permanently store forward and reverse search results, make batch geocoding requests, or both."*

Consequence for ticket 33's pin-drop escape hatch: **the reverse-geocoded caption is exactly as restricted as a forward-searched one.** Dropping a pin frees the coordinate, not the string. The `permanent=true` flag must be set on the *reverse* call too.

---

## Q4 — Is a permanent-storage entitlement sold, at what price, and does it require leaving the free tier?

**Yes. It is a separate metered SKU, "Permanent Geocoding," and it has no free tier — but it does not require an enterprise contract.**

Product Terms **§2.7.3 Permanent Geocodes** (verbatim):

> Customer may permanently store Permanent Geocodes and may query the Geocoding API programmatically for Permanent Geocodes. Customer shall only use Permanent Geocodes for Customer's own internal business use. Notwithstanding the foregoing sentence, Customer may use Permanent Geocodes in its Licensed Application if all following conditions are fulfilled (i) access to Permanent Geocodes cannot be a primary or significant feature of a Licensed Application but only used to support an ancillary or incidental feature, (ii) a separate API request for a Permanent Geocode shall be made for each End User account that accesses, uses, or relies on such Permanent Geocode in any way, (iii) the Licensed Application shall not allow an End User to sublicense, sell, rent, lease, transfer, assign, disclose, or distribute a Permanent Geocode to any other End User or third party, and (iv) if Permanent Geocodes are displayed in a Licensed Application, latitudes and longitudes may not be made available to End Users.

Pricing, from [mapbox.com/pricing](https://www.mapbox.com/pricing):

| SKU | Free allowance | Paid rate |
|---|---|---|
| **Geocoding API** (temporary) | Up to 100,000 requests/month | $0.75 / 1k (100k–500k), $0.60 / 1k (500k–1M), $0.45 / 1k (1M+) |
| **Permanent Geocoding API** | **none** | **$5.00 / 1k (1–500,000)**, $4.00 / 1k (500,001+) |
| Search Box API | Up to 500 sessions/month | $3.00 / 1k, then $2.75, $2.50 |
| Directions API | Up to 100,000 requests/month | $2.00 / 1k, then $1.60, $1.20 |
| Map Loads (GL JS) | Up to 50,000/month | $5.00 / 1k, sliding to $2.50 / 1k |

Pricing-page copy for the permanent SKU:

> **Permanent Geocoding** — Permanently store forward and reverse search results, make batch geocoding requests, or both. Results from the Permanent Geocoding API are only available for your own personal or business use, and cannot be used for distribution or sublicense. […] If you're interested in using this API, please contact Mapbox sales.

**Does it require leaving the free tier?** Yes for this SKU and only this SKU. Permanent requests are billed from request #1 at $5/1k, so the *first* permanent geocode costs money. But the account stays self-serve pay-as-you-go — the docs' gate is *"a valid credit card on file **or** an active enterprise contract"*, so a card satisfies it. The pricing page's "contact sales" line reads as an upsell prompt, not a hard gate; the docs and the `permanent` parameter are the authoritative mechanism. Everything else on the account (map loads, temporary geocodes, Directions) keeps its free tier.

**Do the separate temporary/permanent endpoints still exist?** The *endpoints* were merged; the *SKUs* were not. v5 used a distinct mode in the path (`mapbox.places-permanent` vs `mapbox.places`). v6 uses one endpoint and a query parameter (§3.54 spells out both generations). Billing remains split. **Search Box has no permanent mode in either form** — see Q6.

Mapbox Search JS exposes the flag on its core geocoding API ([docs](https://docs.mapbox.com/mapbox-search-js/api/core/geocoding/)):

> `permanent` boolean — Permanent geocodes are used for use cases that require storing data indefinitely. If 'true', requests will be made with permanent enabled. Separate billing for permanent geocoding will apply. If undefined or 'false', the geocoder will default to use temporary geocoding. Temporary geocoding results are not allowed to be cached.

### Does §2.7.3's condition list bite this app?

Probably not, but it deserves a conscious read, because the clause is stricter than the "just pay $5/1k" summary suggests.

- The **first sentence** grants unconditional permanent storage for *"Customer's own internal business use."* An own-fleet dispatch and courier system for one meat business is internal business use. The delivery-address book exists to run the business's own operations.
- The **conditions (i)–(iv)** attach only to using Permanent Geocodes *in a Licensed Application* — i.e. exposing them to End Users. The customer-facing ordering app is where this could bite: condition (i) says permanent geocode access *"cannot be a primary or significant feature […] but only used to support an ancillary or incidental feature."* Showing a customer their own saved delivery address as a caption on a checkout screen is ancillary — the product being sold is meat, not address lookup. Condition (ii) — a separate API request per End User account — is naturally satisfied if each customer's address is geocoded during *their own* address-entry flow (which is exactly ticket 33's design; addresses are not shared between customers). Condition (iv) — no lat/lng to End Users — is the one to actually enforce in the UI.

If it ever becomes uncomfortable, the clean framing is: the stored `formatted_address` is a **business record of a delivery instruction**, held for internal fulfilment, and merely echoed back to the customer who dictated it. That is squarely the first sentence, not the conditional carve-out.

---

## Q5 — Does the restriction reach the Directions API?

**Yes, and harder than for geocoding — there is no paid unlock.**

Product Terms **§2.10.1 Navigation APIs** (verbatim):

> Customer shall not export, download, cache or store results from any request to a Navigation API.

**§3.51**: *"'Navigation APIs' means Mapbox's navigation service APIs as described in Mapbox documentation. Navigation APIs may be accessed directly or through a Navigation SDK."*

The Directions API is documented at `docs.mapbox.com/api/navigation/directions/` — inside the Navigation section of the API docs — so it is a Navigation API by §3.51, and §2.10.1 applies in full. Note the clause has **no** Temporary/Permanent split and **no** corresponding paid SKU: unlike geocoding, there is no `permanent=true` for Directions and nothing on the pricing page that sells route-result storage. Storage of Directions output is prohibited outright at every tier.

**Confirmation for ticket 23:** storing nothing is exactly what keeps the road-distance radius check unaffected, and it is a *hard* requirement, not an optimisation. Concretely, ticket 23 must:

- Use the Directions response transiently — compute the in/out-of-radius decision in memory, discard the response.
- **Not** persist the returned distance in metres, duration, geometry/polyline, or waypoint snapping on the Address or Order record.
- Be careful with the **boolean**. Storing "this address is inside the delivery radius" is a derived business decision, not a Directions result, and is defensible. Storing "road distance = 4,732 m" is storing a result. Keep the persisted artefact a decision, not a measurement.
- Not build a distance cache to save on the 100k/month free Directions allowance. That cache would be the prohibited thing. At this volume the free tier is not remotely at risk anyway.

Same logic reaches the **Matrix API** (also under `/api/navigation/`) if it is ever used for batch radius checks, and the **Isochrone API**.

---

## Q6 — If permanent storage weren't bought: what is the cheapest compliant record shape?

Ranked, cheapest-compliant first.

### Option A — Pay for Permanent Geocoding (recommended)

Change one query parameter. Store everything ticket 33 already wants to store.

- **Cost:** $5.00 per 1,000 geocode requests. Geocoding happens **once per new or edited address**, not per order and not per display. A meat business doing low thousands of orders/month from a repeat customer base will make far fewer than 1,000 address-entry sessions/month once the address book warms up. Call it **$2–$15/month**, and it does not grow with order volume or with how often an address is displayed.
- **Requires:** a credit card on file. No enterprise Order.
- **Also requires:** dropping Search Box for the search step (below).
- **Leaves untouched:** map loads, Directions, everything else on the free tier.

### Option B — Store nothing from Mapbox; re-geocode on display

Store only (a) the customer-placed pin coordinate and (b) customer-typed free text. Reverse-geocode the pin at display time on the temporary tier.

Compliance is sound: the pin is customer data outside the Agreement (§1.19), free text is customer data, and §2.7.2 expressly permits *displaying* a Temporary Geocode's non-coordinate fields. **Economically it is also viable** — the temporary tier gives 100,000 requests/month free, and even a generous estimate (every order list row, courier stop card, and admin view triggering a reverse geocode) stays well inside that at low-thousands order volume, especially with per-session in-memory (non-persisted) reuse.

But it is worse than Option A on everything that isn't the invoice:

- **Offline breaks.** A courier in a Philippine barangay with no signal gets a pin and no address caption — precisely when the caption matters most. This alone probably disqualifies it for the courier app.
- **The order ledger stops being a ledger.** ADR 0003's snapshot exists so an Order records what the address *was* at order time. A re-geocoded caption reflects what Mapbox thinks *today*. Historical orders would silently mutate, and a shipped-to address that can change after the fact is a real operational and dispute-resolution problem.
- **Latency and failure modes** on every list render.
- **More code owned** — a geocode-on-read layer, a request cache that must be carefully non-persistent, and offline fallbacks — to save under $15/month.

### Option C — The pin plus a customer-authored caption (free, and worth doing regardless)

The genuinely free-and-clean record is: **pin coordinate (customer-placed) + address text the customer typed or edited themselves + structured details fields (unit, floor, landmark, notes) the customer entered.** All of it is customer data under §1.19; none of it is a Geocoding Result.

The honest caveat: if the caption field is *pre-filled* with the geocoder's `place_name` and the customer merely accepts it unedited, the stored string is a copy of a Temporary Geocode and Option C collapses back into a §2.7.2 breach. Pre-filling is exactly what ticket 33's "search → confirm" flow does. Making Option C real would mean either not pre-filling (bad UX, and it fights ticket 33's whole design) or requiring an edit (worse).

**So Option C is best used as a hardening layer on top of Option A, not as a substitute for it.** Ticket 33 already treats the written address as a *caption* and the pin as authoritative; leaning further into customer-authored landmark text ("beside the blue gate, 2nd house after the sari-sari store") is both better for Philippine last-mile delivery *and* reduces how load-bearing the licensed string is.

### Not an option: Search Box + storage

The Search Box API has no permanent mode at any price. From its [restrictions and limits](https://docs.mapbox.com/api/search/search-box/):

> The Mapbox Terms of Service state that all data returned by the Search Box API endpoints is only available for temporary use. If your use case requires storing position data, contact Mapbox sales.

Its free tier is also thin — 500 sessions/month, then $3.00/1,000, which is *more* than the $5/1,000 permanent geocode looks like once you count that a session bundles several `/suggest` calls plus a `/retrieve`. Search Box buys nicer autocomplete UX and cannot be stored. **Use Geocoding v6 forward search with `permanent=true`.**

---

## What ticket 33 must change

1. **Every geocode call — forward and reverse — sets `permanent=true`.** One parameter; both directions.
2. **Address search uses Geocoding v6 (`/search/geocode/v6/forward`), not the Search Box API**, and not the Search Box-backed components in Mapbox Search JS. If a `mapbox-search-js` component is used, it must be the core `geocoding` API with `permanent: true`.
3. **Put a credit card on the Mapbox account** before the first permanent request. Budget ~$5–15/month.
4. **Never render raw lat/lng to a customer or courier** (§2.7.1(b), §2.7.3(iv)). Show the pin on a map, show the caption; do not print "14.5995, 120.9842" on a screen or a printed manifest. Internal admin/debug surfaces are the risk area.
5. **Keep the coordinate provenance distinct.** A genuinely customer-dropped pin is free and unrestricted forever; a coordinate copied from an unmodified search result is a Geocode. If the pin is stored from a `permanent=true` response either way, this stops mattering — which is another reason to just pay.
6. **Ticket 23 stays store-nothing for Directions**, and that constraint should be written into the ticket as a licensing requirement rather than left as an implementation detail. Persist the radius *decision*, never the distance.

**Is ticket 02's vendor choice in question?** No. This is a one-parameter change plus a card on file, at a cost that rounds to nothing against this project's scale. Every comparable provider (Google, HERE, TomTom) has an equivalent or stricter storage clause; Mapbox's is unusually *cheap* to satisfy at low volume, since permanent geocodes are charged per request rather than requiring a platform tier upgrade.
