-- The role x resource matrix and its completeness check. Later tickets add rows to
-- the matrix; these tests make sure forgetting to is a build failure, not a silent
-- hole in the fail-closed story ADR 0002 chose Supabase for.

begin;
select plan(6);

select is_empty(
  $$ select * from app.access_matrix_gaps() $$,
  'the matrix describes every object a client can currently reach'
);

select results_eq(
  $$ select actor, allowed from app.access_matrix
     where object_name = 'server_clock' order by actor $$,
  $$ values ('anon', true), ('customer', true), ('dispatcher', true), ('driver', true) $$,
  'the server clock is listed for all four actors'
);

-- A new RPC in public. Postgres grants EXECUTE to PUBLIC by default, so this is
-- reachable by anon and authenticated the moment it exists -- and nothing says who
-- may call it.
create function public.matrix_probe() returns integer language sql stable as $probe$
  select 1
$probe$;

select isnt_empty(
  $$ select * from app.access_matrix_gaps()
     where object_name = 'matrix_probe' and gap = 'missing' $$,
  'a reachable RPC missing from the matrix is a gap'
);

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('matrix_probe', 'function', 'anon', true, 'probe'),
  ('matrix_probe', 'function', 'customer', true, 'probe'),
  ('matrix_probe', 'function', 'driver', true, 'probe'),
  ('matrix_probe', 'function', 'dispatcher', true, 'probe');

select is_empty(
  $$ select * from app.access_matrix_gaps() where object_name = 'matrix_probe' $$,
  'listing it for every actor closes the gap'
);

-- `anon` is the one actor backed by a real Postgres role, so the matrix can be held
-- against the grants: claiming a denial the grants do not enforce is a contradiction.
update app.access_matrix
   set allowed = false
 where object_name = 'matrix_probe' and actor = 'anon';

select results_eq(
  $$ select gap from app.access_matrix_gaps() where object_name = 'matrix_probe' $$,
  $$ values ('contradiction'::text) $$,
  'claiming anon is denied while anon still holds EXECUTE is a contradiction'
);

-- And a row left behind after the object goes away is stale.
drop function public.matrix_probe();

select results_eq(
  $$ select distinct gap from app.access_matrix_gaps() where object_name = 'matrix_probe' $$,
  $$ values ('stale'::text) $$,
  'matrix rows for an object no client can reach are stale'
);

select * from finish();
rollback;
