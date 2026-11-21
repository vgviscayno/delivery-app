// pgTAP, the server-contract seam, run against a freshly migrated local Supabase.
//
// The reset is deliberately `--no-seed`: the seed script is demo data for local and
// preview work, never a test input. Every pgTAP test builds the data it needs and
// rolls it back.
//
// The seed runs afterwards instead, pass or fail, because the reset empties the same
// local database the console signs in to. It runs only once the tests have finished,
// so it can never be the reason one passed.
//
// pgTAP itself, and the factory helpers in sql/test-factories.sql, are installed here
// rather than in a migration, so neither ever reaches production.
//
// Test files named on the command line, relative to the repo root, run alone: the
// red-green loop on one file, with the same reset and factories as the full suite.
//
//   pnpm --filter @courier/db test:db supabase/tests/customer_addresses_test.sql

import { readFile } from "node:fs/promises";
import path from "node:path";
import { packageRoot, repoRoot, seed, supabase, withClient } from "./db.mjs";

const factories = await readFile(
  path.join(packageRoot, "sql", "test-factories.sql"),
  "utf8",
);

supabase(["db", "reset", "--no-seed"]);

await withClient(async (client) => {
  await client.query("create extension if not exists pgtap with schema extensions");
  await client.query(factories);
});

const only = process.argv.slice(2).map((file) => path.resolve(repoRoot, file));
const tests = supabase(["test", "db", ...only], { allowFailure: true });

try {
  await seed();
} catch (error) {
  console.error(
    `pgTAP finished, but re-seeding the local database failed: ${error.message}`,
  );
  process.exit(tests.status || 1);
}

process.exit(tests.status ?? 1);
