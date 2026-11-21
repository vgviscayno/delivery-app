---
name: delete-comments
description: "Sort a slice of the codebase's comments into ADRs, issues or deletions, and tighten the comment ratchet."
disable-model-invocation: true
---

The user wants comments taken out of a slice of the codebase: the paths they name, or by default the largest files left in `comments-baseline.json`. ADR 0014 is the rule. Read it first.

## Steps

1. **List the slice.** `node scripts/check-comments.mjs --list <files>` prints every comment, with its line, from the same parser the ratchet counts with. Read each comment next to the code it sits on, not on its own. Done when every comment in the slice has been read in place.

2. **Sort every comment** into exactly one bucket (see **Buckets**). Write the sort down as a table: file:line, bucket, and where its content goes (ADR number, issue title, or nothing). Done when every listed comment has a row.

3. **Move what lives on.**
   - **Decision records:** first grep `docs/adr/` and `GLOSSARY.md`. If the decision is already written there, nothing moves. Otherwise group the decisions by theme and write one ADR per theme in the house style of the latest ADR (frontmatter `status: accepted`, a bold-led paragraph per decision, then `## Considered options` and `## Consequences` where they apply). Extend an ADR from an earlier run when the theme matches, rather than starting a near-duplicate.
   - **Excuses:** one GitHub issue each, labelled `needs-triage`. Check the open issues for a duplicate first. Each issue says what the shortcut is, where it lives, what it costs, and what "done" looks like, and it opens by saying that the comment has been deleted and the issue is now the only record of the shortcut. Conventions are in `docs/agents/issue-tracker.md`.

   Done when every decision-record row names an ADR that contains its content, and every excuse row names an issue number.

4. **Strip.** `node scripts/check-comments.mjs --strip <files>` deletes every comment in those files except tool directives. It handles whole-line, trailing and JSX `{/* */}` comments. Then `pnpm fix`. Check that `git diff` removes only comment lines. A comment that was the whole body of a block leaves it empty (`catch {}`), and that's fine.

5. **Lock the ratchet.** `pnpm comments:update`, then `pnpm verify`. For SQL, also `pnpm test:db` and `pnpm db:lint`. Done when `pnpm comments` passes and the baseline only has lines removed.

6. **Report** to the user: comment lines removed this run, lines left in the baseline, the ADRs written or extended, the issues filed, and the sort table.

## Buckets

- **Tautology:** says what the code already says, such as a name restated as a sentence, a type described in prose, or a test's arithmetic spelled out. Delete it.
- **Stale:** describes code, a plan or a platform that is gone, or a promise like "joins this screen later (#65)" that an issue already tracks. Delete it.
- **Excuse:** explains why a shortcut is acceptable, such as a placeholder, "for now", "until X", a workaround for a tool's bug, string-matching on error text, or an override wider than the truth. File an issue, then delete it. A comment can be both an excuse and a decision record. When the trade-off is the point (orphaned files over broken links, say), record it in an ADR and file the clean-up as an issue.
- **Decision record:** a non-obvious *why* that would be costly to rediscover: a constraint from a platform, a plan or a law, a trade-off that was weighed, or an ordering that matters. Move it to an ADR, then delete it.

**Tool directives** (`biome-ignore`, `@ts-expect-error`, `@vitest-environment`, shebangs, `shellcheck`) are not comments. `check-comments.mjs` skips them, and they stay.

## Applied migrations

Comments in a migration that production has already run come out in a PR of their own (ADR 0014). Don't mix them into application changes.
