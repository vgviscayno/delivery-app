-- The one server clock.
--
-- Every later time rule -- the Ordering window, the Same-day cutoff, the 7-day horizon,
-- the Time confirmation morning cut-off, duty auto-end, fix staleness -- reads time
-- through `app.now()` and nothing else. No migration, RPC, view or trigger may call
-- `now()`, `current_timestamp` or `clock_timestamp()` directly.
--
-- It is overridable so tests can stand at the exact boundary of a rule instead of
-- waiting for one. The override is a transaction-local GUC, so it cannot leak out of
-- the transaction that set it, and `app.pin_clock` is unreachable from PostgREST:
-- it lives in `app`, which anon and authenticated have no USAGE on.

create or replace function app.time_zone()
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$ select 'Asia/Manila'::text $$;

comment on function app.time_zone() is
  'The shop''s only time zone. Wall-clock rules are stated in it; instants are stored as timestamptz.';

create or replace function app.now()
returns timestamptz
language sql
stable
parallel safe
set search_path = ''
as $$
  select coalesce(
    nullif(pg_catalog.current_setting('courier.now', true), '')::timestamptz,
    pg_catalog.now()
  );
$$;

comment on function app.now() is
  'The server clock, as an instant. Transaction-stable. Pinned by app.pin_clock in tests.';

create or replace function app.now_local()
returns timestamp
language sql
stable
parallel safe
set search_path = ''
as $$ select app.now() at time zone app.time_zone() $$;

comment on function app.now_local() is
  'The server clock as an Asia/Manila wall clock, for rules stated as a time of day.';

create or replace function app.today()
returns date
language sql
stable
parallel safe
set search_path = ''
as $$ select app.now_local()::date $$;

comment on function app.today() is
  'The current delivery day in Asia/Manila. Rolls over at 16:00 UTC.';

create or replace function app.pin_clock(at timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$ begin perform pg_catalog.set_config('courier.now', at::text, true); end $$;

comment on function app.pin_clock(timestamptz) is
  'Pins app.now() for the rest of the current transaction. Tests only.';

create or replace function app.unpin_clock()
returns void
language plpgsql
volatile
set search_path = ''
as $$ begin perform pg_catalog.set_config('courier.now', '', true); end $$;

comment on function app.unpin_clock() is 'Releases a pin set by app.pin_clock.';

-- The client-facing read of the clock. Clients never compute a Manila date themselves;
-- they are told one. SECURITY DEFINER because `app` is closed to them.

create or replace function public.server_clock()
returns table (
  instant timestamptz,
  local_time timestamp,
  local_date date,
  time_zone text
)
language sql
stable
security definer
set search_path = ''
as $$ select app.now(), app.now_local(), app.today(), app.time_zone() $$;

comment on function public.server_clock() is
  'The server clock, ready to display. The only way a client learns what time the shop thinks it is.';

revoke execute on function public.server_clock() from public;
grant execute on function public.server_clock() to anon, authenticated, service_role;
