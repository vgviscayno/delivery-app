-- Factory helpers for pgTAP, installed by scripts/test-db.mjs after the unseeded reset.
--
-- They live in `tests`, a schema no migration creates, so they never reach production
-- and PostgREST never serves them. Every test calls them inside its own transaction and
-- rolls the data back.

create schema if not exists tests;

revoke all on schema tests from public;

-- An Auth user, created the way the Admin API creates one: the role rides in
-- `raw_app_meta_data`, which only the service role can write. The profile trigger does
-- the rest, exactly as it does for a real sign-up.
create or replace function tests.create_user(
  role text default 'customer',
  email text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  user_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values (
    user_id,
    'authenticated',
    'authenticated',
    coalesce(email, user_id::text || '@test.courier.local'),
    case when create_user.role is null then '{}'::jsonb
         else jsonb_build_object('role', create_user.role) end,
    '{}'::jsonb
  );
  return user_id;
end
$$;

-- An Auth user created the way a sign-up through the public API creates one: whatever
-- the caller put in their own metadata, and nothing in app metadata.
create or replace function tests.sign_up(user_metadata jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  user_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values (
    user_id, 'authenticated', 'authenticated', user_id::text || '@test.courier.local',
    '{}'::jsonb, user_metadata
  );
  return user_id;
end
$$;

-- Become that user for the rest of the transaction, as PostgREST would after checking
-- their JWT. `reset role` (or the rollback) ends it.
create or replace function tests.authenticate_as(user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);
end
$$;

-- Become a caller holding only the anon key.
create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform pg_catalog.set_config('role', 'anon', true);
end
$$;

-- Soft-deactivate a profile, as the dispatcher's deactivation will (ticket 61).
create or replace function tests.deactivate(user_id uuid)
returns void
language sql
set search_path = ''
as $$
  update app.profiles
     set active = false, deactivated_at = app.now(), push_token = null
   where id = user_id
$$;
