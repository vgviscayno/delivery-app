-- Shop settings: the shop's rules as data. Every signed-in actor reads them through
-- `public.shop_settings()`; only an active dispatcher changes them.

begin;
select plan(12);

select set_config('t.customer', tests.create_user('customer')::text, true);

-- The values the business agreed on are there from the migration, before any seed.
select tests.authenticate_as(current_setting('t.customer')::uuid);
select results_eq(
  $$ select same_day_cutoff_buffer_minutes, end_of_day, dark_threshold_minutes
     from public.shop_settings() $$,
  $$ values (30, '16:00'::time, 10) $$,
  'a customer reads the agreed defaults'
);
reset role;

-- With only the anon key there is nobody to show the rules to.
select function_privs_are(
  'public', 'shop_settings', array[]::text[], 'anon', array[]::text[],
  'anon may not read the shop settings'
);

-- The dispatcher saves the whole set at once, as the console's form submits it.
select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);
select set_config('t.driver', tests.create_user('driver')::text, true);

create temporary table saved_settings as
  select 45 as buffer, 6000 as radius, 7500 as fee, '+639171234567'::text as phone,
         '17:00'::time as end_of_day, 12 as dark, '09:30'::time as morning;
grant select on saved_settings to authenticated;

create function pg_temp.save_as_desk() returns void language sql as $save$
  select public.update_shop_settings(
    same_day_cutoff_buffer_minutes => buffer,
    delivery_radius_meters => radius,
    delivery_fee_centavos => fee,
    shop_phone => phone,
    end_of_day => end_of_day,
    dark_threshold_minutes => dark,
    time_confirmation_cutoff => morning
  ) from saved_settings
$save$;
grant execute on function pg_temp.save_as_desk() to authenticated;

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select lives_ok($$ select pg_temp.save_as_desk() $$, 'a dispatcher saves the settings');
select results_eq(
  $$ select same_day_cutoff_buffer_minutes, delivery_radius_meters, delivery_fee_centavos,
            shop_phone, end_of_day, dark_threshold_minutes, time_confirmation_cutoff
     from public.shop_settings() $$,
  $$ select * from saved_settings $$,
  'what the dispatcher saved is what everyone reads'
);


-- Money is whole centavos and the Shop phone is E.164, whatever the console sends.
select throws_ok(
  $$ select public.update_shop_settings(30, 5000, -1, '+639171234567', '16:00', 10, '10:00') $$,
  '23514', null,
  'a negative Delivery fee is refused'
);
select throws_ok(
  $$ select public.update_shop_settings(30, 5000, 50.5, '+639171234567', '16:00', 10, '10:00') $$,
  '42883', null,
  'a Delivery fee in fractions of a centavo is not whole centavos'
);
select throws_ok(
  $$ select public.update_shop_settings(30, 5000, 5000, '0917 123 4567', '16:00', 10, '10:00') $$,
  '23514', null,
  'a Shop phone in local format is refused; it is stored as E.164'
);
select lives_ok(
  $$ select public.update_shop_settings(30, null, null, null, '16:00', 10, null) $$,
  'settings with no agreed value may be left empty'
);
reset role;

-- Customers and drivers read the rules; neither may change them.
select tests.authenticate_as(current_setting('t.customer')::uuid);
select throws_ok(
  $$ select pg_temp.save_as_desk() $$,
  '42501', 'only an active dispatcher may change the shop settings',
  'a customer may not change the shop settings'
);
reset role;

select tests.authenticate_as(current_setting('t.driver')::uuid);
select throws_ok($$ select pg_temp.save_as_desk() $$, '42501', null,
  'a driver may not change the shop settings');
reset role;

select tests.deactivate(current_setting('t.dispatcher')::uuid);
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select throws_ok($$ select pg_temp.save_as_desk() $$, '42501', null,
  'a deactivated dispatcher may not change the shop settings');
reset role;

select is(
  (select array_agg(p.privilege_type::text) from information_schema.routine_privileges p
   where p.routine_schema = 'public' and p.routine_name = 'update_shop_settings'
     and p.grantee in ('anon', 'PUBLIC')),
  null,
  'anon may not change the shop settings'
);

select * from finish();
rollback;
