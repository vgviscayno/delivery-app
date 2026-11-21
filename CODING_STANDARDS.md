# Coding standards

Judgement calls for review. Mechanical rules live in tooling (`pnpm check` for Biome, `pnpm knip` for unused files, exports and dependencies, `pnpm db:lint` for the database gates), so they are not repeated here.

## Database

- **A migration that changes who can see something re-reads every `app.access_matrix` note that describes it.** That includes notes on neighbouring objects: a view that now shows unavailable Products makes a note on `dispatcher_category_products` saying only the dispatcher sees them false. `pnpm db:lint` checks that each row exists, not that its note is still true, so this is on the reviewer.
