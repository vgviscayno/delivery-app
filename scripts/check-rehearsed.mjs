// Refuses a production migration whose migrations were never rehearsed on a preview
// branch (ADR 0009: RLS lint -> preview rehearsal -> manual production trigger).
//
// Without this the ordering is a convention: someone can trigger the production
// workflow on a commit whose rehearsal failed, or was never run at all, and nothing
// notices.
//
//   node scripts/check-rehearsed.mjs
//
// Reads GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_TOKEN from the Actions environment.
//
// The rule:
//
//   * the CI run for this commit must exist, and its `database` job must have passed
//     -- that is the RLS lint and the completeness check;
//   * its `preview-rehearsal` job must have passed, OR have been skipped because this
//     commit's migrations are identical to those of the last production migration,
//     in which case there is nothing to rehearse.

import { execFileSync } from "node:child_process";

const repository = env("GITHUB_REPOSITORY");
const sha = env("GITHUB_SHA");
const token = env("GITHUB_TOKEN");

const CI_WORKFLOW = "CI";
const THIS_WORKFLOW = "Migrate production";

const ciRun = await latestRun(CI_WORKFLOW, { head_sha: sha });

if (!ciRun) {
  fail(
    `No "${CI_WORKFLOW}" run found for ${sha.slice(0, 8)}.\n` +
      `Production migrations run only on a commit CI has already checked.`,
  );
}

const jobs = await api(`/actions/runs/${ciRun.id}/jobs?per_page=100`).then(
  (page) => page.jobs,
);
const jobConclusion = (name) => jobs.find((job) => job.name === name)?.conclusion;

const gates = jobConclusion("database");
if (gates !== "success") {
  fail(
    `The "database" job of CI run ${ciRun.id} concluded "${gates ?? "not run"}".\n` +
      `The RLS lint and the completeness check have to pass before production.`,
  );
}

const rehearsal = jobConclusion("preview-rehearsal");

if (rehearsal === "success") {
  console.log(`Migrations were rehearsed on a preview branch in CI run ${ciRun.id}.`);
  process.exit(0);
}

if (rehearsal !== "skipped" && rehearsal !== undefined) {
  fail(
    `The "preview-rehearsal" job of CI run ${ciRun.id} concluded "${rehearsal}".\n` +
      `A migration reaches production only after a rehearsal on a preview branch.`,
  );
}

// Skipped means the PR did not touch supabase/migrations. That is only safe if this
// commit's migrations are the ones production already has.
const lastProduction = await latestRun(THIS_WORKFLOW, { status: "success" });

if (!lastProduction) {
  fail(
    `"preview-rehearsal" did not run for ${sha.slice(0, 8)} and there is no previous\n` +
      `successful production migration to compare against. The first production\n` +
      `migration has to come from a PR that was rehearsed.`,
  );
}

const changed = migrationsChangedSince(lastProduction.head_sha);

if (changed.length > 0) {
  fail(
    `Migrations changed since the last production migration ` +
      `(${lastProduction.head_sha.slice(0, 8)}) but "preview-rehearsal" did not run for\n` +
      `${sha.slice(0, 8)}:\n` +
      changed.map((file) => `  - ${file}`).join("\n"),
  );
}

console.log(
  `No migration changes since the last production migration ` +
    `(${lastProduction.head_sha.slice(0, 8)}); nothing to rehearse.`,
);

function migrationsChangedSince(baseSha) {
  try {
    return execFileSync(
      "git",
      ["diff", "--name-only", `${baseSha}..${sha}`, "--", "supabase/migrations"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    fail(
      `Could not compare migrations against ${baseSha}: ${error.message}\n` +
        `The workflow needs a checkout deep enough to contain it (fetch-depth: 0).`,
    );
  }
}

async function latestRun(workflowName, query) {
  const params = new URLSearchParams({ per_page: "100", ...query });
  const page = await api(`/actions/runs?${params}`);
  return page.workflow_runs.find((run) => run.name === workflowName);
}

async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    fail(`GitHub API ${path} returned ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function env(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is not set; this script runs inside GitHub Actions.`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
