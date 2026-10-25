// pgTAP, the server-contract seam, run against a freshly migrated local Supabase.
//
// The reset is deliberately `--no-seed`: the seed script is demo data for local and
// preview work, never a test input. Every pgTAP test builds the data it needs and
// rolls it back.
//
// pgTAP itself, and the factory helpers in sql/test-factories.sql, are installed here
// rather than in a migration, so neither ever reaches production.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { packageRoot, supabase, withClient } from "./db.mjs";

const factories = await readFile(
  path.join(packageRoot, "sql", "test-factories.sql"),
  "utf8",
);

supabase(["db", "reset", "--no-seed"]);

await withClient(async (client) => {
  await client.query("create extension if not exists pgtap with schema extensions");
  await client.query(factories);
});

supabase(["test", "db"]);
