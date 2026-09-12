# Location history storage and retention

Type: grilling
Status: resolved
Assignee: agent-session
Blocked by: 01, 05
Map: ../map.md

## Question

What location data is persisted, in what shape, and for how long?

A live map only needs the latest point. Everything beyond that is a deliberate choice with storage, privacy, and legal weight.

Settle:

- Whether the full breadcrumb trail is stored or only the current position. Storing every fix from every driver accumulates fast, and the volume follows directly from the cadence set in ticket 07.
- If trails are stored, what they are for — dispute resolution, driver performance, delivery proof, debugging. Each purpose implies a different retention period, and "we might want it later" is not a purpose.
- Storage shape: a dedicated geospatial type (PostGIS `geography`), plain lat/lng columns, or a time-series structure. What queries must be fast, given route optimisation and ETA are out of scope.
- Whether current position lives somewhere different from historical trail — a hot store for the live value, cold storage for the archive.
- **Retention and privacy.** Continuous employee location tracking is regulated in many jurisdictions, and under GDPR it is personal data with a defined purpose limitation. Decide the retention window, the deletion mechanism, and whether drivers are tracked outside working hours — that last one is a policy decision with real legal exposure, not a technical detail.
- What a customer can see historically once their delivery is complete, and for how long.
- Data subject requests: what happens when a driver or customer asks for their data or its deletion.

Blocked on ticket 01 for how a trail attaches to the domain entities, and on ticket 05 for what storage is actually available.

## Answer

**No server-side location history is persisted, at any layer, for MVP.** Only the current position exists, and only ephemerally in flight — unchanged from ticket 06's Broadcast-only design, where nothing is written to a "latest position" row either. There is no breadcrumb trail, no PostGIS `geography` history table, no hot/cold split, and consequently no retention window, deletion mechanism, or data-subject-request flow to design, since nothing is stored to retain, delete, or export. Tracking remains scoped to an active Delivery only (ticket 07); with no persistence, there is by construction no off-shift or off-Delivery location record either.

**Accepted trade-off:** a customer disputing "the driver never came near me," or a driver claiming "I was there, the app just didn't update," leaves nothing to check after the fact — only ticket 11's proof-of-delivery captures a durable record, and only for the terminal state. Explicitly accepted for MVP on the grounds that this is easy to add later (a `location_history` table with a chosen retention policy) and hard to justify now absent a concrete dispute-resolution or driver-performance requirement — "we might want it later" was rejected as a reason to start collecting regulated personal data today.

**Side note, not part of this ticket's scope:** clarifying this surfaced a distinct question — whether the customer live-tracking screen (ticket 14) should render a connector line between the driver's current position and the delivery's dropoff point. That is not history (both endpoints are already live data, per ticket 06/07), so it doesn't reopen ticket 07's "no trail" call. It's a small candidate addition to ticket 14's map contents, noted there rather than resolved here.
