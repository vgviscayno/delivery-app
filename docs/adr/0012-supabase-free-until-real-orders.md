---
status: accepted
---

# Supabase Free until the pilot takes real orders

The backend runs on Supabase's Free plan until the pilot takes its first real order, then moves to Pro (#92). Free has no branching, so ADR 0009's preview branch per PR is set aside until then. The three backends become two, local and production, and the release path is rebuilt from what Free allows.

**Free now, because until real orders there is nothing in production to lose.** Pro costs $25 a month, plus an hourly charge for each preview branch, and buys two things. The first is branching. The second is protection for data: daily backups, and no pausing after a week of inactivity. Neither matters while production holds only demo data. Both matter the moment it holds a customer's Order, which is why the move is tied to that moment rather than to a date.

**The release path on Free:**

1. **The gates and pgTAP**, in CI's `database` job on a local Supabase. This now counts as the rehearsal: it builds the schema from the same migrations, on the Postgres major version `config.toml` pins, which has to match the production project's.
2. **A dry run against production.** `Migrate production` run with `push` off links the production project and runs `supabase db push --dry-run`, which lists the migrations it would apply and applies none.
3. **The push.** `Migrate production` run with `push` on, from `main`, with the project ref typed out. It refuses unless a dry run of this workflow succeeded on the same commit, then dry-runs again and pushes.

The console deploys from `main` only, pointed at production. There are no PR previews. A preview can't point at production (ADR 0009's reason still holds: a preview that can write the shop's real data is worse than none), and a preview with no backend shows nothing worth looking at.

## Considered options

- **A second Free project as a standing staging target.** Free allows two projects. Rejected for the reasons ADR 0009 rejected staging: a third thing to migrate, re-seed and hold credentials for, and a place where RLS quietly drifts.
- **Keeping the preview-branch code behind a switch** such as `SUPABASE_BRANCHING`. Rejected because nothing would run the switched-off path, so it would rot. The code is deleted in one commit, "Drop preview branches while on Supabase Free", and moving to Pro reverts that commit.
- **Required reviewers on the `production` environment** in place of the two-run dry run. Rejected: two approvals per migration, for little more safety than the typed project ref already gives.
- **Staying on Free through the pilot.** Rejected: the pilot's data is the shop's data (ADR 0009), and Free neither backs it up nor keeps it awake.

## Consequences

- **ADR 0009 is partly superseded.** Its preview branches and PR previews are suspended until #92. Its pilot decisions, running on production and sideloading the driver app, are unaffected.
- **Nothing hosted sees a migration before production does.** The dry run shows which migrations would apply, not whether they succeed. A migration that works on a fresh local database but fails against production's existing data is caught only by the push itself. Production holds no real data yet, so a failed push costs a fix-forward migration, not the shop's data.
- **A migration can only be pushed from a commit whose `database` job ran.** That job runs only when `supabase/` or `packages/db/` changes, so a TypeScript-only merge on top of a migration leaves `main`'s head with it skipped, and `Migrate production` refuses until another database change lands. ADR 0009's path had the same gap; #92 carries it.
- **The production project must not sit idle for a week.** Free pauses it, and a paused project breaks the console and `Migrate production` until someone resumes it from the dashboard. Resuming keeps the data.
