// Finds the Supabase preview branch belonging to a PR and writes what the caller asked
// for to $GITHUB_OUTPUT.
//
// Supabase's GitHub integration creates one branch per PR, named after the git branch.
// Two callers want different things out of it, and neither should fail on a field it
// never uses:
//
//   node scripts/resolve-preview-branch.mjs --git-branch feat/x --for rehearsal
//     the database URL to rehearse migrations against.  Outputs: found, db_url
//
//   node scripts/resolve-preview-branch.mjs --git-branch feat/x --for build
//     the API URL and a browser-safe key to build that PR's console with.
//     Outputs: found, api_url, anon_key
//
// Every lookup the caller did ask for fails loudly. A preview whose console was built
// with an empty key would deploy green and be dead in the browser, and a passwordless
// database URL would fail the rehearsal with a connection error that names nothing.
//
// `--allow-missing` is for the caller that can live without a preview branch. The
// integration only creates one for a PR that touches the Supabase directory, so a
// TypeScript-only PR has none through no fault of its own: the flag writes
// `found=false` and exits 0, leaving that caller to deploy nothing. Without the flag a
// missing branch fails -- a PR that touches migrations has to have somewhere to
// rehearse them.

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const MANAGEMENT_API = "https://api.supabase.com/v1";

const PURPOSES = {
  rehearsal: databaseUrlOf,
  build: consoleEnvOf,
};

const { values } = parseArgs({
  options: {
    "git-branch": { type: "string" },
    for: { type: "string" },
    "allow-missing": { type: "boolean", default: false },
  },
});

const gitBranch = values["git-branch"];
const allowMissing = values["allow-missing"];
const resolveOutputs = PURPOSES[values.for];
const projectRef = process.env.SUPABASE_PROJECT_ID;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!resolveOutputs) {
  fail(
    `--for has to be one of: ${Object.keys(PURPOSES).join(", ")} ` +
      `(got "${values.for ?? ""}").\n` +
      `The two callers need different fields out of the same branch, and asking for ` +
      `both\nwould fail a console build on a database password it never reads.`,
  );
}

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
  // Either way, the answer is never production: a preview that can write to the shop's
  // real data is worse than no preview.
  if (allowMissing) {
    console.log(
      `No Supabase preview branch for git branch "${gitBranch}"; nothing to point a ` +
        `build at.`,
    );
    await writeOutput({ found: "false" });
    process.exit(0);
  }
  fail(
    `No Supabase preview branch for git branch "${gitBranch}".\n` +
      `Check that the Supabase GitHub integration is installed and watching this repo.\n` +
      `A PR preview is never pointed at production as a fallback -- a preview that can\n` +
      `write to the shop's real data is worse than no preview.`,
  );
}

const details = await api(`/branches/${branch.id}`);

await writeOutput({ found: "true", ...(await resolveOutputs(details)) });

console.log(`Resolved preview branch "${branch.name}" (${details.ref}) for ${gitBranch}`);

// The branch detail carries the database credentials. `db_user`, `db_pass` and
// `db_port` are all optional in the API's own schema, so each is checked rather than
// defaulted.
function databaseUrlOf(details) {
  const dbUser = required(details.db_user, "db_user");
  const dbHost = required(details.db_host, "db_host");
  const dbPort = required(details.db_port, "db_port");
  const dbPass = required(
    process.env.SUPABASE_PREVIEW_DB_PASSWORD ?? details.db_pass,
    "db_pass (set SUPABASE_PREVIEW_DB_PASSWORD if the API does not reveal it)",
  );

  return {
    db_url: `postgresql://${dbUser}:${encodeURIComponent(dbPass)}@${dbHost}:${dbPort}/postgres`,
  };
}

// Keys are not part of the branch detail: they belong to the preview project the
// branch created, and have to be revealed explicitly.
async function consoleEnvOf(details) {
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

  return { api_url: `https://${details.ref}.supabase.co`, anon_key: browserKey };
}

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
