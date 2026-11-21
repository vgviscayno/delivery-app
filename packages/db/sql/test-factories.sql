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
  email text default null,
  name text default null
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
    jsonb_strip_nulls(jsonb_build_object(
      'role', create_user.role,
      -- Every driver has a name; one a test did not choose gets a placeholder.
      'name', coalesce(
        create_user.name,
        case when create_user.role = 'driver' then 'Test driver' end
      )
    )),
    -- Every customer gives an Account phone at sign-up; one a test did not choose gets
    -- a placeholder.
    case when create_user.role = 'customer'
      then '{"account_phone": "+639170000000"}'::jsonb
      else '{}'::jsonb
    end
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

-- Become that user with the clock pinned at `at`, from whatever role the test is in.
-- `app.pin_clock` is out of reach once a test has become `authenticated`, so moving the
-- clock otherwise takes `reset role`, the pin, and `authenticate_as`, in that order.
-- The `reset role` here works from any role because SET ROLE is checked against the
-- session user, postgres. Invoker rights on purpose: a security-definer function may
-- not change role.
create or replace function tests.authenticate_as_at(user_id uuid, at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
begin
  reset role;
  perform app.pin_clock(at);
  perform tests.authenticate_as(user_id);
end
$$;

-- Reachable mid-test, while the test is a customer, driver or dispatcher. The schema
-- exists only in local and CI databases, and PostgREST never serves it.
-- Only this helper: every other factory stays postgres-only.
grant usage on schema tests to authenticated;
revoke execute on function tests.authenticate_as_at(uuid, timestamptz) from public;
grant execute on function tests.authenticate_as_at(uuid, timestamptz) to authenticated;

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

-- Soft-deactivate a profile directly, for a role `public.deactivate_driver` does not
-- cover, such as a dispatcher.
create or replace function tests.deactivate(user_id uuid)
returns void
language sql
set search_path = ''
as $$
  update app.profiles
     set active = false, deactivated_at = app.now(), push_token = null, on_duty = false
   where id = user_id
$$;

-- An Auth user created as GoTrue's `admin.createUser` really does it: the row is
-- inserted with only the provider in app metadata, and the caller's app metadata is
-- written by a second statement in the same transaction.
create or replace function tests.admin_create_user(app_metadata jsonb, email text default null)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  user_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values (
    user_id, 'authenticated', 'authenticated',
    coalesce(email, user_id::text || '@test.courier.local'),
    '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb
  );

  update auth.users u
     set raw_app_meta_data = u.raw_app_meta_data || app_metadata
   where u.id = user_id;

  return user_id;
end
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function. Now that `authenticated`
-- can reach the schema, take that back from every factory but the one granted above.
do $$
declare
  factory regprocedure;
begin
  for factory in
    select p.oid::regprocedure from pg_catalog.pg_proc p
    where p.pronamespace = 'tests'::regnamespace
      and p.oid <> 'tests.authenticate_as_at(uuid, timestamptz)'::regprocedure
  loop
    execute format('revoke execute on function %s from public', factory);
  end loop;
end
$$;
