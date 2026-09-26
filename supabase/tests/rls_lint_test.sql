-- The RLS lint. CI runs the same query; these tests prove it both passes on the
-- schema we ship and actually catches a table shipped with row security off.

begin;
select plan(3);

select is_empty(
  $$ select * from app.tables_without_rls() $$,
  'no table in an exposed schema ships with row security off'
);

-- A table created the careless way, and rolled back with the transaction.
create table public.lint_probe (id integer primary key);

select isnt_empty(
  $$ select * from app.tables_without_rls() where object_name = 'lint_probe' $$,
  'the lint flags a public table created without row security'
);

alter table public.lint_probe enable row level security;

select is_empty(
  $$ select * from app.tables_without_rls() where object_name = 'lint_probe' $$,
  'enabling row security clears the flag'
);

select * from finish();
rollback;
