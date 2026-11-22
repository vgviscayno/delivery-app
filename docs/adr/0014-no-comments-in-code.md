---
status: accepted
---

# No comments in code

Source files carry no comments. `scripts/check-comments.mjs` enforces it in `pnpm verify` and in CI's `comments` job, for `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.sql` and `.sh` files. What a comment used to say goes somewhere that is checked or read on purpose:

- **What the code does** goes in a name, a type or a test. If the code needs a comment to be understood, the code is the thing to change.
- **Why it was built this way**, when that is not obvious and would be expensive to rediscover, goes in an ADR in `docs/adr/`.
- **A known shortcut** ("until then", "for now", a placeholder) goes in a GitHub issue, so the debt is visible and someone can pick it up.
- **A domain term** goes in `GLOSSARY.md`.

**Why: comments in this repo are mostly written by agents, and agents read them back as truth.** A comment that explains a workaround makes the workaround look settled, and the next change copies it. A comment that has gone stale gets repeated as fact. An ADR has a date and a status and can be superseded. An issue can be closed. A comment can only go quietly wrong.

**The rule is a ratchet, not a big-bang deletion.** `comments-baseline.json` holds the number of comment lines each file is allowed. `pnpm comments` fails if any file has more than its allowance, so no comment is ever added, and also fails if a file has fewer, so a deletion is locked in with `pnpm comments:update` in the same PR. A file that is not in the baseline is allowed none. The baseline only ever shrinks: `pnpm comments:update` refuses to raise any file's allowance, and CI runs `pnpm comments --against` the base commit, which fails a PR whose baseline allows more than the base's did. `/delete-comments` is the skill that shrinks it, using the script's `--list` and `--strip` modes.

**Every comment counts, wherever it sits.** TypeScript and JavaScript are read with the TypeScript parser. SQL and shell are read with a small scanner that steps over quoted strings (and shell heredocs), so a trailing `-- note`, a `/* block */` and an `echo hi # note` all count, and a comment inside a `$$` function body counts too. Untracked files that git doesn't ignore count as well, so `pnpm verify` catches a new file before it is committed. Scratch work belongs in the gitignored `.scratch/`.

**Tool directives are not comments.** They tell a tool what to do, and these, and only these, are allowed:

- `// biome-ignore…` and `/* biome-ignore… */`, including the JSX form `{/* biome-ignore… */}`. Each carries its reason, per ADR 0011.
- `// @ts-expect-error`.
- `// @vitest-environment`.
- A shebang (`#!`) and `# shellcheck` directives.

`@ts-ignore` and `@ts-nocheck` are not on the list, so they count as comments. `@ts-expect-error` does the same job and fails once the error it hides is gone.

## Considered options

- **A Biome rule.** Biome has no rule that bans comments, and its GritQL plugins match syntax nodes, not the trivia comments live in. A Biome rule would also not cover SQL or shell.
- **Deleting every comment in one PR.** Rejected. Every comment has to be read and sorted into the code, an ADR or an issue, and the migrations and pgTAP tests alone hold over 500 comment lines. The ratchet lets that happen a slice at a time, with no new comments arriving meanwhile.
- **Allowing doc comments (`/** */`) on exports.** Rejected. Hover text is the easiest place for a stale claim to hide, and on this codebase's exports it mostly repeated the name and the type.

## Consequences

- **Migrations are in scope.** Supabase tracks migrations by version, so deleting a comment from an applied migration is safe for `db push`. But an applied migration is a record of what production ran, so its comments are taken out deliberately, in a PR of their own, after their content has moved to an ADR. New migrations start with none.
- **Configuration is out of scope.** `config.toml`, workflow YAML, `.env.example`, `biome.jsonc` and `knip.jsonc` are not checked. Their comments document settings for a human editing the file, and there is often no other place to put that.
- **Vendored skills (`.agents/`, `.claude/`), `docs/` and generated types are out of scope**, like they are for Biome.
