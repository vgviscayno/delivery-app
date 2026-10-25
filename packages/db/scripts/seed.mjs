// Runs supabase/seed.sql against a database.
//
// Local resets apply it automatically (`[db.seed]` in config.toml) and so do preview
// branches. This script is for the third case: seeding a preview branch on demand,
// after a rehearsal has already run the migrations.
//
//   SUPABASE_DB_URL=postgresql://... node scripts/seed.mjs

import { databaseUrl, seed } from "./db.mjs";

await seed();

console.log(
  `Seeded ${databaseUrl().replace(/:[^:@/]*@/, ":****@")} from supabase/seed.sql`,
);
