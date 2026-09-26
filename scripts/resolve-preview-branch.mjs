// Finds the Supabase preview branch belonging to a PR and writes its connection
// details to $GITHUB_OUTPUT.
//
// Supabase's GitHub integration creates one branch per PR, named after the git
// branch. CI needs three things out of it: the database URL to rehearse migrations
// against, and the API URL and anon key to build that PR's console preview with.
//
//   node scripts/resolve-preview-branch.mjs --git-branch feat/whatever
//
// Outputs: db_url, api_url, anon_key

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { "git-branch": { type: "string" } },
});

const gitBranch = values["git-branch"];
const projectRef = process.env.SUPABASE_PROJECT_ID;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

const missing = [
  !gitBranch && "--git-branch",
  !projectRef && "SUPABASE_PROJECT_ID",
  !accessToken && "SUPABASE_ACCESS_TOKEN",
].filter(Boolean);

if (missing.length > 0) {
  fail(
    `Cannot resolve this PR's Supabase preview branch: ${missing.join(", ")} not set.\n` +
      `Preview branches are how migrations are rehearsed (ADR 0009); a PR that touches\n` +
      `supabase/migrations cannot merge without them. Set the secrets on the repository.`,
  );
}

const api = async (path) => {
  const response = await fetch(`https://api.supabase.com/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    fail(
      `Supabase Management API ${path} returned ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
};

const branches = await api(`/projects/${projectRef}/branches`);
const branch = branches.find((candidate) => candidate.git_branch === gitBranch);

if (!branch) {
  fail(
    `No Supabase preview branch for git branch "${gitBranch}".\n` +
      `Check that the Supabase GitHub integration is installed and watching this repo.`,
  );
}

const details = await api(`/branches/${branch.id}`);

const password = process.env.SUPABASE_PREVIEW_DB_PASSWORD ?? details.db_password;
const dbUrl = `postgresql://${details.db_user ?? "postgres"}:${encodeURIComponent(
  password ?? "",
)}@${details.db_host}:${details.db_port ?? 5432}/postgres`;

await writeOutput({
  db_url: dbUrl,
  api_url: `https://${details.ref}.supabase.co`,
  anon_key: details.anon_key ?? details.api_keys?.anon ?? "",
});

console.log(`Resolved preview branch "${branch.name}" (${details.ref}) for ${gitBranch}`);

async function writeOutput(outputs) {
  const target = process.env.GITHUB_OUTPUT;
  const lines = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  if (!target) {
    console.log(lines);
    return;
  }
  await appendFile(target, `${lines}\n`, "utf8");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
