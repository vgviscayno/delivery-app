-- On duty: signing in to the driver app is going On duty, signing out is coming off.
-- A flag plus the time it last changed, and nothing else -- no history is kept.

begin;
select plan(8);

select set_config('t.driver', tests.create_user('driver', 'ana@test.courier.local', 'Ana Reyes')::text, true);

select app.pin_clock('2026-11-06 07:55:00+08');
select tests.authenticate_as(current_setting('t.driver')::uuid);

select results_eq(
  $$ select id, email, name, on_duty, on_duty_changed_at from public.go_on_duty() $$,
  $$ values (current_setting('t.driver')::uuid, 'ana@test.courier.local'::text, 'Ana Reyes'::text,
             true, '2026-11-06 07:55:00+08'::timestamptz) $$,
  'signing in puts a driver On duty, stamped by the server clock'
);

-- The flag did not change, so neither does the time it last changed: picking up a
-- second phone mid-shift is not a new shift.
reset role;
select app.pin_clock('2026-11-06 11:30:00+08');
select tests.authenticate_as(current_setting('t.driver')::uuid);
select results_eq(
  $$ select on_duty, on_duty_changed_at from public.go_on_duty() $$,
  $$ values (true, '2026-11-06 07:55:00+08'::timestamptz) $$,
  'signing in again while On duty keeps the time they went On duty'
);

reset role;
select app.pin_clock('2026-11-06 15:40:00+08');
select tests.authenticate_as(current_setting('t.driver')::uuid);
select results_eq(
  $$ select on_duty, on_duty_changed_at from public.go_off_duty() $$,
  $$ values (false, '2026-11-06 15:40:00+08'::timestamptz) $$,
  'signing out takes a driver off duty, stamped by the server clock'
);

select results_eq(
  $$ select on_duty, on_duty_changed_at from public.driver_profile() $$,
  $$ values (false, '2026-11-06 15:40:00+08'::timestamptz) $$,
  'the driver app reads the same state back when it resumes a stored session'
);
reset role;

-- Nobody but a driver goes On duty. These back up the matrix's denials, which the
-- harness can only check for anon.
select set_config('t.customer', tests.create_user('customer')::text, true);
select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);

select tests.authenticate_as(current_setting('t.customer')::uuid);
select throws_ok(
  $$ select * from public.go_on_duty() $$,
  '42501', 'only an active driver may use the driver app',
  'a customer cannot go On duty'
);
reset role;

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select throws_ok(
  $$ select * from public.go_on_duty() $$,
  '42501', null,
  'a dispatcher cannot go On duty'
);
select throws_ok(
  $$ select * from public.driver_profile() $$,
  '42501', null,
  'a dispatcher is not a driver to the driver app'
);
reset role;

select function_privs_are(
  'public', 'go_on_duty', array[]::text[], 'anon', array[]::text[],
  'anon may not call go_on_duty'
);

select * from finish();
rollback;
