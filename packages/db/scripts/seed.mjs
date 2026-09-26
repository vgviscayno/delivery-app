// Runs supabase/seed.sql against a database.
//
// Local resets apply it automatically (`[db.seed]` in config.toml) and so do preview
// branches. This script is for the third case: seeding a preview branch on demand,
// after a rehearsal has already run the migrations.
//
//   SUPABASE_DB_URL=postgresql://... node scripts/seed.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";
import { databaseUrl, repoRoot, withClient } from "./db.mjs";

const seedPath = path.join(repoRoot, "supabase", "seed.sql");
const sql = await readFile(seedPath, "utf8");

await withClient(async (client) => {
  await client.query(sql);
});

console.log(
  `Seeded ${databaseUrl().replace(/:[^:@/]*@/, ":****@")} from supabase/seed.sql`,
);
