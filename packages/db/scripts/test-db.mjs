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

import { readFile } from "node:fs/promises";
import path from "node:path";
import { packageRoot, seed, supabase, withClient } from "./db.mjs";

const factories = await readFile(
  path.join(packageRoot, "sql", "test-factories.sql"),
  "utf8",
);

supabase(["db", "reset", "--no-seed"]);

await withClient(async (client) => {
  await client.query("create extension if not exists pgtap with schema extensions");
  await client.query(factories);
});

const tests = supabase(["test", "db"], { allowFailure: true });

try {
  await seed();
} catch (error) {
  console.error(
    `pgTAP finished, but re-seeding the local database failed: ${error.message}`,
  );
  process.exit(tests.status || 1);
}

process.exit(tests.status ?? 1);
