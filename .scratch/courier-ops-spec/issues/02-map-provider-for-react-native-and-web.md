# Map provider for React Native and web

Type: research
Status: resolved
Blocked by: —
Map: ../map.md
Asset: ../research/map-provider.md

## Question

Which map provider can serve both React Native apps and the web dispatcher console, and what does each realistically cost and constrain?

The system renders maps on three surfaces — two native (driver, customer) and one web (dispatcher) — so a provider that is excellent on one and weak on another forces either two implementations or a compromise. ETA and turn-by-turn routing are out of scope, so this is about **tile rendering, markers, and a moving vehicle position**, not directions.

Compare at least Mapbox, Google Maps, and MapLibre (with a tile source such as Protomaps, MapTiler, or self-hosted):

- React Native support in 2026: which SDK is the current maintained one, whether it works under Expo managed workflow or forces a bare/dev-client build, and how alive the bindings actually are.
- Web parity: can the same styling and marker model be reused on the dispatcher console, or is it a separate API surface.
- Rendering a smoothly moving marker — does the SDK offer marker animation/interpolation primitives, or must the client tween positions itself.
- Pricing at small scale: free tier limits, what counts as a billable load or session, and where the cliff is. Distinguish map loads from tile requests — the billing models differ sharply.
- Offline or cached tiles, since couriers hit dead zones.
- Licensing and attribution obligations.

Deliver a recommendation with the trade-offs stated, not just a table. Write findings to `.scratch/courier-ops-spec/research/map-provider.md`.

## Answer

Full findings: [`research/map-provider.md`](../research/map-provider.md).

**Recommendation: Mapbox** — `@rnmapbox/maps` on both React Native apps, `mapbox-gl` on the dispatcher console, sharing one Mapbox-Style-Spec style JSON plus a marker/interpolation module in the monorepo.

### The premise that died

**No candidate gives one component tree across all three surfaces.** Verified from source, not marketing: rnmapbox's web build ships only `MapView` / `Camera` / `MarkerView`, and its own `src/web/install.md` still says web support is a work in progress; `maplibre-react-native` has no web path; `react-native-maps`' `MapView.web.ts` re-exports `UnimplementedView`. **The dispatcher console is a separate web map codebase whatever we pick.**

What Mapbox and MapLibre *do* share is the **style spec** — one style JSON and one layer/source vocabulary across all three surfaces. Google shares nothing (Maps JS on web vs cloud Map IDs on native), which means two to three independent implementations.

### Why not Google, despite two real advantages

Its mobile SDK is genuinely free at unlimited volume, and `animateMarkerToCoordinate` is the only *native-thread* marker animation of the three. But it has no offline API at all, policies prohibiting tile caching, Apple Maps as the iOS default, and web pricing that starts charging at 10k loads against Mapbox's 50k. Since Mapbox also costs **$0** at this scale, Google's free mobile tier buys nothing we need.

### Mapbox vs MapLibre: operational cost against independence

Mapbox is $0 here (50k web loads + 25k mobile MAU, roughly two orders of magnitude of headroom), has the strongest offline story (region downloads billed *inside* MAU, 750 tile-pack cap), and bundles the geocoding that address entry will need. MapLibre's honest floor is ~$30/mo — MapTiler's free plan is non-commercial — and the cheap Protomaps path **forfeits offline entirely**: PMTiles works on MapLibre Android 11.7.0+ but explicitly does not support offline pack downloads or caching.

### The accepted risk

Mapbox formally disclaims its own React Native binding and the repo is soliciting maintainers. Accepted because MapLibre is a *fork sibling* of both libraries — exit is an import swap plus a tile-source decision, not a rewrite. The mitigation is a spec-level rule: **write against the style spec, not Mapbox-only features**, to keep that hatch cheap.

### Moving marker (feeds ticket 07)

Both native bindings ship `AnimatedPoint` and an animated `Annotation`, but it is **JS-thread linear interpolation on lat and lng independently** — no `useNativeDriver` for coordinates. No web SDK has any marker animation primitive at all; `mapbox-gl` 3.27's `Marker` offers only `setLngLat`. Budget **one shared `interpolatePosition` module** used by all three surfaces, and it must agree with whatever ticket 07 settles for cadence and staleness.

### Tripwires that would flip this decision

- The customer app passing 25k MAU — ticket 13's install-free tracking link is the likely mitigation, since a web page is billed against the far larger web-loads allowance.
- rnmapbox stalling for a quarter or more.
- Vendor independence becoming a hard requirement → MapLibre with **MapTiler, not Protomaps**, to retain offline.

### Not primary-sourced (carry as uncertainty)

MapTiler's free-plan commercial restriction appears in marketing copy but not the Terms; MapTiler's session-vs-request accounting for mobile SDKs (billing docs 404); PMTiles on MapLibre iOS (documented for Android only); Protomaps commercial sponsorship amount; Google's Maps Platform ToS page was unreachable, so the caching prohibition is sourced from the JS policies page instead.
