# delivery-app

Verify changes with `pnpm verify`, the same steps as CI's TypeScript job: Biome, the comment ratchet, Knip, build, typecheck, test. Code carries no comments (ADR 0014): `/delete-comments` shrinks `comments-baseline.json`, and `pnpm comments:update` locks a deletion in. `pnpm fix` applies Biome's safe fixes. Database changes also need `pnpm test:db` and `pnpm db:lint`. One pgTAP file alone: `pnpm --filter @courier/db test:db supabase/tests/<name>_test.sql`.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, used verbatim as label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
