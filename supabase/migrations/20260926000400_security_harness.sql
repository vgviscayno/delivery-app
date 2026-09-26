-- The security harness: two checks that every later migration has to keep green.
--
--   1. `app.tables_without_rls()` -- the RLS lint. A table in an exposed schema with
--      row security off is readable by anyone holding an anon key. CI fails on it.
--   2. `app.access_matrix` plus `app.access_matrix_gaps()` -- the role x resource
--      matrix and its completeness check. Every table, view and RPC an authenticated
--      or anonymous client can reach must be listed for all four actors, allowed or
--      denied, with a note. Adding a reachable object without saying who may touch it
--      fails the build.
--
-- Later tickets only add rows to `app.access_matrix`; they never edit these functions.

-- Which schemas PostgREST serves. Must match `api.schemas` in supabase/config.toml,
-- minus `graphql_public` (which holds only Supabase's own GraphQL entrypoint).
create or replace function app.exposed_schemas()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$ select array['public']::text[] $$;

comment on function app.exposed_schemas() is
  'Schemas reachable through PostgREST. Keep in step with api.schemas in config.toml.';

-- The four actors the matrix speaks in. `anon` is a Postgres role; customer, driver
-- and dispatcher are app roles carried inside `authenticated` (see ticket 57), so the
-- harness can only verify `anon` against the grants -- the other three are claims the
-- per-role pgTAP tests have to back up.
create or replace function app.actors()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$ select array['anon', 'customer', 'driver', 'dispatcher']::text[] $$;

create or replace function app.has_any_table_privilege(role_name text, rel oid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select pg_catalog.has_table_privilege(
    role_name, rel, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  )
$$;

-- Every object a client could name over HTTP, and which Postgres role can reach it.
-- Overloads collapse to one row: PostgREST addresses a function by name, so that is
-- the granularity a reviewer reasons about.
create or replace function app.reachable_objects()
returns table (
  object_schema text,
  object_name text,
  object_kind text,
  anon_reachable boolean,
  authenticated_reachable boolean
)
language sql
stable
set search_path = ''
as $$
  select
    n.nspname::text,
    c.relname::text,
    case when c.relkind in ('r', 'p') then 'table' else 'view' end::text,
    bool_or(app.has_any_table_privilege('anon', c.oid)),
    bool_or(app.has_any_table_privilege('authenticated', c.oid))
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = any (app.exposed_schemas())
    and c.relkind in ('r', 'p', 'v', 'm')
    and (
      app.has_any_table_privilege('anon', c.oid)
      or app.has_any_table_privilege('authenticated', c.oid)
    )
  group by 1, 2, 3

  union all

  select
    n.nspname::text,
    p.proname::text,
    'function'::text,
    bool_or(pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')),
    bool_or(pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = any (app.exposed_schemas())
    and p.prokind in ('f', 'p')
    and (
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  group by 1, 2, 3
$$;

comment on function app.reachable_objects() is
  'Every table, view and RPC an anon or authenticated client can name over the API.';

create table if not exists app.access_matrix (
  object_schema text not null default 'public',
  object_name text not null,
  object_kind text not null check (object_kind in ('table', 'view', 'function')),
  actor text not null check (actor in ('anon', 'customer', 'driver', 'dispatcher')),
  allowed boolean not null,
  note text not null check (length(btrim(note)) > 0),
  primary key (object_schema, object_name, object_kind, actor)
);

comment on table app.access_matrix is
  'Role x resource matrix. One row per reachable object per actor, denials included, each with a note.';
comment on column app.access_matrix.note is
  'Why this actor may or may not touch this object. A denial without a reason is not written down.';

alter table app.access_matrix enable row level security;

create or replace function app.tables_without_rls()
returns table (object_schema text, object_name text)
language sql
stable
set search_path = ''
as $$
  select n.nspname::text, c.relname::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = any (app.exposed_schemas())
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity
  order by 1, 2
$$;

comment on function app.tables_without_rls() is
  'The RLS lint. Any row here means a table in an exposed schema is open to anyone with the anon key.';

create or replace function app.access_matrix_gaps()
returns table (
  object_schema text,
  object_name text,
  object_kind text,
  actor text,
  gap text
)
language sql
stable
set search_path = ''
as $$
  -- A reachable object with nothing said about an actor.
  select r.object_schema, r.object_name, r.object_kind, a.actor, 'missing'::text
  from app.reachable_objects() r
  cross join unnest(app.actors()) as a(actor)
  where not exists (
    select 1
    from app.access_matrix m
    where m.object_schema = r.object_schema
      and m.object_name = r.object_name
      and m.object_kind = r.object_kind
      and m.actor = a.actor
  )

  union all

  -- A matrix row for something no client can reach any more.
  select m.object_schema, m.object_name, m.object_kind, m.actor, 'stale'::text
  from app.access_matrix m
  where not exists (
    select 1
    from app.reachable_objects() r
    where r.object_schema = m.object_schema
      and r.object_name = m.object_name
      and r.object_kind = m.object_kind
  )

  union all

  -- `anon` is the one actor that is a real Postgres role, so the grants can be read
  -- back and compared against what the matrix claims.
  select m.object_schema, m.object_name, m.object_kind, m.actor, 'contradiction'::text
  from app.access_matrix m
  join app.reachable_objects() r
    on r.object_schema = m.object_schema
   and r.object_name = m.object_name
   and r.object_kind = m.object_kind
  where m.actor = 'anon'
    and m.allowed is distinct from r.anon_reachable

  order by 1, 2, 3, 4
$$;

comment on function app.access_matrix_gaps() is
  'The completeness check. Empty means the matrix describes every reachable object; any row fails CI.';

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('server_clock', 'function', 'anon', true,
   'The sign-in screen shows the shop clock before anyone has signed in.'),
  ('server_clock', 'function', 'customer', true,
   'Ordering window, Same-day cutoff and the 7-day horizon are all judged against this.'),
  ('server_clock', 'function', 'driver', true,
   'The driver app compares fix ages and duty auto-end against the server, never the handset.'),
  ('server_clock', 'function', 'dispatcher', true,
   'The console displays it, so a dispatcher can see the clock every rule is judged by.')
on conflict do nothing;
