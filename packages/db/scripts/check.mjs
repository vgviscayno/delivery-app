// The gates every migration has to pass, run as CI steps and as pgTAP tests.
//
//   node scripts/check.mjs rls      -- no table in an exposed schema has row security off
//   node scripts/check.mjs matrix   -- the role x resource matrix covers every reachable object
//   node scripts/check.mjs schemas  -- the harness and PostgREST agree on what is exposed
//
// The first two read the checks out of the database itself (see the security harness
// migration), so CI and `supabase test db` can never drift apart. The third is the one
// thing the database cannot know on its own: which schemas PostgREST actually serves.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { printRows, repoRoot, withClient } from "./db.mjs";

// Supabase's own GraphQL entrypoint. It holds none of our objects, so neither gate has
// anything to say about it.
const SUPABASE_OWNED_SCHEMAS = ["graphql_public"];

const checks = {
  rls: {
    run: (client) =>
      rowsOf(client, "select object_schema, object_name from app.tables_without_rls()"),
    failure: (count) =>
      `${count} table(s) in an exposed schema have row security off. ` +
      `Anyone holding the anon key can read them.`,
    success: "RLS lint: every table in an exposed schema has row security on.",
  },

  matrix: {
    run: (client) =>
      rowsOf(
        client,
        "select object_schema, object_name, object_kind, actor, gap from app.access_matrix_gaps()",
      ),
    failure: (count) =>
      `${count} gap(s) in the role x resource matrix. ` +
      `Add a row to app.access_matrix for each, in a migration, saying who may touch it and why.`,
    success: "Access matrix: every reachable table, view and RPC is accounted for.",
  },

  // `app.exposed_schemas()` decides what the other two gates look at. If PostgREST
  // starts serving a schema the harness does not know about, both gates go quiet about
  // everything in it -- the worst possible failure, because it looks like a pass.
  schemas: {
    run: async (client) => {
      const served = await schemasServedByPostgrest();
      const { rows } = await client.query("select app.exposed_schemas() as schemas");
      const guarded = rows[0].schemas;

      return [
        ...served
          .filter((schema) => !guarded.includes(schema))
          .map((schema) => ({ schema, problem: "served by PostgREST but not guarded" })),
        ...guarded
          .filter((schema) => !served.includes(schema))
          .map((schema) => ({ schema, problem: "guarded but not served by PostgREST" })),
      ];
    },
    failure: () =>
      `supabase/config.toml and app.exposed_schemas() disagree about which schemas are ` +
      `reachable. Both gates only look at the schemas the harness knows about, so a ` +
      `schema missing from it is silently unguarded.`,
    success: "Exposed schemas: config.toml and app.exposed_schemas() agree.",
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

const findings = await withClient(check.run);

if (findings.length > 0) {
  console.error(check.failure(findings.length));
  printRows(findings);
  process.exit(1);
}

console.log(check.success);

async function rowsOf(client, query) {
  return (await client.query(query)).rows;
}

/** Reads `api.schemas` out of supabase/config.toml -- the list PostgREST is given. */
async function schemasServedByPostgrest() {
  const configPath = path.join(repoRoot, "supabase", "config.toml");
  const config = await readFile(configPath, "utf8");

  const apiSection = config.split(/^\[/m).find((section) => section.startsWith("api]"));
  const schemas = apiSection?.match(/^schemas\s*=\s*\[([^\]]*)\]/m);

  if (!schemas) {
    console.error(`Could not find api.schemas in ${configPath}.`);
    process.exit(2);
  }

  return [...schemas[1].matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((schema) => !SUPABASE_OWNED_SCHEMAS.includes(schema));
}
