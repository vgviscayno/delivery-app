-- Profiles. Every Auth user is exactly one of dispatcher, driver or customer, may be
-- deactivated without being deleted, and has at most one push token.

begin;
select plan(11);

select set_config('t.customer', tests.sign_up('{}')::text, true);
select set_config('t.driver', tests.create_user('driver')::text, true);

select results_eq(
  $$ select role::text, active, deactivated_at, push_token
     from app.profiles where id = current_setting('t.customer')::uuid $$,
  $$ values ('customer'::text, true, null::timestamptz, null::text) $$,
  'a sign-up gets an active customer profile with no push token, in the same transaction'
);

select results_eq(
  $$ select role::text from app.profiles where id = current_setting('t.driver')::uuid $$,
  $$ values ('driver'::text) $$,
  'an account created with a role in app metadata gets that role'
);

select throws_ok(
  $$ select tests.create_user('manager') $$,
  '22P02', null,
  'there is no role outside dispatcher, driver and customer'
);

-- Active flag and deactivation time move together, so neither can lie about the other.
select throws_ok(
  $$ update app.profiles set active = false where id = current_setting('t.driver')::uuid $$,
  '23514', null,
  'an inactive profile without a deactivation time is refused'
);

select throws_ok(
  $$ update app.profiles set deactivated_at = app.now() where id = current_setting('t.driver')::uuid $$,
  '23514', null,
  'an active profile carrying a deactivation time is refused'
);

select app.pin_clock('2026-10-25 09:15:00+08');
select tests.deactivate(current_setting('t.driver')::uuid);

select results_eq(
  $$ select active, deactivated_at from app.profiles where id = current_setting('t.driver')::uuid $$,
  $$ values (false, '2026-10-25 09:15:00+08'::timestamptz) $$,
  'deactivation keeps the profile and records when, by the server clock'
);

-- One token, overwritten by whichever phone registered last.
update app.profiles set push_token = 'fcm-first-phone' where id = current_setting('t.customer')::uuid;
update app.profiles set push_token = 'fcm-second-phone' where id = current_setting('t.customer')::uuid;

select results_eq(
  $$ select push_token from app.profiles where id = current_setting('t.customer')::uuid $$,
  $$ values ('fcm-second-phone'::text) $$,
  'a new push token replaces the old one'
);

select throws_ok(
  $$ update app.profiles set push_token = '  ' where id = current_setting('t.customer')::uuid $$,
  '23514', null,
  'a blank push token is refused; no token is null'
);

select throws_ok(
  $$ update app.profiles set push_token = 'fcm-old-phone' where id = current_setting('t.driver')::uuid $$,
  '23514', null,
  'a deactivated profile cannot hold a push token'
);

-- Deleting the Auth user takes the profile with it.
delete from auth.users where id = current_setting('t.customer')::uuid;
select is_empty(
  $$ select 1 from app.profiles where id = current_setting('t.customer')::uuid $$,
  'deleting an Auth user deletes its profile'
);

-- Profiles are out of PostgREST's reach entirely.
select ok(
  not has_table_privilege('authenticated', 'app.profiles', 'SELECT'),
  'authenticated cannot read app.profiles directly'
);

select * from finish();
rollback;
