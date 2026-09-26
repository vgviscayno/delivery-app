-- The server clock. Every later time rule is tested at its exact boundary by pinning
-- this clock, so the pin itself has to be trustworthy.

begin;
select plan(11);

select is(app.time_zone(), 'Asia/Manila', 'the shop keeps one time zone');

-- Pinned, the clock reads back exactly what it was given.
select app.pin_clock('2026-09-26 15:30:00+08'::timestamptz);
select is(
  app.now(),
  '2026-09-26 15:30:00+08'::timestamptz,
  'app.now() returns the pinned instant'
);
select is(
  app.now_local(),
  '2026-09-26 15:30:00'::timestamp,
  'app.now_local() is the Manila wall clock of that instant'
);
select is(app.today(), '2026-09-26'::date, 'app.today() is the Manila day of that instant');

-- The delivery day turns over at 16:00 UTC, not at midnight UTC. Same-day cutoff and
-- the 7-day horizon both hang off this, so it is pinned at the boundary itself.
select app.pin_clock('2026-09-26 15:59:59+00'::timestamptz);
select is(app.today(), '2026-09-26'::date, 'one second before 16:00 UTC it is still today');
select app.pin_clock('2026-09-26 16:00:00+00'::timestamptz);
select is(app.today(), '2026-09-27'::date, 'at 16:00 UTC the Manila day has rolled over');

-- The clock is transaction-stable: two reads in one statement agree.
select app.pin_clock('2026-01-02 08:00:00+08'::timestamptz);
select is(app.now(), app.now(), 'two reads in one transaction agree');

select is_empty(
  $$ select 1 where app.now() <> '2026-01-02 08:00:00+08'::timestamptz $$,
  'the pin holds for the rest of the transaction'
);

-- public.server_clock() is the only way a client learns the time.
select results_eq(
  $$ select local_time, local_date, time_zone from public.server_clock() $$,
  $$ values ('2026-01-02 08:00:00'::timestamp, '2026-01-02'::date, 'Asia/Manila'::text) $$,
  'public.server_clock() reports the pinned clock, ready to display'
);

-- Clients may read the clock; they may not set it. `app` is closed to them, which is
-- what keeps app.pin_clock out of reach over the API.
select function_privs_are(
  'public', 'server_clock', array[]::text[], 'anon', array['EXECUTE'],
  'anon may read the server clock'
);
select ok(
  not has_schema_privilege('authenticated', 'app', 'USAGE'),
  'authenticated has no USAGE on app, so app.pin_clock is unreachable over the API'
);

select * from finish();
rollback;
