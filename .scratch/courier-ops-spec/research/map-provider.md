# Map provider for React Native and web

Research for [issue 02](https://github.com/vgviscayno/delivery-app/issues/2). Researched 2026-07-27.

Scope reminder: tile rendering, markers, and a smoothly moving vehicle position across a web
dispatcher console and two React Native apps. Directions, ETA and routing are out of scope, so
nothing here weighs a directions API. Geocoding is out of scope for *this* ticket but noted where
a provider bundles it, because the map fog item "Address entry and geocoding" hangs off this
decision.

Package versions and dates below were read from the npm registry and from the published tarballs
on 2026-07-27, not from documentation prose.

---

## 1. The candidates, and why they are not three independent options

The three candidates are not equidistant. Mapbox GL JS v1 was BSD-licensed; MapLibre GL JS is the
community fork of that codebase, and `@maplibre/maplibre-react-native` is a fork of
`@rnmapbox/maps` ("the repository is a fork of rnmapbox that diverged when the MapLibre and Mapbox
SDKs have diverged" — [maplibre/maplibre-react-native](https://github.com/maplibre/maplibre-react-native)).
Both families speak the same **Mapbox Style Specification** and expose near-identical React
component trees (`MapView` / `Camera` / `ShapeSource` / `SymbolLayer` / `CircleLayer`).

Google is the odd one out: a different style model, a different component API on every surface,
and no shared style artifact between web and native.

That shapes the whole decision. Choosing Mapbox or MapLibre is a choice *within one family* and is
substantially reversible. Choosing Google is a choice of a different family and is not.

### Package status (npm registry, read 2026-07-27)

| Package | Latest | Published | License | Notes |
|---|---|---|---|---|
| `@rnmapbox/maps` | 10.3.5 | 2026-07-22 | MIT | wraps Mapbox Maps SDK v11 (pins iOS `~> 11.23.1`, Android `11.23.1`) |
| `@maplibre/maplibre-react-native` | 11.3.6 | 2026-06-25 | MIT | wraps MapLibre Native iOS 6.26.0 / Android 13.2.0 |
| `react-native-maps` | 1.29.0 | 2026-06-28 | MIT | Google Maps + Apple Maps |
| `mapbox-gl` (web) | 3.27.0 | 2026-07-23 | proprietary ("SEE LICENSE IN LICENSE.txt") | |
| `maplibre-gl` (web) | 6.0.0 | 2026-07-22 | BSD-3-Clause | v6 released 2026-07-22 |
| `@vis.gl/react-google-maps` | 1.9.0 | 2026-07-03 | MIT | Google's React wrapper for Maps JS |
| `pmtiles` | 4.4.1 | 2026-04-08 | BSD-3-Clause | |

All five relevant SDKs shipped a release within the last five weeks. "Is the binding alive" is not
a discriminator in 2026 — every one of them is alive. The discriminators are support posture,
web parity, billing model and offline.

---

## 2. React Native support in 2026

### Mapbox — `@rnmapbox/maps`

Current, MIT, 10.3.5 on 2026-07-22, and pins Mapbox Maps SDK v11 (`package.json` `mapbox` field:
iOS `~> 11.23.1`, Android `11.23.1`). Mapbox v10 was dropped as of `@rnmapbox/maps` 10.3.0 — the
Android `build.gradle` hard-errors on it.

The critical caveat is **support posture, not liveness**. Mapbox itself says:

> "Mapbox has officially transferred the development and oversight of the React Native Maps SDK to
> the open-source community." … "Because this is a community-maintained project, Mapbox is unable
> to provide formal support for it."
> — [docs.mapbox.com, Maps SDK for React Native](https://docs.mapbox.com/help/glossary/maps-sdk-for-react-native/)

The repo currently carries a pinned "Call for additional maintainers" discussion. So: you pay
Mapbox, and if the RN binding breaks on a new React Native version, your ticket goes to volunteers,
not to the vendor you are paying. That is the single largest risk in the Mapbox option.

Expo: ships `app.plugin.js` (config plugin) and declares `expo: ">=47.0.0"` as a peer. Not usable
in Expo Go — the docs state "This package is not available in the Expo Go app. Learn how you can
use it with custom dev clients." Requires React Native ≥ 0.79.

### MapLibre — `@maplibre/maplibre-react-native`

Lives under the MapLibre GitHub org, i.e. maintained by the same organisation that maintains the
native SDK it wraps — no vendor/binding split. 11.3.6 on 2026-06-25, MIT, with six releases in
June 2026 alone. Ships `app.plugin.js` and a `src/plugin/` directory, and declares peers
`expo: ">=54.0.0"`, `react-native: ">=0.80.0"`, `react: ">=19.1.0"`. Also a dev-client library,
not Expo Go.

Note the peer floor: this package is on a more aggressive RN/React baseline than rnmapbox
(RN ≥ 0.80 and React 19.1 vs RN ≥ 0.79). Fine for a greenfield project; worth knowing.

### Google — `react-native-maps` or `expo-maps`

`react-native-maps` 1.29.0 (2026-06-28) is current and MIT. Expo documents it and says "No
additional setup is required when testing your project using Expo Go"
([Expo docs](https://docs.expo.dev/versions/latest/sdk/map-view/)) — the only candidate that runs
in Expo Go at all. But it is Google on Android and **Apple Maps by default on iOS**, with Google on
iOS available via `provider={PROVIDER_GOOGLE}`. Default behaviour therefore gives you two visually
different maps on the two native platforms.

`expo-maps` is Expo's own library — "access to Google Maps on Android and Apple Maps on iOS", no
web, "not available in the Expo Go app", and explicitly **alpha**: "it will frequently experience
breaking changes" ([Expo docs](https://docs.expo.dev/versions/latest/sdk/maps/)). Not a candidate
for a system whose headline feature is the map.

---

## 3. Web parity — the decisive axis

This is where the options separate hardest, and where the obvious assumption is wrong in both
directions.

**rnmapbox does not give you the web console.** The package *does* contain a web implementation —
`src/web/{index.tsx,MapboxModule.ts}` and `src/web/components/{MapView,Camera,MarkerView}.tsx`,
with `mapbox-gl` as a peer dependency. But its own `src/web/install.md` says:

> "Web support is work in progress, only basic map components works."

Three components — `MapView`, `Camera`, `MarkerView` — and nothing else; no `ShapeSource`, no
layers, no annotations. The same file still instructs you to configure `@expo/webpack-config`, a
toolchain Expo has since moved off. Treat rnmapbox web as abandoned-in-place. **Do not plan the
dispatcher console on it.**

`@maplibre/maplibre-react-native` doesn't even pretend: no `web` path anywhere in the tarball.
`react-native-maps` ships `MapView.web.ts` whose entire content is a re-export of
`react-native-web`'s `UnimplementedView` — i.e. a deliberate no-op stub.

**So no candidate gives "one component tree across all three surfaces." That option does not
exist.** The dispatcher console is a separate web codebase in every scenario. The real question is
what you can share *besides* components, and the answer differs sharply:

- **Mapbox and MapLibre**: you share the **style JSON** (Mapbox Style Specification), the same
  layer/paint/layout vocabulary, the same GeoJSON source model, and the same mental model of
  "put a `FeatureCollection` in a source, style it with a layer". A style authored once renders
  identically in `mapbox-gl`/`maplibre-gl` on the console and in the native SDK in both apps. The
  duplicated code is thin view glue; the map *design* and the data plumbing are shared. You can put
  the style JSON, the marker/layer definitions and the position types in a shared TypeScript
  package in the monorepo.
- **Google**: nothing meaningful is shared. Maps JS on web (via `@vis.gl/react-google-maps`) and
  the Maps SDK on native are separate APIs with separate styling systems (native styling goes
  through cloud-hosted Map IDs — `<MapView provider="google" googleMapId="..." />`). Two
  independent implementations, plus a third if you don't force `PROVIDER_GOOGLE` on iOS.

For a system whose headline feature is one live map rendered three ways, this is the argument that
carries the most weight.

---

## 4. The moving marker

Verified by reading the shipped source, not the docs.

**On native, both fork siblings ship the same primitive**, inherited from a common ancestor:

- `@rnmapbox/maps` exports `AnimatedPoint` (`src/classes/AnimatedPoint.js`), a set of
  `Animated.createAnimatedComponent`-wrapped sources and layers (`src/utils/animated/Animated.ts`
  wraps `ShapeSource`, `SymbolLayer`, `CircleLayer`, `LineLayer`, …), and an `<Annotation>`
  component taking `animated`, `animationDuration` (default 1000ms) and `animationEasingFunction`
  (default `Easing.linear`). Set a new `coordinates` prop and it tweens.
- `@maplibre/maplibre-react-native` ships the identical shape: `src/utils/animated/AnimatedPoint.ts`,
  `Animated`, and `LayerAnnotation` with the same `animated` / `animationDuration = 1000` props.

Two caveats worth carrying into the location-cadence ticket (07):

1. These tweens are **React Native `Animated` driving a GeoJSON source**, i.e. JS-thread work with
   `useNativeDriver` unavailable — a coordinate is not a transform. At a low position cadence
   (every few seconds) this is fine. It is not a native-side interpolator.
2. `AnimatedPoint` interpolates latitude and longitude **independently and linearly**. Straight-line
   lerp between fixes, not path-following. `@rnmapbox/maps` also ships
   `AnimatedRouteCoordinatesArray` if you later want to slide a marker along a known polyline.

`react-native-maps` is actually the strongest here in raw primitives: `AnimatedRegion` with both
`timing()` and `spring()`, plus `MapMarker.animateMarkerToCoordinate(coordinate, duration = 500)`
which dispatches a **native** command (`Commands.animateMarkerToCoordinate` / Fabric
`animateToCoordinates`) rather than tweening in JS. If native-thread marker animation were the only
criterion, Google wins — but it wins only on native, and buys you nothing on the console.

**On web, no candidate has a marker animation primitive.** `mapbox-gl` 3.27.0's `Marker` class
(checked in `dist/mapbox-gl.d.ts`) exposes `setLngLat` and nothing resembling an animate/ease
method; `maplibre-gl` is the same by inheritance. You will write a `requestAnimationFrame` tween
that lerps between the last two fixes and calls `setLngLat` (or updates a GeoJSON source), on every
option. Budget for it once, in shared TypeScript, and reuse the same interpolation logic on native
if you'd rather not depend on `Animated` at all — which, given point 1 above, is a reasonable call.

---

## 5. Pricing at small scale

The billing *models* differ more than the numbers, and the ticket is right that map loads and tile
requests are not comparable units.

### Mapbox ([mapbox.com/pricing](https://www.mapbox.com/pricing))

| SKU | Free tier | First paid tier |
|---|---|---|
| GL JS map loads (web) | 50,000 / month | $5.00 / 1,000 (50k–100k) |
| Mobile Maps SDK | 25,000 MAU | $4.00 / 1,000 (25k–125k) |
| Vector Tiles API | 200,000 requests / month | $0.25 / 1,000 |
| Raster Tiles API | 750,000 requests / month | $0.25 / 1,000 |

Two different meters. Web is **map loads** — one per `new mapboxgl.Map()`, so a dispatcher who
leaves the console open all day and pans for eight hours is one load. Native is **monthly active
users**: a courier fleet of 30 drivers plus a few thousand repeat business customers is nowhere
near 25,000 MAU. Tile requests only meter when you hit the Tiles API directly rather than through
an SDK.

**At this project's scale, Mapbox is $0/month, with roughly two orders of magnitude of headroom.**
The cliff is real but distant, and its shape matters: the customer app is the only surface that
could plausibly scale into MAU billing, and at 25k MAU the marginal cost is $4 per 1,000 users.

### Google ([developers.google.com/maps/billing-and-pricing/pricing](https://developers.google.com/maps/billing-and-pricing/pricing))

| SKU | Free tier | First paid tier |
|---|---|---|
| Dynamic Maps (Maps JS, web) — SKU FAF4-3B2D-51B2 | 10,000 events / month | $7.00 / 1,000 |
| Maps SDK (mobile, Essentials) — SKU 6DE1-4D9C-5B67 | **Unlimited, no charge** | — |

The mobile SDK line is genuinely remarkable and I want to be precise about it: the pricing table
shows "Unlimited" in the free-usage-cap column for the mobile Maps SDK SKU with dashes across every
paid tier. **Google Maps on the two React Native apps is free at any volume.** Since March 2025 the
old $200 universal credit is gone, replaced by per-SKU caps: 10,000 events/month for Essentials,
5,000 for Pro, 1,000 for Enterprise.

Web is the expensive half: 10,000 map loads/month free, then $7.00/1,000 — the highest per-load
rate of any option, and a free tier five times smaller than Mapbox's. For a handful of dispatchers
that is still comfortably free; a public-facing tracking page (see ticket 13) would burn it much
faster than Mapbox's 50k.

### MapLibre + a tile source

The SDKs are free (BSD-3-Clause / MIT). You are buying tiles.

**MapTiler Cloud** ([pricing](https://www.maptiler.com/cloud/pricing/)): Free $0 (5k map
sessions/month, 100k API requests/month, 5 GB storage), Flex $30/month (25k sessions, 500k
requests, 10 GB), then Custom. A "map session" is "a webpage or mobile-app load which contains a
map initialization", and permits "unlimited user interaction with the map without impacting your
bill" — the same shape as a Mapbox map load. Third-party SDKs hitting the tile API instead meter
per request; MapTiler's own figure is ~4 requests per vector map view, 10–16 for raster.

The free plan is **not usable here**: MapTiler's own materials describe it as for testing,
personal or non-commercial use. So the realistic MapLibre-plus-MapTiler floor is **$30/month**,
versus $0 for either Mapbox or Google at this scale.

**Protomaps** ([protomaps.com](https://protomaps.com/), [docs](https://docs.protomaps.com/basemaps/downloads)):
self-host a single `.pmtiles` archive on object storage — no tile server. The full planet at z0–15
is ~120 GB and each further zoom level roughly doubles it, but the `pmtiles` CLI `extract` command
with `--maxzoom` cuts a regional archive, and a single-country courier operation needs a small
fraction of that. Cost becomes S3-class storage plus egress — realistically low single-digit
dollars a month. Protomaps also runs a hosted CDN API: free for non-commercial use, commercial use
requires becoming a GitHub Sponsor. Daily builds are published with a one-week retention plus the
latest per patch version, and Protomaps explicitly discourages hotlinking, recommending you copy
tilesets to your own cloud storage.

---

## 6. Offline and cached tiles

Couriers hit dead zones, so this matters more than it would elsewhere. The candidates rank in an
order that inverts the pricing ranking.

**Mapbox — best in class.** The mobile SDKs take a bounding box or region, a zoom range and a style
URL, and download style JSON, fonts, icons, TileJSON and tiles to the device
([docs.mapbox.com, offline](https://docs.mapbox.com/help/dive-deeper/mobile-offline/)). Crucially:
"Resources downloaded for offline use are included in the regular monthly active user (MAU)
billing" — no separate offline meter, so downloading a city for every driver does not create a
bill. One hard limit: "The cumulative amount of unique maps tile packs used in the offline regions
cannot be greater than 750." `@rnmapbox/maps` surfaces this through
`src/modules/offline/{offlineManager,TileStore,OfflineCreatePackOptions}.ts`.

**MapLibre — works, but with a trap.** `@maplibre/maplibre-react-native` ships
`src/modules/offline/{OfflineManager,OfflinePack}.ts` including `setTileCountLimit`, and the
offline-pack mechanism works against a normal tile endpoint. The trap: MapLibre Android has
supported PMTiles as a tile source since 11.7.0 (the RN package pins Android native 13.2.0, so it's
in), and "the `pmtiles://` prefix works with any tile source type", **but** "PMTiles sources do not
support offline pack downloads or caching"
([MapLibre Android PMTiles example](https://maplibre.org/maplibre-native/android/examples/data/PMTiles/)).
So the cheap Protomaps path and the offline path are mutually exclusive on native: to get offline
packs you need a conventional tile server (MapTiler, or self-hosted Martin/tileserver-gl), which
puts you back at ~$30/month or an ops burden.

**Google — no offline.** The Maps SDKs have no offline map API, and the Maps Platform policies
prohibit "content pre-fetching, caching, or storage" in general (place IDs being the documented
exception). For a courier app that must render a map in a basement car park, this is close to
disqualifying on its own.

---

## 7. Licensing and attribution

**Mapbox.** The native SDKs are proprietary. `mapbox-gl` on web is explicitly not open source —
its `LICENSE.txt` (read from the 3.27.0 tarball) states the software is "licensed under the Mapbox
TOS for use only with the relevant Mapbox product(s) listed at www.mapbox.com/pricing", terminating
automatically "if a developer no longer has a Mapbox account in good standing", and forbids
"modifications that change or interfere with marked portions of the code related to billing,
accounting, or data collection". The RN and web *bindings* are MIT; the thing they bind is not.
Read plainly, that licence text means you cannot point `mapbox-gl` v2+ at non-Mapbox tiles — which
is precisely why MapLibre exists. The Mapbox logo and attribution must remain visible; the ToS
forbids removing "proprietary notices or product identification labels".

**MapLibre.** `maplibre-gl` is BSD-3-Clause, the RN binding MIT, MapLibre Native open source. No
per-seat licence, no account, no kill switch. Attribution obligations come from the *data*, not the
software: OSM-derived tiles require "© OpenStreetMap"; Protomaps basemaps are ODbL "Produced Work
(OpenStreetMap attribution required)". MapTiler additionally requires "© MapTiler" with a link, and
on the free plan specifically the MapTiler *logo* rather than text; attribution "must always be
visible and readable on any screen or medium" and cannot be removed
([MapTiler terms](https://www.maptiler.com/terms/)). On small mobile screens attribution may be
collapsed behind a popup.

**Google.** The most restrictive. Google Maps content generally may not be pre-fetched, cached or
stored; if content is displayed outside a Google map, "a Google logo is required with proper
attribution"; the logo may not be modified, must be ≥16dp, may not be localised, and attribution
may never be "removed, hidden, obscured, or modified"
([Maps JS policies](https://developers.google.com/maps/documentation/javascript/policies)). The
practical bite for this project is the corollary at ticket 10 and the geocoding fog item: Google
geocodes are not freely portable onto a non-Google map, so mixing Google search with a Mapbox or
MapLibre canvas is not a safe design.

---

## 8. Recommendation

**Use Mapbox: `@rnmapbox/maps` on both React Native apps, `mapbox-gl` on the dispatcher console,
with one shared Mapbox-Style-Spec style JSON and shared marker/interpolation code in the
monorepo. Do not use rnmapbox's web build — the console is a separate `mapbox-gl` codebase that
consumes the same style.**

The reasoning is that the three surfaces are the whole problem, and only the Mapbox/MapLibre style
family lets one map *design* serve all three. Google collapses on exactly this axis: it would mean
two or three genuinely independent map implementations, no shared style artifact, no offline
capability at all in an application whose users are professionally guaranteed to lose signal, and
a caching prohibition that conflicts with what a courier app wants to do. Google's free unlimited
mobile SDK is a real and surprising advantage, and its native marker animation is the best of the
three — but it is winning the wrong argument. Against that, Mapbox costs $0 at this scale too, so
Google's headline advantage buys nothing today.

Within the Mapbox/MapLibre family, the choice is a trade of **operational cost against
independence**, and at this project's stage the trade favours Mapbox. Mapbox is free at courier
scale with two orders of magnitude of headroom, has the best offline story of any candidate
(region downloads billed inside MAU, not separately), and bundles geocoding, which the map's
"address entry and geocoding" fog item will otherwise need to source elsewhere. MapLibre's true
cost is not zero: MapTiler's free plan is non-commercial, so the honest floor is $30/month or an
ops commitment to self-hosting — and self-hosting via Protomaps, the cheapest path, forfeits
offline packs entirely on native. Trading $0 for $30/month *and* losing offline is the wrong trade
for a project that hasn't shipped.

The trade-offs to accept, stated plainly:

**You are paying a vendor whose React Native binding that vendor does not support.** Mapbox has
formally handed `@rnmapbox/maps` to the community and says so in its own documentation. The library
is healthy today — released five days ago, current on Mapbox SDK v11 — but the repo is actively
asking for maintainers. If React Native 0.83 or the next architecture shift breaks it, your
recourse is a volunteer queue. This is the risk of the recommendation and it should be recorded as
such, not glossed.

**You are accepting a proprietary web SDK with a licence that terminates with your account.** The
`mapbox-gl` licence is not a formality: it binds the library to Mapbox tiles and to an account in
good standing.

**But the exit is unusually cheap, and that is what makes the risk acceptable.** Because
`@maplibre/maplibre-react-native` is a fork of `@rnmapbox/maps` and `maplibre-gl` is a fork of
`mapbox-gl`, migration is a swap of import paths, a style-URL change and a tile-source decision —
not a rewrite. The shared style JSON, the GeoJSON source model, the layer definitions and the
marker interpolation code all survive intact. So the correct posture is: adopt Mapbox now, and
**write the map layer against the style spec and the common component vocabulary rather than
against Mapbox-only features**, keeping the escape hatch open at near-zero cost.

Three conditions should flip this decision, and are worth writing into the spec as tripwires:

1. **The customer app goes consumer-scale.** Past 25,000 MAU, Mapbox bills $4/1,000 and MapLibre's
   flat $30/month becomes obviously correct. Ticket 13's install-free tracking link is the most
   likely route to this — a public tracking page hit by one-off recipients is exactly the traffic
   shape that inflates MAU and web map loads.
2. **The rnmapbox binding actually stalls.** Concretely: no release compatible with a React Native
   version you need, for a quarter or more. The MapLibre binding is maintained by the same org as
   the native SDK it wraps, which is a structurally sounder arrangement.
3. **Vendor independence becomes a stated requirement.** If it does, go MapLibre + MapTiler (not
   Protomaps) so you keep offline packs, and accept the $30/month.

Regardless of provider, budget for writing the moving-marker interpolation yourself. No web SDK
here has a marker animation primitive, and the native `AnimatedPoint` tween is JS-thread linear
lerp between fixes. One shared `interpolatePosition` module consumed by all three surfaces is
better than three different smoothing behaviours, and it will need to agree with whatever ticket 07
settles on for cadence and staleness.

---

## 9. Not verified from a primary source

Flagged honestly, per the ticket's instruction:

- **MapTiler's free-plan commercial restriction.** MapTiler's general Terms
  ([maptiler.com/terms](https://www.maptiler.com/terms/)) limit free accounts to "the quota allowed
  under the free tiers" and forbid multi-account circumvention, but I could not find the
  non-commercial restriction stated in the Terms themselves — it appears in MapTiler's pricing and
  marketing copy. The $30/month Flex floor in section 5 rests on that secondary phrasing. **Confirm
  with MapTiler before relying on the free tier commercially.**
- **MapTiler's exact session-vs-request accounting for mobile SDKs.** The billing documentation
  page I tried (`docs.maptiler.com/cloud/api/billing/`) 404s. Whether MapLibre Native counts as
  "MapTiler's own SDK" (sessions) or a third-party SDK (per-request) is unresolved, and it changes
  the MapLibre cost estimate materially for the driver app, which holds a map open all day.
- **PMTiles support on MapLibre Native iOS.** Documented for Android from 11.7.0; the iOS
  documentation makes no mention of it, and `@maplibre/maplibre-react-native` pins iOS native
  6.26.0. Assume PMTiles is Android-only until verified. There is no `pmtiles` string anywhere in
  the RN package's source.
- **Protomaps commercial hosted-API pricing.** The site says commercial use of the hosted CDN API
  requires GitHub sponsorship but does not state an amount.
- **The Mapbox ToS clause prohibiting third-party tiles.** The prohibition is clear in
  `mapbox-gl`'s own `LICENSE.txt` ("for use only with the relevant Mapbox product(s)"), which is a
  primary source. I could not extract the corresponding clause from the ToS page itself, which
  returned only partial content.
- **Google Maps Platform ToS on caching and offline.** `cloud.google.com/maps-platform/terms` could
  not be retrieved. Section 7's caching and attribution statements come from the Maps JavaScript
  API policies page, which is primary but is policy rather than the contract.
- **Whether Google's mobile Maps SDK "unlimited" free tier has undocumented conditions.** The
  pricing table clearly shows "Unlimited" with no paid tiers for SKU 6DE1-4D9C-5B67, and the
  Android usage-and-billing page separately notes the SDK also generates Dynamic Maps and Dynamic
  Street View SKU calls. Exactly which mobile interactions fall outside the free Maps SDK SKU is
  not clearly documented. It does not affect the recommendation, since Google loses on other
  grounds.

## Sources

- [github.com/rnmapbox/maps](https://github.com/rnmapbox/maps) and the `@rnmapbox/maps@10.3.5` tarball (`src/web/install.md`, `src/classes/AnimatedPoint.js`, `src/utils/animated/Animated.ts`, `src/components/Annotation.tsx`, `src/modules/offline/`, `package.json`, `android/build.gradle`, `rnmapbox-maps.podspec`)
- [github.com/maplibre/maplibre-react-native](https://github.com/maplibre/maplibre-react-native) and the `@maplibre/maplibre-react-native@11.3.6` tarball (`src/utils/animated/`, `src/components/annotations/LayerAnnotation.tsx`, `src/modules/offline/OfflineManager.ts`, `android/gradle.properties`, `MapLibreReactNative.podspec`)
- The `react-native-maps@1.29.0` tarball (`src/AnimatedRegion.ts`, `src/MapMarker.tsx`, `src/MapView.web.ts`, `README.md`)
- The `mapbox-gl@3.27.0` tarball (`LICENSE.txt`, `dist/mapbox-gl.d.ts`)
- [docs.mapbox.com — Maps SDK for React Native](https://docs.mapbox.com/help/glossary/maps-sdk-for-react-native/)
- [docs.mapbox.com — Mobile offline](https://docs.mapbox.com/help/dive-deeper/mobile-offline/)
- [mapbox.com/pricing](https://www.mapbox.com/pricing)
- [Google Maps Platform core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Maps SDK for Android usage and billing](https://developers.google.com/maps/documentation/android-sdk/usage-and-billing)
- [Maps JavaScript API policies](https://developers.google.com/maps/documentation/javascript/policies)
- [Expo — react-native-maps](https://docs.expo.dev/versions/latest/sdk/map-view/) and [Expo — expo-maps](https://docs.expo.dev/versions/latest/sdk/maps/)
- [MapLibre Android PMTiles example](https://maplibre.org/maplibre-native/android/examples/data/PMTiles/)
- [MapTiler Cloud pricing](https://www.maptiler.com/cloud/pricing/) and [MapTiler terms](https://www.maptiler.com/terms/)
- [protomaps.com](https://protomaps.com/) and [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads)
- npm registry metadata for all packages listed in section 1, read 2026-07-27
