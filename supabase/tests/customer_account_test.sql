-- Customer Account: every customer has an Account phone, given at sign-up and stored
-- E.164. The customer reads and changes their own; a dispatcher may read it, never
-- change it (ADR 0005). Drivers and anonymous callers get nothing.

begin;
select plan(20);

-- Sign-up: the phone rides in the caller's own metadata. The server only checks the
-- format; the app normalises what the customer typed.
select set_config('t.customer', tests.sign_up(
  '{"account_phone": "+639171234567"}'
)::text, true);

select results_eq(
  $$ select role::text, account_phone from app.profiles where id = current_setting('t.customer')::uuid $$,
  $$ values ('customer'::text, '+639171234567'::text) $$,
  'a sign-up stores the Account phone it was given'
);

select throws_ok(
  $$ select tests.sign_up('{"account_phone": "0917 123 4567"}') $$,
  '23514', null,
  'an Account phone not in E.164 is refused'
);

select throws_ok(
  $$ select tests.sign_up('{"account_phone": "+12025550123"}') $$,
  '23514', null,
  'an Account phone outside the Philippines is refused'
);

select throws_ok(
  $$ select tests.sign_up('{"account_phone": "+63281234567"}') $$,
  '23514', null,
  'a landline is not an Account phone: it is a mobile'
);

-- The requirement is checked at commit, not at insert: a driver invite creates the
-- profile as a customer and writes the driver role a statement later.
select throws_ok(
  $$ do $do$ begin
       perform tests.sign_up('{}');
       set constraints app.profiles_customer_has_account_phone immediate;
     end $do$ $$,
  '23502', null,
  'a customer cannot be created without an Account phone'
);

select lives_ok(
  $$ do $do$ begin
       perform tests.admin_create_user('{"role": "driver", "name": "Ben Cruz"}');
       set constraints app.profiles_customer_has_account_phone immediate;
     end $do$ $$,
  'a driver invite needs no Account phone, though it starts life as a customer'
);
set constraints app.profiles_customer_has_account_phone deferred;

select set_config('t.driver', tests.create_user('driver')::text, true);
select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);

select throws_ok(
  $$ update app.profiles set account_phone = '+639171234567' where id = current_setting('t.driver')::uuid $$,
  '23514', null,
  'only customers hold an Account phone'
);

-- Re-roled before the first sign-in, the account stops being a customer and loses the
-- phone with it.
select set_config('t.rerolled', tests.sign_up('{"account_phone": "+639170000001"}')::text, true);
update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role": "driver", "name": "Cora Diaz"}'
 where id = current_setting('t.rerolled')::uuid;
select results_eq(
  $$ select role::text, account_phone from app.profiles where id = current_setting('t.rerolled')::uuid $$,
  $$ values ('driver'::text, null::text) $$,
  'an account re-roled away from customer drops its Account phone'
);

-- The customer: reads and changes their own Account, and only their own.
select tests.authenticate_as(current_setting('t.customer')::uuid);

select results_eq(
  $$ select id, email, account_phone from public.customer_account() $$,
  $$ values (current_setting('t.customer')::uuid,
             current_setting('t.customer') || '@test.courier.local',
             '+639171234567'::text) $$,
  'a customer reads their own Account'
);

select results_eq(
  $$ select account_phone from public.update_account_phone('+639189876543') $$,
  $$ values ('+639189876543'::text) $$,
  'a customer changes their own Account phone'
);

select results_eq(
  $$ select account_phone from public.customer_account() $$,
  $$ values ('+639189876543'::text) $$,
  'the change is what the Account shows next'
);

select throws_ok(
  $$ select * from public.update_account_phone('0918 987 6543') $$,
  '23514', null,
  'a customer cannot store an Account phone not in E.164'
);

select throws_ok(
  $$ select public.customer_account_phone(current_setting('t.customer')::uuid) $$,
  '42501', null,
  'a customer cannot use the dispatcher''s lookup, even on themselves'
);
reset role;

-- The dispatcher: reads a customer's Account phone, never changes it.
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);

select is(
  public.customer_account_phone(current_setting('t.customer')::uuid),
  '+639189876543',
  'a dispatcher reads a customer''s Account phone'
);

select throws_ok(
  $$ select public.customer_account_phone(current_setting('t.driver')::uuid) $$,
  'P0002', null,
  'a dispatcher looking up a driver finds no customer'
);

select throws_ok(
  $$ select * from public.update_account_phone('+639170000002') $$,
  '42501', null,
  'a dispatcher cannot change an Account phone'
);

select throws_ok(
  $$ select * from public.customer_account() $$,
  '42501', null,
  'a dispatcher has no customer Account of their own'
);
reset role;

-- Drivers get nothing. These back up the matrix's denials, which the harness can only
-- check for anon.
select tests.authenticate_as(current_setting('t.driver')::uuid);
select throws_ok(
  $$ select * from public.customer_account() $$,
  '42501', null,
  'a driver has no customer Account'
);
select throws_ok(
  $$ select public.customer_account_phone(current_setting('t.customer')::uuid) $$,
  '42501', null,
  'a driver cannot read a customer''s Account phone'
);
reset role;

-- A deactivated customer is refused like anyone else who may not be there.
select tests.deactivate(current_setting('t.customer')::uuid);
select tests.authenticate_as(current_setting('t.customer')::uuid);
select throws_ok(
  $$ select * from public.customer_account() $$,
  '42501', null,
  'a deactivated customer cannot read their Account'
);
reset role;

select * from finish();
rollback;
