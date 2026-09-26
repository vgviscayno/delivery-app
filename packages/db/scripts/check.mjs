// The two gates every migration has to pass, run as CI steps and as pgTAP tests.
//
//   node scripts/check.mjs rls      -- no table in an exposed schema has row security off
//   node scripts/check.mjs matrix   -- the role x resource matrix covers every reachable object
//
// Both read the checks out of the database itself (see the security harness
// migration), so CI and `supabase test db` can never drift apart.

import { printRows, withClient } from "./db.mjs";

const checks = {
  rls: {
    query: "select object_schema, object_name from app.tables_without_rls()",
    failure: (count) =>
      `${count} table(s) in an exposed schema have row security off. ` +
      `Anyone holding the anon key can read them.`,
    success: "RLS lint: every table in an exposed schema has row security on.",
  },
  matrix: {
    query:
      "select object_schema, object_name, object_kind, actor, gap from app.access_matrix_gaps()",
    failure: (count) =>
      `${count} gap(s) in the role x resource matrix. ` +
      `Add a row to app.access_matrix for each, in a migration, saying who may touch it and why.`,
    success: "Access matrix: every reachable table, view and RPC is accounted for.",
  },
};

const name = process.argv[2];
const check = checks[name];

if (!check) {
  console.error(
    `Unknown check "${name}". Expected one of: ${Object.keys(checks).join(", ")}`,
  );
  process.exit(2);
}

const rows = await withClient(async (client) => (await client.query(check.query)).rows);

if (rows.length > 0) {
  console.error(check.failure(rows.length));
  printRows(rows);
  process.exit(1);
}

console.log(check.success);
