-- The dispatcher's side of drivers: the list with each one's On duty state, and
-- deactivation. Inviting goes through the `invite-driver` Edge Function, which creates
-- the Auth user with the role and name in app metadata -- as `tests.create_user` does.

begin;
select plan(14);

select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);
select set_config('t.ana', tests.create_user('driver', 'ana@test.courier.local', 'Ana Reyes')::text, true);
select set_config('t.ben', tests.create_user('driver', 'ben@test.courier.local', 'Ben Cruz')::text, true);
select set_config('t.customer', tests.create_user('customer')::text, true);

select results_eq(
  $$ select display_name from app.profiles where id = current_setting('t.ana')::uuid $$,
  $$ values ('Ana Reyes'::text) $$,
  'a driver created with a name in app metadata carries it'
);

select throws_ok(
  $$ select tests.create_user('driver', null, '  ') $$,
  '23514', null,
  'a driver without a name is refused'
);

select set_config('t.pretender', tests.sign_up('{"name": "Not Ana"}')::text, true);
select results_eq(
  $$ select display_name from app.profiles where id = current_setting('t.pretender')::uuid $$,
  $$ values (null::text) $$,
  'a public sign-up cannot name itself through its own metadata'
);

-- What the `invite-driver` Edge Function really does: GoTrue inserts the user, then
-- writes the app metadata in a second statement.
select set_config('t.lito', tests.admin_create_user('{"role": "driver", "name": "Lito Garcia"}')::text, true);
select results_eq(
  $$ select role::text, display_name from app.profiles where id = current_setting('t.lito')::uuid $$,
  $$ values ('driver'::text, 'Lito Garcia'::text) $$,
  'an invited driver is a driver, though GoTrue writes their app metadata after the row'
);

-- Once an account has been used, its role is settled: a later edit to app metadata
-- does not quietly turn a customer into staff.
update auth.users set last_sign_in_at = app.now() where id = current_setting('t.customer')::uuid;
update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role": "driver", "name": "Sneaky"}'
 where id = current_setting('t.customer')::uuid;
select results_eq(
  $$ select role::text, display_name from app.profiles where id = current_setting('t.customer')::uuid $$,
  $$ values ('customer'::text, null::text) $$,
  'an account that has signed in keeps its role whatever its app metadata later says'
);
select lives_ok(
  $$ update auth.users set last_sign_in_at = app.now() where id = current_setting('t.ana')::uuid $$,
  'an ordinary sign-in leaves the profile alone'
);

-- Ana signs in at 07:55; Ben and Lito have never been On duty.
select app.pin_clock('2026-11-06 07:55:00+08');
select tests.authenticate_as(current_setting('t.ana')::uuid);
select * from public.go_on_duty();
reset role;

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select results_eq(
  $$ select id, email, name, active, on_duty, on_duty_changed_at from public.dispatcher_drivers() $$,
  $$ values
       (current_setting('t.ana')::uuid, 'ana@test.courier.local'::text, 'Ana Reyes'::text,
        true, true, '2026-11-06 07:55:00+08'::timestamptz),
       (current_setting('t.ben')::uuid, 'ben@test.courier.local'::text, 'Ben Cruz'::text,
        true, false, null::timestamptz),
       (current_setting('t.lito')::uuid, current_setting('t.lito') || '@test.courier.local',
        'Lito Garcia'::text, true, false, null::timestamptz) $$,
  'the console lists every driver, by name, with their On duty state and no one else'
);
reset role;

-- Ana's phone has registered for pushes and holds a live session.
update app.profiles set push_token = 'fcm-van-1' where id = current_setting('t.ana')::uuid;
insert into auth.sessions (id, user_id) values (gen_random_uuid(), current_setting('t.ana')::uuid);

select app.pin_clock('2026-11-06 12:10:00+08');
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select public.deactivate_driver(current_setting('t.ana')::uuid);

select results_eq(
  $$ select id, active, deactivated_at, on_duty, on_duty_changed_at
     from public.dispatcher_drivers() where id = current_setting('t.ana')::uuid $$,
  $$ values (current_setting('t.ana')::uuid, false, '2026-11-06 12:10:00+08'::timestamptz,
             false, '2026-11-06 12:10:00+08'::timestamptz) $$,
  'a deactivated driver stays on the list, inactive and off duty, from the moment of deactivation'
);
reset role;

select results_eq(
  $$ select push_token from app.profiles where id = current_setting('t.ana')::uuid $$,
  $$ values (null::text) $$,
  'deactivation nulls the push token in the same step, so nobody is paged after leaving'
);

-- Auth itself turns them away: a ban refuses the password and every refresh token,
-- and the sessions they already hold are ended.
select ok(
  (select banned_until > app.now() + interval '100 years' from auth.users
    where id = current_setting('t.ana')::uuid),
  'a deactivated driver is banned from signing in'
);
select is_empty(
  $$ select 1 from auth.sessions where user_id = current_setting('t.ana')::uuid $$,
  'a deactivated driver''s sessions are ended'
);

-- Even a token minted before the ban gets nothing from the driver app's RPCs.
select tests.authenticate_as(current_setting('t.ana')::uuid);
select throws_ok(
  $$ select * from public.go_on_duty() $$,
  '42501', null,
  'a deactivated driver cannot go On duty'
);
reset role;

-- Only a dispatcher deactivates, and only drivers.
select tests.authenticate_as(current_setting('t.ben')::uuid);
select throws_ok(
  $$ select public.deactivate_driver(current_setting('t.ben')::uuid) $$,
  '42501', null,
  'a driver cannot deactivate anyone, themselves included'
);
reset role;

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select throws_ok(
  $$ select public.deactivate_driver(current_setting('t.customer')::uuid) $$,
  'P0002', null,
  'deactivate_driver deactivates drivers only'
);
reset role;

select * from finish();
rollback;
