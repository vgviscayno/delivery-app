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
--   * one dispatcher         -- ticket 57
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
