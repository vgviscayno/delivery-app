# Monorepo layout and code sharing

Type: grilling
Status: resolved
Assignee: agent-session
Blocked by: 05
Map: ../map.md

## Question

How are the three apps organised in this repo, and what do they share?

TypeScript everywhere is fixed, so shared types are on the table — but "share everything" and "share nothing" are both real answers with different failure modes.

Settle:

- One repo or several. If one, which tool manages it — npm/pnpm workspaces, Turborepo, Nx — and why that one.
- What is genuinely shared: domain types and state-machine definitions, API client, validation schemas, business logic, UI components.
- Whether the two React Native apps share UI code. They serve entirely different users with different needs, so shared components may be a premature abstraction that couples two apps that should diverge — or the obvious win. Decide on evidence, not instinct.
- Whether the dispatcher web app can share anything visual with the RN apps at all, or whether React Native Web is worth considering here.
- How types stay in sync with the backend: generated from a schema, inferred end-to-end (tRPC-style), or hand-written and hoped for.
- Build and release implications: two native apps and one web app in one repo means the release cadences differ, and a shared package bump touches all three.

**Two shared modules are already established by ticket 02**, so this ticket inherits them rather than deciding whether they exist: a **Mapbox style JSON** used by all three surfaces, and a **`interpolatePosition` module** (no map SDK animates markers usefully, so all three surfaces tween positions themselves). Both are cross-platform pure logic and assets — the easiest possible sharing case, and a useful anchor for how the shared-package boundary is drawn.

**Constraint from ticket 03 — not up for debate:** the driver and customer apps must ship as **separate binaries**. Play's background-location policy treats delivery tracking "for users (not drivers)" as a foreground-only use case, so the customer app must not request background location. Merging the two behind a role switch is therefore off the table; this ticket decides how much *code* they share, not whether they are one app.

Blocked on ticket 05 because the platform decides the type-sharing mechanism — a BaaS with generated types is a different world from a custom server with end-to-end inference.

## Reassessed by ticket 20

"No store submission *yet*" is now firmer for the driver app: it is **permanently internal**, distributed to company-owned MDM Android devices, never store-published. The **MVP is Android-only** for both mobile apps (iOS deferred, decisions retained). The MVP-demo Expo-dev-build approach below stands and extends into the pilot; the driver app's eventual release path is EAS Build → internal MDM distribution (mechanism in research ticket 18), not EAS Submit to a store. Customer app still releases to Play. New forward-compatibility constraint: a customer-app pilot uses Play's **closed-testing track** (same package/signing as production), not a self-signed sideload.

## Resolution

**One repo, pnpm workspaces + Turborepo.** Strict dependency isolation for RN vs web bundler needs, cheap task caching/orchestration, lighter than Nx for a 3-app MVP.

**Shared packages:**
- `packages/domain` — Delivery/Order types and the courier-status/prep-status state machines (ticket 01), framework-agnostic; layers hand-written domain types and transition logic on top of Supabase's generated raw table types.
- `packages/api-client` — typed Supabase client wrapper (queries, Realtime channel subscriptions).
- `packages/map-shared` — the Mapbox style JSON and `interpolatePosition` module already established by ticket 02.
- `packages/config` — shared TS/ESLint config.

**No shared RN UI component library.** Driver app (ticket 16) and customer app (ticket 14) are different visual languages and interaction patterns from day one — the driver app is a functional on-shift tool, the customer app is a consumer tracking/ordering experience. Sharing would couple two apps that should diverge; revisit only if concrete duplication (e.g. a map-marker component) shows up, and route it through `packages/map-shared` rather than a UI kit.

**Dispatcher web app shares nothing visual with the RN apps, and does not use React Native Web.** It's a standalone React + Vite app — a desktop-first, dense "stares at it all day" console (ticket 15), fundamentally different from touch-first mobile screens, with no mobile UI worth reusing via RNW. It shares only the non-visual `packages/map-shared`, `packages/domain`, `packages/api-client`.

**Types stay in sync via Supabase's generated types** (`supabase gen types typescript`), regenerated on schema migration and consumed as the raw foundation under `packages/domain`'s hand-written domain layer. No tRPC-style inference (no custom server, per ticket 05); no hand-written-and-hoped schemas.

**Build/release, scoped to MVP-demo reality — no real pipeline built yet:**
- Turborepo scopes builds per app (`--filter`) so a shared-package change doesn't force rebuilding all three.
- Driver and customer apps release independently via EAS Build when the time comes; for the MVP demo itself, no store submission — both run as **Expo dev builds** side-loaded onto demo devices (already implied by ticket 03's background-geolocation requirement).
- Dispatcher web deploys continuously (Vercel/Netlify-style) or just runs locally for the demo.
