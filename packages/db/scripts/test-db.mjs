// pgTAP, the server-contract seam, run against a freshly migrated local Supabase.
//
// The reset is deliberately `--no-seed`: the seed script is demo data for local and
// preview work, never a test input. Every pgTAP test builds the data it needs and
// rolls it back.
//
// pgTAP itself is installed here rather than in a migration, so the extension never
// reaches production.

import { supabase, withClient } from "./db.mjs";

supabase(["db", "reset", "--no-seed"]);

await withClient(async (client) => {
  await client.query("create extension if not exists pgtap with schema extensions");
});

supabase(["test", "db"]);
