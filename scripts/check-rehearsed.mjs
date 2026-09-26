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
//   * the migrations at this commit must have been rehearsed. The rehearsal happened
//     on a PR, against the PR's head commit, which is never this commit: main gets a
//     merge or a squash. So the migrations are matched by content, not by sha -- a
//     rehearsal counts when it ran on a commit whose `supabase/migrations` is
//     file-for-file identical to this one's. The same comparison against the last
//     successful production migration is what lets a migration-free commit through:
//     identical migrations means there is nothing to rehearse.

const repository = env("GITHUB_REPOSITORY");
const sha = env("GITHUB_SHA");
const token = env("GITHUB_TOKEN");

const CI_WORKFLOW = "ci.yml";
const THIS_WORKFLOW = "migrate-production.yml";

// How far back to look for the rehearsal. A migration that has been sitting on main
// for a hundred CI runs is not one this check should quietly wave through.
const RUNS_SEARCHED = 30;

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
      `The RLS lint and the completeness check have to pass before production.`,
  );
}

const migrations = await migrationsAt(sha);

if (migrations.length === 0) {
  fail(
    `There are no migrations at ${sha.slice(0, 8)}. Nothing to push, and an empty\n` +
      `supabase/migrations is more likely a bad checkout than an intention.`,
  );
}

const lastProduction = await latestRun(THIS_WORKFLOW, { status: "success" });

if (lastProduction && (await sameMigrations(lastProduction.head_sha))) {
  console.log(
    `The migrations at ${sha.slice(0, 8)} are the ones production already has ` +
      `(${lastProduction.head_sha.slice(0, 8)}); nothing to rehearse.`,
  );
  process.exit(0);
}

const rehearsal = await findRehearsal();

if (!rehearsal) {
  fail(
    `No successful preview-branch rehearsal found for the migrations at ` +
      `${sha.slice(0, 8)}\n` +
      `in the last ${RUNS_SEARCHED} pull-request CI runs:\n` +
      migrations.map((file) => `  - ${file.name}`).join("\n") +
      `\n\nA migration reaches production only after it has been rehearsed on a PR's\n` +
      `preview branch. Open a PR with these migrations and let the rehearsal run.`,
  );
}

console.log(
  `The migrations at ${sha.slice(0, 8)} were rehearsed on a preview branch in CI run ` +
    `${rehearsal.id} (${rehearsal.head_sha.slice(0, 8)}).`,
);

// Newest first, one candidate per head commit: the same commit can have several CI
// runs behind it (a re-run, a push that raced), and only the migrations decide
// whether a run is worth opening.
async function findRehearsal() {
  const runs = await workflowRuns(CI_WORKFLOW, {
    event: "pull_request",
    status: "completed",
  });
  const seen = new Set();

  for (const run of runs) {
    if (seen.has(run.head_sha)) continue;
    seen.add(run.head_sha);
    if (seen.size > RUNS_SEARCHED) return undefined;

    if (!(await sameMigrations(run.head_sha))) continue;
    if ((await jobConclusion(run.id, "preview-rehearsal")) === "success") return run;
  }
  return undefined;
}

// Two commits carry the same migrations when the directory holds the same files with
// the same content. `sha` on a contents entry is the blob's, so it moves when a file
// is edited in place -- which a rehearsal has to see again.
async function sameMigrations(otherSha) {
  const other = await migrationsAt(otherSha);
  return fingerprint(other) === fingerprint(migrations);
}

function fingerprint(files) {
  return files.map((file) => `${file.name}:${file.sha}`).join("\n");
}

async function migrationsAt(ref) {
  const entries = await api(
    `/contents/supabase/migrations?ref=${encodeURIComponent(ref)}`,
    { emptyOn404: true },
  );
  return entries
    .filter((entry) => entry.type === "file")
    .map((entry) => ({ name: entry.name, sha: entry.sha }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function jobConclusion(runId, name) {
  const page = await api(`/actions/runs/${runId}/jobs?per_page=100`);
  return page.jobs.find((job) => job.name === name)?.conclusion;
}

async function latestRun(workflowFile, query) {
  return (await workflowRuns(workflowFile, query))[0];
}

// Asking the workflow for its own runs, rather than filtering every run in the repo
// by name: the unfiltered list is paginated, and the run being looked for can sit off
// the first page.
async function workflowRuns(workflowFile, query) {
  const params = new URLSearchParams({ per_page: "100", ...query });
  const page = await api(`/actions/workflows/${workflowFile}/runs?${params}`);
  return page.workflow_runs;
}

async function api(path, { emptyOn404 = false } = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (response.status === 404 && emptyOn404) return [];
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
