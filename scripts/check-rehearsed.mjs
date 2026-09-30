// Refuses a production migration whose migrations were never rehearsed (ADR 0012: on
// Supabase Free the rehearsal is CI's `database` job, on a local Supabase).
//
// Without this the ordering is a convention: someone can trigger the production
// workflow on a commit whose gates failed, or never ran at all, and nothing notices.
//
//   node scripts/check-rehearsed.mjs
//
// Reads GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_TOKEN from the Actions environment.
//
// The rule: the CI run for this commit must exist, and its `database` job must have
// passed -- that is the gates and pgTAP, against a database built from exactly these
// migrations. The workflow runs on main only, so this commit is the one CI checked on
// its push to main.

const repository = env("GITHUB_REPOSITORY");
const sha = env("GITHUB_SHA");
const token = env("GITHUB_TOKEN");

const CI_WORKFLOW = "ci.yml";

const ciRun = await latestRun(CI_WORKFLOW, { head_sha: sha });

if (!ciRun) {
  fail(
    `No CI run found for ${sha.slice(0, 8)}.\n` +
      `Production migrations run only on a commit CI has already checked.`,
  );
}

const gates = await jobConclusion(ciRun.id, "database");
if (gates !== "success") {
  fail(
    `The "database" job of CI run ${ciRun.id} concluded "${gates ?? "not run"}".\n` +
      `The gates and pgTAP have to pass on this commit before production.`,
  );
}

console.log(
  `The migrations at ${sha.slice(0, 8)} passed the gates and pgTAP in CI run ${ciRun.id}.`,
);

async function jobConclusion(runId, name) {
  const page = await api(`/actions/runs/${runId}/jobs?per_page=100`);
  return page.jobs.find((job) => job.name === name)?.conclusion;
}

// Asking the workflow for its own runs, rather than filtering every run in the repo
// by name: the unfiltered list is paginated, and the run being looked for can sit off
// the first page.
async function latestRun(workflowFile, query) {
  const params = new URLSearchParams({ per_page: "100", ...query });
  const page = await api(`/actions/workflows/${workflowFile}/runs?${params}`);
  return page.workflow_runs[0];
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
