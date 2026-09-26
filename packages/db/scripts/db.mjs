import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

export const packageRoot = path.dirname(
  path.dirname(fileURLToPath(new URL("db.mjs", import.meta.url))),
);
export const repoRoot = path.resolve(packageRoot, "..", "..");

/** The local Supabase database the CLI starts, unless something points us elsewhere. */
export const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function databaseUrl() {
  return process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? LOCAL_DB_URL;
}

// The CLI's npm package ships a Node entrypoint. Running it with this process's own
// Node, rather than through the `.bin` shim, keeps the call identical on Windows and
// Linux -- Node refuses to spawn a `.cmd` without a shell.
const require = createRequire(import.meta.url);
const supabaseManifest = require("supabase/package.json");
const supabaseEntry = path.join(
  path.dirname(require.resolve("supabase/package.json")),
  supabaseManifest.bin.supabase,
);

/** Runs the Supabase CLI against the project at the repo root, wherever we were invoked from. */
export function supabase(args, options = {}) {
  const result = spawnSync(
    process.execPath,
    [supabaseEntry, "--workdir", repoRoot, ...args],
    {
      stdio: options.stdio ?? "inherit",
      cwd: packageRoot,
      shell: false,
      encoding: "utf8",
    },
  );
  if (result.error) throw result.error;
  if (options.allowFailure !== true && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

export async function withClient(fn) {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export function printRows(rows) {
  for (const row of rows) {
    console.error(`  - ${Object.values(row).join("  ")}`);
  }
}
