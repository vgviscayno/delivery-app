# ETA display decision

Type: grilling
Status: resolved
Blocked by: —
Map: ../map.md

## Question

Ticket 24 established that a genuinely zero-cost ETA path exists (a straight-line-distance heuristic, free by construction; Mapbox Directions' free tier as a more-accurate but not-free-by-construction alternative). It deliberately stopped short of deciding anything about display.

This ticket decides, with the client:

- Does the client actually want an ETA shown now, given the zero-cost heuristic's accuracy ceiling (no live traffic, no stop-density awareness unless added, corrected only by a generic circuity factor)? Or was "if free" a soft ask that a rough estimate doesn't actually satisfy?
- If yes: does this reopen ticket 14's "no ETA, ever" customer live-tracking layout — and if so, how does an ETA fit into the split map/status panel (replacing the hero straight-line distance? alongside it?) — and does it remove the map's Out-of-scope ETA-prediction line, or narrow it (e.g. "no *routing-engine* ETA prediction" survives, only the heuristic is in scope)?
- Which of the two zero-cost approaches ships first: the heuristic (available immediately, weaker accuracy) or Mapbox Directions (available immediately too, since ticket 02 already committed to Mapbox, but carries the call-pattern risk ticket 24 flagged — must be per-route-change, never per-position-ping)? Or heuristic now with Directions as a later upgrade?
- If an ETA is shown, does the "arriving in about X" framing need explicit caveating to manage customer expectations, given ticket 24's finding that under-promising is safer than over-promising?

**Note from [ticket 23](23-order-acceptance-location-radius.md):** a Mapbox Directions call now exists in the request path regardless of this ticket's outcome — the order-acceptance radius check uses road distance via Directions at address-entry and Order-submission time. This doesn't decide the ETA question, but it does mean "Directions is already a live dependency" is no longer a point in favor of picking it over the heuristic — it was going to be called anyway.

## Answer

**No ETA is shown to customers in the MVP. "If free" was a soft ask, and the only free-by-construction option — ticket 24's heuristic — is too rough to satisfy it. The feature is paused, not killed: an *accurate* ETA is a live post-MVP candidate.**

Resolving the four sub-questions:

1. **Does the client want an ETA now?** No. The client weighed the heuristic's accuracy ceiling (no live traffic, no multi-stop awareness — a shown time that ignores the driver's earlier stops) against the fact that a *time* reads as a promise where ticket 14's hero straight-line *distance* reads as "roughly close." A rough, wrong time generates support calls and erodes trust — worse than the honest distance already shown. "Show an ETA if free" turned out to mean "if free *and* it causes no problems," and a free-by-construction estimate doesn't clear that bar.

2. **Does this reopen ticket 14's "no ETA, ever" layout?** No. [Ticket 14](14-customer-live-tracking-screen.md) stands **unchanged** — split map/status panel, hero straight-line distance, compact stepper, no time. The split-panel layout question, the "replace vs. alongside the distance" question, and the caveating/framing question are all moot because nothing is shown. Ticket 14's parked connector-line idea (its Comments) is untouched — this ticket did not reopen 14 for any reason.

3. **Which zero-cost approach ships first (heuristic vs. Directions vs. heuristic-now-Directions-later)?** Moot. Neither ships in the MVP; there is no ETA engine in v1. Note for the record: ticket 25's own header note (via ticket 23) already established that a Mapbox Directions call lives in the request path regardless, for the order-acceptance radius check — so "Directions is already a dependency" was never a tie-breaker for ETA, and isn't now.

4. **Does the framing need caveating?** Moot — no ETA is displayed, so there is no "arriving in about X" string to caveat.

**Scope boundary (the reason this ticket existed):** the ETA-display question is now settled, so the map's Out-of-scope ETA line loses its "stands only until settled" hedge. ETA prediction stays **out of scope for v1** — but the line now records *why* (the free heuristic was rejected on quality, not the feature on principle) and marks an **accurate ETA (Mapbox Directions, plausibly multi-stop-aware) as a live post-MVP candidate**, so the v2 conversation starts from ticket 24's findings rather than cold. The routing-engine reasoning the original line carried is already partly mooted: ticket 23 independently committed to Directions for road-distance radius checks. No new tickets; no fog graduates.