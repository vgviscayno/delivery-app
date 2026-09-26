# Courier Ops

Own-fleet courier delivery system for a Philippine meat shop: a web dispatcher
console, a driver app and a customer app over one Supabase backend.

`CONTEXT.md` is the glossary — the words in this repo mean what it says they mean.
`docs/adr/` holds the decisions of record. The MVP spec is issue #54.

## Layout

```
apps/console/        dispatcher console — React + Vite (deployed to Cloudflare Pages)
packages/config/     backend environment and the constants every surface shares
packages/domain/     hand-written domain types over the generated Supabase schema
packages/api-client/ the typed Supabase client and the named server surface
packages/db/         database tooling: migrations, gates, pgTAP, seed, type generation
supabase/            the Supabase project: migrations, pgTAP tests, seed.sql
scripts/             CI helpers
```

The mobile side (one Gradle project with `:core`, `:driver` and `:customer`) arrives
with ticket #56, along with the shared fixtures directory.

## Getting started

Needs Node 22+, pnpm, and Docker running.

```sh
pnpm install
pnpm db:start          # local Supabase, migrations, seed
cp .env.example .env.local   # paste the API URL and anon key the CLI printed
pnpm --filter @courier/console dev
```

The console shows the shop clock, read from the server through `public.server_clock()`.

## The commands that matter

| Command               | What it does                                                  |
| --------------------- | ------------------------------------------------------------- |
| `pnpm build`          | Builds every package and the console                          |
| `pnpm typecheck`      | Typechecks sources and test files                             |
| `pnpm lint`           | ESLint across the workspace                                   |
| `pnpm test`           | Vitest. Never needs Docker                                    |
| `pnpm test:db`        | pgTAP against local Supabase, after an unseeded reset         |
| `pnpm db:lint:rls`    | Fails if any table in an exposed schema has row security off  |
| `pnpm db:lint:matrix` | Fails if the role × resource matrix misses a reachable object |
| `pnpm db:types`       | Regenerates `packages/domain/src/generated/database.types.ts` |
| `pnpm db:seed`        | Runs `supabase/seed.sql` against `SUPABASE_DB_URL`            |

## Time

There is one server clock, `app.now()`, and one time zone, `Asia/Manila`. No
migration, RPC, view or trigger may call `now()`, `current_timestamp` or
`clock_timestamp()` directly — every time rule reads the clock, so every time rule can
be tested at its exact boundary by pinning it with `app.pin_clock()`.

Clients never work out a Manila date for themselves. They call
`public.server_clock()` and display what it says.

## The two gates

Both live in the database (see the security harness migration), so CI and pgTAP can
never drift apart.

**The RLS lint.** Any table in a PostgREST-exposed schema with row security off is
readable by anyone holding the anon key. `app.tables_without_rls()` finds them, and
CI fails on any row.

**The role × resource matrix.** `app.access_matrix` records, for every table, view and
RPC a client can reach, whether each of the four actors — `anon`, customer, driver,
dispatcher — may touch it, and why. `app.access_matrix_gaps()` is the completeness
check: it fails on an object nobody has ruled on, on a row left behind after an object
goes away, and on an `anon` row that contradicts the actual grants. Later tickets add
rows in a migration; they never edit the harness.

## Environments and the release path

Three backends, no staging (ADR 0009): local, one Supabase preview branch per PR, and
production. Migrations reach production only through CI:

1. **RLS lint and completeness check**, on a local Supabase started in CI;
2. **Rehearsal** of the same migrations on that PR's preview branch;
3. **A manual trigger** — the `Migrate production` workflow, from `main`, with the
   project ref typed out by hand.

Merging a PR does not migrate anything.

The console deploys to Cloudflare Pages on every push. A PR's build is pointed at that
PR's Supabase preview branch; `main` is pointed at production.

### Repository secrets CI needs

| Secret                                          | Used by                                  |
| ----------------------------------------------- | ---------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`                         | preview rehearsal, production migration  |
| `SUPABASE_PROJECT_ID`                           | the production project ref               |
| `SUPABASE_DB_PASSWORD`                          | production migration                     |
| `SUPABASE_PREVIEW_DB_PASSWORD`                  | preview rehearsal, if branches share one |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`             | production console build                 |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Pages deploy                             |

Plus the `CLOUDFLARE_PAGES_PROJECT` repository variable, and the Supabase GitHub
integration installed so each PR gets a preview branch.

## Testing

A good test checks behaviour through the highest seam available and never checks
internals.

- **The server contract** — pgTAP, `pnpm test:db`. Most tests live here. Tests build
  their own data and roll back.
- **Package logic** — Vitest, `pnpm test`. No Docker, ever: the database work is its
  own workspace with its own task.

`supabase/seed.sql` is demo data for local and preview work. It is **never a test
input** — `pnpm test:db` resets with `--no-seed` first, so nothing in the seed can
quietly become the reason a test passes.
