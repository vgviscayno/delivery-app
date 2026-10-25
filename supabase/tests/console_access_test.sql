-- Who may use the dispatcher console. `public.console_profile()` is the one question the
-- console asks after a sign-in, and the server, not the browser, answers it.
--
-- The users are held in transaction-local settings so they stay readable after the
-- test has stopped being `postgres`.

begin;
select plan(7);

select set_config('t.dispatcher', tests.create_user('dispatcher', 'desk@test.courier.local')::text, true);

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);

select results_eq(
  $$ select id, email from public.console_profile() $$,
  $$ values (current_setting('t.dispatcher')::uuid, 'desk@test.courier.local'::text) $$,
  'a dispatcher signs in to the console as themselves'
);

reset role;

-- Customers and drivers share the one Auth instance; the console is not theirs. These
-- back up the matrix's denials, which the harness cannot check on its own.
select set_config('t.customer', tests.create_user('customer')::text, true);
select set_config('t.driver', tests.create_user('driver')::text, true);

select tests.authenticate_as(current_setting('t.customer')::uuid);
select throws_ok(
  $$ select * from public.console_profile() $$,
  '42501', 'only an active dispatcher may use the console',
  'a customer is refused the console'
);
reset role;

select tests.authenticate_as(current_setting('t.driver')::uuid);
select throws_ok(
  $$ select * from public.console_profile() $$,
  '42501', null,
  'a driver is refused the console'
);
reset role;

-- A sign-up through the public API decides its own user metadata. Claiming to be a
-- dispatcher there gets you a customer.
select set_config('t.pretender', tests.sign_up('{"role": "dispatcher"}')::text, true);
select tests.authenticate_as(current_setting('t.pretender')::uuid);
select throws_ok(
  $$ select * from public.console_profile() $$,
  '42501', null,
  'claiming the dispatcher role in your own sign-up metadata does not make you one'
);
reset role;

-- Deactivation is soft, and a deactivated dispatcher is refused like anyone else.
select tests.deactivate(current_setting('t.dispatcher')::uuid);
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select throws_ok(
  $$ select * from public.console_profile() $$,
  '42501', null,
  'a deactivated dispatcher is refused the console'
);
reset role;

-- The role is flat and nothing assumes there is only one dispatcher.
select set_config('t.second_desk', tests.create_user('dispatcher')::text, true);
select tests.authenticate_as(current_setting('t.second_desk')::uuid);
select results_eq(
  $$ select id from public.console_profile() $$,
  $$ values (current_setting('t.second_desk')::uuid) $$,
  'a second dispatcher signs in just as the first does'
);
reset role;

-- With only the anon key there is nobody to describe, and the function is not granted.
select function_privs_are(
  'public', 'console_profile', array[]::text[], 'anon', array[]::text[],
  'anon may not call console_profile'
);

select * from finish();
rollback;
