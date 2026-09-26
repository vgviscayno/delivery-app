// Finds the Supabase preview branch belonging to a PR and writes its connection
// details to $GITHUB_OUTPUT.
//
// Supabase's GitHub integration creates one branch per PR, named after the git
// branch. CI needs three things out of it: the database URL to rehearse migrations
// against, and the API URL and a browser-safe key to build that PR's console preview
// with.
//
//   node scripts/resolve-preview-branch.mjs --git-branch feat/whatever
//
// Outputs: db_url, api_url, anon_key
//
// Every lookup fails loudly. A preview whose console was built with an empty key
// would deploy green and be dead in the browser, and a passwordless database URL
// would fail the rehearsal with a connection error that names nothing.

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const MANAGEMENT_API = "https://api.supabase.com/v1";

const { values } = parseArgs({ options: { "git-branch": { type: "string" } } });

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
      `Preview branches are how migrations are rehearsed and how a PR's console preview\n` +
      `gets a backend (ADR 0009). Set the secrets on the repository.`,
  );
}

const branches = await api(`/projects/${projectRef}/branches`);
const branch = branches.find((candidate) => candidate.git_branch === gitBranch);

if (!branch) {
  fail(
    `No Supabase preview branch for git branch "${gitBranch}".\n` +
      `Check that the Supabase GitHub integration is installed and watching this repo.\n` +
      `A PR preview is never pointed at production as a fallback -- a preview that can\n` +
      `write to the shop's real data is worse than no preview.`,
  );
}

// The branch detail carries the database credentials. `db_user`, `db_pass` and
// `db_port` are all optional in the API's own schema, so each is checked rather than
// defaulted.
const details = await api(`/branches/${branch.id}`);
const dbUser = required(details.db_user, "db_user");
const dbHost = required(details.db_host, "db_host");
const dbPort = required(details.db_port, "db_port");
const dbPass = required(
  process.env.SUPABASE_PREVIEW_DB_PASSWORD ?? details.db_pass,
  "db_pass (set SUPABASE_PREVIEW_DB_PASSWORD if the API does not reveal it)",
);

// Keys are not part of the branch detail: they belong to the preview project the
// branch created, and have to be revealed explicitly.
const keys = await api(`/projects/${details.ref}/api-keys?reveal=true`);
const browserKey =
  keys.find((key) => key.name === "anon")?.api_key ??
  keys.find((key) => key.type === "publishable")?.api_key;

if (!browserKey) {
  fail(
    `Preview project ${details.ref} exposes no anon or publishable key.\n` +
      `Found: ${keys.map((key) => `${key.name} (${key.type})`).join(", ") || "none"}`,
  );
}

await writeOutput({
  db_url: `postgresql://${dbUser}:${encodeURIComponent(dbPass)}@${dbHost}:${dbPort}/postgres`,
  api_url: `https://${details.ref}.supabase.co`,
  anon_key: browserKey,
});

console.log(`Resolved preview branch "${branch.name}" (${details.ref}) for ${gitBranch}`);

async function api(path) {
  const response = await fetch(`${MANAGEMENT_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    fail(
      `Supabase Management API ${path} returned ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
}

function required(value, name) {
  if (value === undefined || value === null || value === "") {
    fail(
      `The Supabase Management API did not return ${name} for this preview branch.\n` +
        `Refusing to build a URL with a blank field.`,
    );
  }
  return value;
}

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
