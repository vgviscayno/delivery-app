---
status: accepted
---

# Biome lints and formats, replacing ESLint and Prettier

One tool, Biome, lints and formats the repo. `pnpm check` runs both without changing anything, and CI runs the same checks with `pnpm check:ci` (`biome ci`). `pnpm fix` applies the safe fixes. ESLint and Prettier are gone.

**Biome, because it has cognitive complexity built in.** `noExcessiveCognitiveComplexity` is on as an error at 15. It uses SonarSource's measure, which counts nesting and broken-up control flow, rather than the cyclomatic count ESLint's `complexity` rule gives. The limit is meant to hold whichever linter enforces it, and Biome is the only candidate that ships it. When the rule was switched on, no function in the repo scored above 15.

**One tool, because linting and formatting both check the same thing: is this change finished?** Agents verify their work with one command, and it gives one answer. Two tools means two configs, two ignore lists and two ways to disagree.

**Biome is pinned to an exact version.** A minor release can change formatter output, and a caret range would then fail CI on a PR that didn't touch the affected files. Upgrading is a deliberate PR that runs `pnpm fix`.

## Considered options

- **Oxlint**, usually the faster linter. Rejected because it has no cognitive complexity rule of its own. The only way to get one is `eslint-plugin-sonarjs` loaded through oxlint's JS plugins, which were still alpha in September 2026. Speed doesn't matter much in a repo that Biome checks in about 30ms.
- **Oxlint with oxfmt**, which would give one vendor for both jobs. Rejected for the same complexity gap, and because oxfmt was still in beta.
- **Biome for linting, with Prettier kept for formatting.** Rejected: that keeps two tools for one question.

## Consequences

- **Markdown and YAML are no longer auto-formatted.** Biome doesn't format them yet. Of the files Prettier used to format, only `README.md`, the CI workflow and action YAML files, `pnpm-workspace.yaml` and `apps/console/index.html` are affected. They're edited by hand from now on, like `docs/` and `CONTEXT.md` already were. The ignore list in `biome.jsonc` still excludes the prose files, so that stays true once Biome learns Markdown.
- **Suppressions carry their reason.** Biome makes you give a reason in every `biome-ignore` comment. The only suppression so far is in `scripts/resolve-preview-branch.mjs`: CI runs that script directly rather than through turbo, so turbo's rule for undeclared environment variables doesn't apply.
- **There is no turbo `lint` task.** Biome checks the whole repo in one pass from the root, so caching per package wouldn't save any time. That one pass also covers files ESLint never linted: `vite.config.ts`, the JSON files and the console's CSS.
- **Warnings don't fail CI, so every rule that should fail CI is set to error.** `biome ci` fails only on errors. Biome's unused-variable, unused-parameter and unused-import rules default to warn, so they are raised to error to match what ESLint enforced. Biome still ignores names that start with `_`, the same pattern ESLint was configured for, but the pattern can't be changed.
- **Undeclared globals are checked only in `*.mjs`.** ESLint's `no-undef` covered the plain-ESM Node scripts with Node's globals. Biome's `noUndeclaredVariables` isn't in the recommended set, so it's switched on for `*.mjs` alone. It already knows Node's globals. TypeScript catches undeclared names everywhere else.
