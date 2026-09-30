// Refuses a production push that no one has dry-run first (ADR 0012: on Supabase Free
// there is no preview branch to rehearse on, so a dry run against production is the
// last look before the push).
//
// Without this, `push` could be ticked on the first run, and the list of migrations it
// was about to apply would appear in the same run that applied them.
//
//   node scripts/check-dry-run.mjs
//
// Reads GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_TOKEN from the Actions environment.
//
// The rule: a run of this workflow with `push` off must have succeeded on this exact
// commit. Not on an earlier one: if main moved, the migrations about to be pushed may
// not be the ones the dry run listed. The API does not report a run's inputs, so a dry
// run is told apart by its title, which the workflow's `run-name` sets.

const repository = env("GITHUB_REPOSITORY");
const sha = env("GITHUB_SHA");
const token = env("GITHUB_TOKEN");

const THIS_WORKFLOW = "migrate-production.yml";
const DRY_RUN_TITLE = "Migrate production (dry run)";

const params = new URLSearchParams({
  head_sha: sha,
  status: "success",
  per_page: "100",
});
const page = await api(`/actions/workflows/${THIS_WORKFLOW}/runs?${params}`);
const dryRun = page.workflow_runs.find((run) => run.display_title === DRY_RUN_TITLE);

if (!dryRun) {
  fail(
    `No successful dry run of this workflow found for ${sha.slice(0, 8)}.\n` +
      `Run "Migrate production" with push off first, read the migrations it lists in\n` +
      `the job summary, then run it again with push on.`,
  );
}

console.log(
  `The migrations at ${sha.slice(0, 8)} were dry-run against production in run ` +
    `${dryRun.id}: ${dryRun.html_url}`,
);

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
