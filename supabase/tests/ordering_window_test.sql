-- The Ordering window and closure dates: which days the shop delivers, and from when to
-- when. Every signed-in actor reads them; only an active dispatcher changes them.

begin;
select plan(11);

select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);
select set_config('t.customer', tests.create_user('customer')::text, true);
select set_config('t.driver', tests.create_user('driver')::text, true);

-- No weekday is open until someone says it is: the hours are not agreed yet.
select tests.authenticate_as(current_setting('t.customer')::uuid);
select is_empty(
  $$ select * from public.ordering_window() $$,
  'no weekday is open before the dispatcher opens one'
);
reset role;

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select public.set_ordering_day(1, '08:00', '16:00');
select public.set_ordering_day(6, '09:00', '12:00');
select public.set_ordering_day(6, '09:00', '13:00');
reset role;

select tests.authenticate_as(current_setting('t.customer')::uuid);
select results_eq(
  $$ select weekday, opens_at, closes_at from public.ordering_window() order by weekday $$,
  $$ values (1, '08:00'::time, '16:00'::time), (6, '09:00'::time, '13:00'::time) $$,
  'a customer reads the open weekdays, each with its latest hours'
);
reset role;

-- Closing a weekday is setting it to no hours.
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select public.set_ordering_day(6, null, null);
select results_eq(
  $$ select weekday from public.ordering_window() $$,
  $$ values (1) $$,
  'a weekday given no hours is closed'
);

select throws_ok(
  $$ select public.set_ordering_day(2, '16:00', '08:00') $$,
  '23514', null,
  'a weekday cannot close before it opens'
);
select throws_ok(
  $$ select public.set_ordering_day(8, '08:00', '16:00') $$,
  '23514', null,
  'weekdays run Monday 1 to Sunday 7'
);
select throws_ok(
  $$ select public.set_ordering_day(2, '08:00', null) $$,
  '22023', null,
  'a weekday is open with both times or closed with neither'
);
reset role;

-- Closure dates. Past ones no longer bear on any rule, so nobody is shown them.
select app.pin_clock('2026-12-20 09:00+08');
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select public.add_shop_closure('2026-12-25', 'Christmas');
select public.add_shop_closure('2026-12-01', 'Already past');
select public.add_shop_closure('2026-12-25', 'Christmas Day');
select public.add_shop_closure('2027-01-01', null);
select public.remove_shop_closure('2027-01-01');
reset role;

select tests.authenticate_as(current_setting('t.driver')::uuid);
select results_eq(
  $$ select closed_on, note from public.shop_closures() $$,
  $$ values ('2026-12-25'::date, 'Christmas Day'::text) $$,
  'a driver reads the closures still to come, each with its latest note'
);
reset role;

-- Customers and drivers read; neither writes.
select tests.authenticate_as(current_setting('t.customer')::uuid);
select throws_ok($$ select public.set_ordering_day(1, '07:00', '16:00') $$, '42501', null,
  'a customer may not change the Ordering window');
select throws_ok($$ select public.add_shop_closure('2026-12-31', null) $$, '42501', null,
  'a customer may not add a closure');
reset role;

select tests.authenticate_as(current_setting('t.driver')::uuid);
select throws_ok($$ select public.remove_shop_closure('2026-12-25') $$, '42501', null,
  'a driver may not remove a closure');
reset role;

select tests.authenticate_as_anon();
select throws_ok($$ select * from public.ordering_window() $$, '42501', null,
  'anon may not read the Ordering window');
reset role;

select * from finish();
rollback;
