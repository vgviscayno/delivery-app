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

| Command                | What it does                                                   |
| ---------------------- | -------------------------------------------------------------- |
| `pnpm build`           | Builds every package and the console                           |
| `pnpm typecheck`       | Typechecks sources and test files                              |
| `pnpm check`           | Biome lint and format check. Changes nothing                   |
| `pnpm fix`             | Applies Biome's safe fixes and formatting                      |
| `pnpm test`            | Vitest. Never needs Docker                                     |
| `pnpm test:db`         | pgTAP against local Supabase, after an unseeded reset          |
| `pnpm db:lint`         | All three gates: schemas first, since it decides what they see |
| `pnpm db:lint:rls`     | Fails if any table in an exposed schema has row security off   |
| `pnpm db:lint:matrix`  | Fails if the role × resource matrix misses a reachable object  |
| `pnpm db:lint:schemas` | Fails if `config.toml` and `app.exposed_schemas()` disagree    |
| `pnpm db:types`        | Regenerates `packages/domain/src/generated/database.types.ts`  |
| `pnpm db:seed`         | Runs `supabase/seed.sql` against `SUPABASE_DB_URL`             |

## The Shop clock

There is one clock, `app.now()`, and one time zone, `Asia/Manila` — the Shop clock in
`CONTEXT.md`. No
migration, RPC, view or trigger may call `now()`, `current_timestamp` or
`clock_timestamp()` directly — every time rule reads the clock, so every time rule can
be tested at its exact boundary by pinning it with `app.pin_clock()`.

Clients never work out a Manila date for themselves. They call
`public.server_clock()` and display what it says.

## The three gates

The first two live in the database (see the security harness migration), so CI and pgTAP
can never drift apart. `pnpm db:lint` runs all three.

**The RLS lint.** Any table in a PostgREST-exposed schema with row security off is
readable by anyone holding the anon key. `app.tables_without_rls()` finds them, and
CI fails on any row.

**The role × resource matrix.** `app.access_matrix` records, for every table, view and
RPC a client can reach, whether each of the four actors — `anon`, customer, driver,
dispatcher — may touch it, and why. `app.access_matrix_gaps()` is the completeness
check: it fails on an object nobody has ruled on, on a row left behind after an object
goes away, and on an `anon` row that contradicts the actual grants. Later tickets add
rows in a migration; they never edit the harness.

**Exposed schemas agree.** `app.exposed_schemas()` decides what the other two gates look
at, so a schema PostgREST serves but the harness does not know about leaves everything
inside it unguarded while both gates still pass. This one compares `api.schemas` in
`config.toml` against the harness and fails on a disagreement either way — the one
thing the database cannot check on its own.

## Environments and the release path

Two backends while on Supabase Free (ADR 0012): local and production. Free has no
branching, so ADR 0009's preview branch per PR waits for the move to Pro (#92).
Migrations reach production only through CI:

1. **The three gates and pgTAP**, in CI's `database` job on a local Supabase. This is
   the rehearsal;
2. **A dry run** — the `Migrate production` workflow, from `main`, with `push` off and
   the project ref typed out by hand. It lists the migrations production is missing in
   the job summary and applies none of them;
3. **The push** — the same workflow again with `push` on. It refuses unless a dry run
   succeeded on the same commit, then dry-runs again and pushes.

Each step checks the one before rather than trusting it. `scripts/check-rehearsed.mjs`
refuses a commit whose `database` job did not pass, and `scripts/check-dry-run.mjs`
refuses a push with no dry run behind it on that commit.

Merging a PR does not migrate anything.

The console deploys to Cloudflare Pages from `main` only, pointed at production. There
are no PR previews: with no preview branch to point one at, a preview would need
production, and a preview that can write to the shop's real data is worse than no
preview.

### Secrets CI needs

Secrets live on the `production` GitHub environment, not the repository, so production
credentials only reach jobs that run in `production`.

| Secret                                          | Used by                                   |
| ----------------------------------------------- | ----------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`                         | production migration                      |
| `SUPABASE_PROJECT_ID`                           | production migration, typed confirmation  |
| `SUPABASE_DB_PASSWORD`                          | production migration                      |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`             | console build (the publishable key)       |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Pages deploy                              |

Plus the `CLOUDFLARE_PAGES_PROJECT` variable on the same environment.

`bash scripts/setup-supabase.sh` walks through creating the Supabase project and sets
every Supabase secret above.

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
