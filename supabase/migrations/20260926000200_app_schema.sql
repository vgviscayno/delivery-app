-- `app` is the server's private workshop: the clock, and the security harness that
-- guards every later migration. Nothing in here is reachable from PostgREST — the
-- API only exposes the schemas listed in `api.schemas` in supabase/config.toml, and
-- `app` is deliberately not one of them.
--
-- Client-facing surface goes in `public` (RPCs and views), never here.

create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to postgres, service_role;

comment on schema app is
  'Server-internal helpers. Not exposed through PostgREST; anon and authenticated have no USAGE.';
