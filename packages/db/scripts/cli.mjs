// The Supabase CLI, always pointed at the project at the repo root.
//
//   node scripts/cli.mjs db reset
//   node scripts/cli.mjs db push --db-url "$SUPABASE_DB_URL"
//
// Every caller -- the package scripts and CI alike -- goes through here, so
// `--workdir` and the way the binary is spawned are stated once.

import { supabase } from "./db.mjs";

supabase(process.argv.slice(2));
