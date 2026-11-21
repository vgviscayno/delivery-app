-- Customer Addresses: a customer's saved places to receive Orders at. The pin is
-- authoritative; the formatted address, unit and landmark help a human find the door.
-- Exactly one undeleted Address per customer is the default: the first one saved, or
-- the one they choose, and deleting it promotes the most recently created survivor.
-- Only the owner reads or changes them.

begin;
select plan(27);

select set_config('t.lia', tests.create_user('customer')::text, true);

select app.pin_clock('2026-11-21 09:00:00+08');
select tests.authenticate_as(current_setting('t.lia')::uuid);

select set_config('t.home', public.save_address(
  id => null,
  label => 'Home',
  latitude => 14.5547,
  longitude => 121.0244,
  formatted_address => '12 Jupiter Street, Bel-Air, Makati City',
  unit => 'Unit 4B',
  landmark => 'Green gate beside the sari-sari store',
  arrival_contact_name => 'Lia Santos',
  arrival_contact_phone => '+639171234567'
)::text, true);

select results_eq(
  $$ select id, label, latitude, longitude, formatted_address, unit, landmark,
            arrival_contact_name, arrival_contact_phone, is_default
       from public.customer_addresses() $$,
  $$ values (current_setting('t.home')::uuid, 'Home'::text, 14.5547::float8, 121.0244::float8,
             '12 Jupiter Street, Bel-Air, Makati City'::text, 'Unit 4B'::text,
             'Green gate beside the sari-sari store'::text, 'Lia Santos'::text,
             '+639171234567'::text, true) $$,
  'a customer''s first Address is saved, read back whole, and becomes their default'
);

-- Saved later, so listed after the default whatever its age.
reset role;
select app.pin_clock('2026-11-21 09:05:00+08');
select tests.authenticate_as(current_setting('t.lia')::uuid);
select set_config('t.office', public.save_address(
  id => null, label => 'Office', latitude => 14.5866, longitude => 121.0566,
  formatted_address => null, unit => null, landmark => null,
  arrival_contact_name => 'Reception', arrival_contact_phone => '+63281234567'
)::text, true);

select results_eq(
  $$ select label, is_default from public.customer_addresses() $$,
  $$ values ('Home'::text, true), ('Office'::text, false) $$,
  'a later Address does not take the default'
);

select public.set_default_address(current_setting('t.office')::uuid);

select results_eq(
  $$ select label, is_default from public.customer_addresses() $$,
  $$ values ('Office'::text, true), ('Home'::text, false) $$,
  'a customer chooses their default, and the old one gives it up'
);

-- Deleting. Home (09:00) is the oldest, Mother's (09:10) the newest, Office the default.
reset role;
select app.pin_clock('2026-11-21 09:10:00+08');
select tests.authenticate_as(current_setting('t.lia')::uuid);
select set_config('t.mother', public.save_address(
  id => null, label => 'Mother''s', latitude => 14.6091, longitude => 121.0223,
  formatted_address => null, unit => null, landmark => null,
  arrival_contact_name => 'Rosa Santos', arrival_contact_phone => '+639181112222'
)::text, true);

select public.delete_address(current_setting('t.home')::uuid);

select results_eq(
  $$ select label, is_default from public.customer_addresses() $$,
  $$ values ('Office'::text, true), ('Mother''s'::text, false) $$,
  'deleting an Address that is not the default hides it and leaves the default alone'
);

-- Survivors of the next delete: Mother's (09:10), the oldest, and Home again (09:15).
reset role;
select app.pin_clock('2026-11-21 09:15:00+08');
select tests.authenticate_as(current_setting('t.lia')::uuid);
select set_config('t.home2', public.save_address(
  id => null, label => 'Home', latitude => 14.5547, longitude => 121.0244,
  formatted_address => null, unit => null, landmark => null,
  arrival_contact_name => 'Lia Santos', arrival_contact_phone => '+639171234567'
)::text, true);

select public.delete_address(current_setting('t.office')::uuid);

select results_eq(
  $$ select label, is_default from public.customer_addresses() $$,
  $$ values ('Home'::text, true), ('Mother''s'::text, false) $$,
  'deleting the default promotes the most recently created survivor'
);

select public.delete_address(current_setting('t.mother')::uuid);
select public.delete_address(current_setting('t.home2')::uuid);

select is_empty(
  $$ select * from public.customer_addresses() $$,
  'deleting the last Address leaves no default to promote'
);

select set_config('t.fresh', public.save_address(
  id => null, label => 'New home', latitude => 14.5547, longitude => 121.0244,
  formatted_address => null, unit => null, landmark => null,
  arrival_contact_name => 'Lia Santos', arrival_contact_phone => '+639171234567'
)::text, true);

select results_eq(
  $$ select label, is_default from public.customer_addresses() $$,
  $$ values ('New home'::text, true) $$,
  'after deleting them all, the next Address saved is the first again, and the default'
);

-- Editing replaces every field in place, the pin included: Orders already placed kept
-- their own copy.
select is(
  public.save_address(
    id => current_setting('t.fresh')::uuid, label => 'Home', latitude => 14.5600,
    longitude => 121.0300, formatted_address => '3 Mars Street, Bel-Air, Makati City',
    unit => '2F', landmark => 'Blue door', arrival_contact_name => 'Ana Santos',
    arrival_contact_phone => '+639190001111'
  ),
  current_setting('t.fresh')::uuid,
  'editing an Address returns the same Address'
);

select results_eq(
  $$ select label, latitude, longitude, formatted_address, unit, landmark,
            arrival_contact_name, arrival_contact_phone, is_default
       from public.customer_addresses() $$,
  $$ values ('Home'::text, 14.56::float8, 121.03::float8,
             '3 Mars Street, Bel-Air, Makati City'::text, '2F'::text, 'Blue door'::text,
             'Ana Santos'::text, '+639190001111'::text, true) $$,
  'an edit replaces every field, the pin included, and the Address stays the default'
);

-- Only the owner. Another customer sees none of Lia's Addresses, and cannot reach one
-- by id: it is simply not found, so its existence never leaks.
reset role;
select set_config('t.ben', tests.create_user('customer')::text, true);
select tests.authenticate_as(current_setting('t.ben')::uuid);

select is_empty(
  $$ select * from public.customer_addresses() $$,
  'another customer sees none of Lia''s Addresses'
);

select throws_ok(
  $$ select public.save_address(
       id => current_setting('t.fresh')::uuid, label => 'Mine now', latitude => 14.5,
       longitude => 121.0, formatted_address => null, unit => null, landmark => null,
       arrival_contact_name => 'Ben', arrival_contact_phone => '+639170000002') $$,
  'P0002', null,
  'another customer cannot edit Lia''s Address'
);

select throws_ok(
  $$ select public.set_default_address(current_setting('t.fresh')::uuid) $$,
  'P0002', null,
  'another customer cannot make Lia''s Address their default'
);

select throws_ok(
  $$ select public.delete_address(current_setting('t.fresh')::uuid) $$,
  'P0002', null,
  'another customer cannot delete Lia''s Address'
);

-- Drivers and dispatchers have no saved Addresses and cannot touch a customer's.
reset role;
select set_config('t.driver', tests.create_user('driver')::text, true);
select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);

create function pg_temp.refused(actor text, call text) returns text language plpgsql as $f$
begin
  perform tests.authenticate_as(current_setting('t.' || actor)::uuid);
  execute call;
  reset role;
  return 'allowed';
exception when insufficient_privilege then
  reset role;
  return 'refused';
end
$f$;

select results_eq(
  $$ select actor, call, pg_temp.refused(actor, sql)
       from (values ('driver'), ('dispatcher')) as actors (actor)
       cross join (values
         ('customer_addresses', 'select * from public.customer_addresses()'),
         ('save_address', $c$select public.save_address(null, 'Shop', 14.5, 121.0,
            null, null, null, 'Ana', '+639170000003')$c$),
         ('set_default_address', format('select public.set_default_address(%L)',
            current_setting('t.fresh'))),
         ('delete_address', format('select public.delete_address(%L)',
            current_setting('t.fresh')))
       ) as calls (call, sql)
      order by actor, call $$,
  $$ values
       ('dispatcher'::text, 'customer_addresses'::text, 'refused'::text),
       ('dispatcher', 'delete_address', 'refused'),
       ('dispatcher', 'save_address', 'refused'),
       ('dispatcher', 'set_default_address', 'refused'),
       ('driver', 'customer_addresses', 'refused'),
       ('driver', 'delete_address', 'refused'),
       ('driver', 'save_address', 'refused'),
       ('driver', 'set_default_address', 'refused') $$,
  'drivers and dispatchers are refused every Address RPC'
);

select tests.authenticate_as_anon();
select throws_ok($$ select * from public.customer_addresses() $$, '42501', null,
  'anon cannot list Addresses');
select throws_ok(
  $$ select public.save_address(null, 'x', 14.5, 121.0, null, null, null, 'x', '+639170000004') $$,
  '42501', null, 'anon cannot save an Address');
select throws_ok($$ select public.set_default_address(gen_random_uuid()) $$, '42501', null,
  'anon cannot choose a default');
select throws_ok($$ select public.delete_address(gen_random_uuid()) $$, '42501', null,
  'anon cannot delete an Address');
reset role;

-- And Lia still has hers, untouched.
select tests.authenticate_as(current_setting('t.lia')::uuid);
select results_eq(
  $$ select label, is_default from public.customer_addresses() $$,
  $$ values ('Home'::text, true) $$,
  'nothing anyone else tried changed Lia''s Address'
);
reset role;

-- A deactivated customer keeps their Addresses but can no longer use them.
select tests.deactivate(current_setting('t.lia')::uuid);
select tests.authenticate_as(current_setting('t.lia')::uuid);
select throws_ok($$ select * from public.customer_addresses() $$, '42501', null,
  'a deactivated customer cannot read their Addresses');
reset role;

-- No table is reachable from the API: the customer app goes through the RPCs.
select is(
  has_table_privilege('authenticated', 'app.addresses', 'select'),
  false,
  'authenticated clients cannot read the addresses table directly'
);

-- The default is per customer: Ben's first Address is his default although Lia has one.
select tests.authenticate_as(current_setting('t.ben')::uuid);
select set_config('t.ben_home', public.save_address(
  id => null, label => 'Home', latitude => 14.65, longitude => 121.05,
  formatted_address => null, unit => null, landmark => null,
  arrival_contact_name => 'Ben Cruz', arrival_contact_phone => '+639170000002'
)::text, true);
select results_eq(
  $$ select label, is_default from public.customer_addresses() $$,
  $$ values ('Home'::text, true) $$,
  'each customer has their own default'
);

-- What every Address must carry.
select throws_ok(
  $$ select public.save_address(null, '  ', 14.5, 121.0, null, null, null, 'Ben', '+639170000002') $$,
  '23514', null, 'an Address needs a label');
select throws_ok(
  $$ select public.save_address(null, 'Work', 14.5, 121.0, null, null, null, ' ', '+639170000002') $$,
  '23514', null, 'an Address needs an Arrival contact name');
select throws_ok(
  $$ select public.save_address(null, 'Work', 14.5, 121.0, null, null, null, 'Ben', '0917 000 0002') $$,
  '23514', null, 'an Arrival contact phone is stored in E.164, never as typed');
select throws_ok(
  $$ select public.save_address(null, 'Work', 14.5, 121.0, null, null, null, 'Ben', '+12025550123') $$,
  '23514', null, 'an Arrival contact phone is Philippine');
reset role;

-- Two saves racing for a customer's first Address could each see no default and both
-- claim it. The index is what makes "exactly one" hold then; nothing an RPC checks can.
select throws_ok(
  format(
    $$ insert into app.addresses (customer_id, label, pin, arrival_contact_name,
                                   arrival_contact_phone, is_default)
       values (%L, 'Race', 'SRID=4326;POINT(121 14.5)', 'Ben', '+639170000002', true) $$,
    current_setting('t.ben')
  ),
  '23505', null,
  'a customer can never hold two undeleted defaults'
);

select * from finish();
rollback;
