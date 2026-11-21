# Coding standards

Judgement calls for review. Mechanical rules live in tooling (`pnpm check` for Biome, `pnpm knip` for unused files, exports and dependencies, `pnpm db:lint` for the database gates), so they are not repeated here.

## Database

- **A migration that changes who can see something re-reads every `app.access_matrix` note that describes it.** That includes notes on neighbouring objects: a view that now shows unavailable Products makes a note on `dispatcher_category_products` saying only the dispatcher sees them false. `pnpm db:lint` checks that each row exists, not that its note is still true, so this is on the reviewer.

## Mobile apps

- **Work tied to signing out runs only on a real sign-out:** the user's own, the server's (`onSignedOut`), or a resume that finds no stored session. A resume that throws (offline, a server hiccup) lands on the same signed-out screen but is not a sign-out, so it leaves the cart, push token and the rest alone. The customer app's `Session` in `apps/customer/src/App.tsx` is the example.
