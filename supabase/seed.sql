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
--   * shop settings          -- ticket 58 (below)
--   * catalog                -- ticket 59 (below)
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

-- Shop settings. The migration already holds the values the business agreed on (the
-- 30-minute Same-day cutoff buffer, 16:00 end of day, 10-minute dark threshold); these
-- fill in the ones nobody has decided yet, so every screen has something to show.
-- Placeholders all: the radius, fee, hours, cut-off and phone are guesses, and the QR
-- Ph image is a checkerboard nobody can pay to.
--
-- The image itself is uploaded from supabase/seed/shop by `[storage.buckets.shop]` in
-- config.toml: on every local `db reset`, and with `supabase seed buckets` on a preview
-- database. Like this file, never against production.
update app.shop_settings
   set delivery_radius_meters = 5000,
       delivery_fee_centavos = 5000,
       shop_phone = '+639170000000',
       qr_ph_image_path = 'qr-ph/placeholder.png',
       time_confirmation_cutoff = '10:00'
 where id;

-- Monday to Saturday, 08:00-16:00: the drivers' working day.
insert into app.ordering_hours (weekday, opens_at, closes_at)
select weekday, '08:00', '16:00'
from generate_series(1, 6) as weekday
on conflict (weekday) do nothing;

-- One closure, so the list is never empty on a fresh database.
insert into app.shop_closures (closed_on, note)
values ('2026-12-25', 'Christmas Day (placeholder)')
on conflict (closed_on) do nothing;

-- The catalog: per-weight cuts at a rate per kg, and per-unit packs, across five
-- Categories. Some Products sit in two Categories, at different positions in each, and
-- one is unavailable, so every state the console and the customer app show has an
-- example. Prices are placeholders in the range a Metro Manila butcher charges.
insert into app.categories (id, name, position) values
  ('ca700000-0000-4000-8000-000000000001', 'Beef', 1),
  ('ca700000-0000-4000-8000-000000000002', 'Pork', 2),
  ('ca700000-0000-4000-8000-000000000003', 'Chicken', 3),
  ('ca700000-0000-4000-8000-000000000004', 'Ready to cook', 4),
  ('ca700000-0000-4000-8000-000000000005', 'For the grill', 5)
on conflict (id) do nothing;

insert into app.products (
  id, name, description, price_type, unit_price_centavos, price_per_kg_centavos,
  weight_step_grams, tolerance_grams, available
) values
  ('9d000000-0000-4000-8000-000000000001', 'Ribeye',
   'Grain-fed, cut to order about 2 cm thick.',
   'per_weight', null, 120000, 250, 50, true),
  ('9d000000-0000-4000-8000-000000000002', 'Beef brisket',
   'For nilaga and slow braises.',
   'per_weight', null, 52000, 500, 250, true),
  ('9d000000-0000-4000-8000-000000000003', 'Ground beef',
   '80/20, ground fresh each morning.',
   'per_weight', null, 42000, 250, 100, true),
  ('9d000000-0000-4000-8000-000000000004', 'Pork belly (liempo)',
   'Skin on. Sliced for grilling or whole for lechon kawali.',
   'per_weight', null, 38000, 500, 250, true),
  ('9d000000-0000-4000-8000-000000000005', 'Pork shoulder (kasim)',
   null,
   'per_weight', null, 32000, 500, 250, true),
  ('9d000000-0000-4000-8000-000000000006', 'Whole chicken',
   'Dressed, about 1.2 kg each.',
   'per_weight', null, 22000, 1000, 300, true),
  ('9d000000-0000-4000-8000-000000000007', 'Chicken thigh fillet',
   'Boneless, skinless.',
   'per_weight', null, 28000, 500, 250, false),
  ('9d000000-0000-4000-8000-000000000008', 'Garlic longganisa, 500 g pack',
   'Sweet and garlicky, made in-house.',
   'per_unit', 18500, null, null, null, true),
  ('9d000000-0000-4000-8000-000000000009', 'Pork tocino, 450 g pack',
   null,
   'per_unit', 16500, null, null, null, true),
  ('9d000000-0000-4000-8000-00000000000a', 'Beef tapa, 400 g pack',
   'Cured overnight in garlic and calamansi.',
   'per_unit', 24000, null, null, null, true),
  ('9d000000-0000-4000-8000-00000000000b', 'Chicken barbecue skewers, pack of 10',
   'Marinated and skewered, ready for the grill.',
   'per_unit', 32000, null, null, null, true),
  ('9d000000-0000-4000-8000-00000000000c', 'Hungarian sausages, 4 pieces',
   null,
   'per_unit', 28000, null, null, null, true)
on conflict (id) do nothing;

insert into app.product_categories (category_id, product_id, position) values
  ('ca700000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000001', 1),
  ('ca700000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000002', 2),
  ('ca700000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-000000000003', 3),
  ('ca700000-0000-4000-8000-000000000001', '9d000000-0000-4000-8000-00000000000a', 4),

  ('ca700000-0000-4000-8000-000000000002', '9d000000-0000-4000-8000-000000000004', 1),
  ('ca700000-0000-4000-8000-000000000002', '9d000000-0000-4000-8000-000000000005', 2),
  ('ca700000-0000-4000-8000-000000000002', '9d000000-0000-4000-8000-000000000008', 3),
  ('ca700000-0000-4000-8000-000000000002', '9d000000-0000-4000-8000-000000000009', 4),

  ('ca700000-0000-4000-8000-000000000003', '9d000000-0000-4000-8000-000000000006', 1),
  ('ca700000-0000-4000-8000-000000000003', '9d000000-0000-4000-8000-000000000007', 2),
  ('ca700000-0000-4000-8000-000000000003', '9d000000-0000-4000-8000-00000000000b', 3),

  ('ca700000-0000-4000-8000-000000000004', '9d000000-0000-4000-8000-000000000008', 1),
  ('ca700000-0000-4000-8000-000000000004', '9d000000-0000-4000-8000-000000000009', 2),
  ('ca700000-0000-4000-8000-000000000004', '9d000000-0000-4000-8000-00000000000a', 3),
  ('ca700000-0000-4000-8000-000000000004', '9d000000-0000-4000-8000-00000000000c', 4),

  ('ca700000-0000-4000-8000-000000000005', '9d000000-0000-4000-8000-00000000000b', 1),
  ('ca700000-0000-4000-8000-000000000005', '9d000000-0000-4000-8000-000000000004', 2),
  ('ca700000-0000-4000-8000-000000000005', '9d000000-0000-4000-8000-000000000001', 3),
  ('ca700000-0000-4000-8000-000000000005', '9d000000-0000-4000-8000-00000000000c', 4)
on conflict (product_id, category_id) do nothing;
