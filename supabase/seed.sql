-- Demo data for a local database and for a PR's preview branch.
--
-- This is never a test input. pgTAP tests run after `supabase db reset --no-seed` and
-- build their own data with factory helpers, so nothing here can quietly become the
-- reason a test passes.
--
-- It must stay idempotent: `pnpm db:seed` is run by hand against preview branches
-- that have already been seeded once.
--
-- Every later ticket extends it. The shape the MVP spec asks for, filled in as the
-- tables arrive:
--
--   * shop settings          -- ticket 58 (delivery radius, fee, Ordering window, cutoffs)
--   * catalog                -- ticket 59 (per-unit and per-weight Products)
--   * one dispatcher         -- ticket 57 (below)
--   * two drivers            -- ticket 61
--   * a customer with        -- tickets 60, 64
--     sample Addresses

do $$
begin
  -- A seed that cannot see the schema it is meant to populate is a broken seed, and
  -- the failure should be loud rather than an empty database nobody notices.
  perform public.server_clock();
  raise notice 'Seed: schema reachable, shop clock reads %', (select local_time from public.server_clock());
end
$$;

-- One dispatcher, created the way the Admin API would create one: the role rides in
-- app metadata, and the profile trigger turns it into a dispatcher profile. Signs in to
-- the console as dispatcher@courier.local / dispatcher-demo.
--
-- A known password is fine here and nowhere else: the seed is never run against
-- production.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  -- GoTrue reads these as strings and cannot sign in a user whose tokens are null.
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000',
  'd1500000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'dispatcher@courier.local',
  extensions.crypt('dispatcher-demo', extensions.gen_salt('bf')),
  app.now(),
  '{"provider": "email", "providers": ["email"], "role": "dispatcher"}',
  '{}',
  app.now(),
  app.now(),
  '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
values (
  'd1500000-0000-4000-8000-000000000001',
  'd1500000-0000-4000-8000-000000000001',
  '{"sub": "d1500000-0000-4000-8000-000000000001", "email": "dispatcher@courier.local", "email_verified": true}',
  'email',
  app.now(),
  app.now(),
  app.now()
)
on conflict (provider_id, provider) do nothing;
