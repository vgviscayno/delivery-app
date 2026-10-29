-- Products: the dispatcher maintains them on the console; customers read the available,
-- undeleted ones through `public.catalog_products`.

begin;
select plan(29);

select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);
select set_config('t.customer', tests.create_user('customer')::text, true);

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select set_config('t.sausages', public.save_product(
  id => null,
  name => 'Garlic longganisa, 500 g pack',
  description => 'Sweet, garlicky, made in-house.',
  photo_url => null,
  price_type => 'per_unit',
  unit_price_centavos => 18500,
  price_per_kg_centavos => null,
  weight_step_grams => null,
  tolerance_grams => null
)::text, true);
reset role;

select tests.authenticate_as(current_setting('t.customer')::uuid);
select results_eq(
  $$ select name, price_type, unit_price_centavos, price_per_kg_centavos
     from public.catalog_products where id = current_setting('t.sausages')::uuid $$,
  $$ values ('Garlic longganisa, 500 g pack'::text, 'per_unit'::text, 18500, null::integer) $$,
  'a customer reads a per-unit Product the dispatcher added'
);
reset role;

-- Per-weight: a rate per kg, a step that is also the minimum, and a tolerance that
-- defaults to 250 g.
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select set_config('t.ribeye', public.save_product(
  null, 'Ribeye', null, null, 'per_weight', null, 120000, 250, null
)::text, true);
select results_eq(
  $$ select price_type, price_per_kg_centavos, weight_step_grams, tolerance_grams
     from public.catalog_products where id = current_setting('t.ribeye')::uuid $$,
  $$ values ('per_weight'::text, 120000, 250, 250) $$,
  'a per-weight Product keeps its rate per kg and gets a 250 g tolerance by default'
);
select lives_ok(
  $$ select public.save_product(null, 'Pork belly', null, null, 'per_weight', null, 38000, 500, 600) $$,
  'a tolerance at or past the step is allowed; the console warns about it instead'
);
select throws_ok(
  $$ select public.save_product(null, 'Pork belly', null, null, 'per_weight', null, 38000, null, 250) $$,
  '23514', null,
  'a per-weight Product needs a step'
);
select throws_ok(
  $$ select public.save_product(null, 'Pork belly', null, null, 'per_weight', null, null, 500, 250) $$,
  '23514', null,
  'a per-weight Product needs a rate per kg'
);
select throws_ok(
  $$ select public.save_product(null, 'Pork belly', null, null, 'per_weight', 38000, 38000, 500, 250) $$,
  '23514', null,
  'a per-weight Product carries no unit price'
);
select throws_ok(
  $$ select public.save_product(null, 'Tocino', null, null, 'per_unit', null, null, null, null) $$,
  '23514', null,
  'a per-unit Product needs a unit price'
);
select throws_ok(
  $$ select public.save_product(null, 'Tocino', null, null, 'per_unit', 16000, null, 250, null) $$,
  '23514', null,
  'a per-unit Product carries no weight step'
);
select throws_ok(
  $$ select public.save_product(null, 'Tocino', null, null, 'per_unit', 160.5, null, null, null) $$,
  '42883', null,
  'a price in fractions of a centavo is not whole centavos'
);
select throws_ok(
  $$ select public.save_product(null, 'Tocino', null, null, 'by_the_tray', 16000, null, null, null) $$,
  '22P02', null,
  'there are only two price types'
);
select throws_ok(
  $$ select public.save_product(null, '  ', null, null, 'per_unit', 16000, null, null, null) $$,
  '23514', null,
  'a Product needs a name'
);

-- Editing replaces every field, price type included.
select lives_ok(
  $$ select public.save_product(current_setting('t.sausages')::uuid,
       'Garlic longganisa, 1 kg', null, null, 'per_weight', null, 34000, 500, null) $$,
  'a dispatcher changes a Product from per-unit to per-weight'
);
select results_eq(
  $$ select name, description, unit_price_centavos, price_per_kg_centavos, tolerance_grams
     from public.catalog_products where id = current_setting('t.sausages')::uuid $$,
  $$ values ('Garlic longganisa, 1 kg'::text, null::text, null::integer, 34000, 250) $$,
  'the edit replaces the old price rather than adding to it'
);

-- Unavailable and deleted Products drop out of what customers see; the dispatcher
-- still sees an unavailable one, so it can be switched back on.
select lives_ok(
  $$ select public.set_product_available(current_setting('t.ribeye')::uuid, false) $$,
  'a dispatcher marks a Product unavailable'
);
select results_eq(
  $$ select available from public.dispatcher_products()
     where id = current_setting('t.ribeye')::uuid $$,
  $$ values (false) $$,
  'the dispatcher still sees it, marked unavailable'
);
select lives_ok(
  $$ select public.delete_product(current_setting('t.sausages')::uuid) $$,
  'a dispatcher deletes a Product'
);
select is_empty(
  $$ select 1 from public.dispatcher_products() where id = current_setting('t.sausages')::uuid $$,
  'a deleted Product is gone from the console too'
);
select throws_ok(
  $$ select public.save_product(current_setting('t.sausages')::uuid,
       'Garlic longganisa', null, null, 'per_unit', 18500, null, null, null) $$,
  'P0002', null,
  'a deleted Product cannot be edited back to life'
);
select throws_ok(
  $$ select public.set_product_available(current_setting('t.sausages')::uuid, true) $$,
  'P0002', null,
  'nor made available again'
);
reset role;

-- The row stays, so an Order's reference to it never dangles (ADR 0003).
select results_eq(
  $$ select deleted_at is not null from app.products
     where id = current_setting('t.sausages')::uuid $$,
  $$ values (true) $$,
  'deleting is soft: the row is kept'
);

select tests.authenticate_as(current_setting('t.customer')::uuid);
select is_empty(
  $$ select 1 from public.catalog_products
     where id in (current_setting('t.ribeye')::uuid, current_setting('t.sausages')::uuid) $$,
  'customers see neither the unavailable Product nor the deleted one'
);
select results_eq(
  $$ select count(*)::integer from public.catalog_products where name = 'Pork belly' $$,
  $$ values (1) $$,
  'customers still see the ones that are available'
);

-- Nobody but an active dispatcher writes the catalog or reads its hidden parts.
select throws_ok(
  $$ select public.set_product_available(current_setting('t.ribeye')::uuid, true) $$,
  '42501', null,
  'a customer may not make a Product available'
);
select throws_ok(
  $$ select public.save_product(null, 'Free steak', null, null, 'per_unit', 1, null, null, null) $$,
  '42501', null,
  'a customer may not add a Product'
);
select throws_ok(
  $$ select * from public.dispatcher_products() $$,
  '42501', null,
  'a customer may not read the unavailable Products'
);
select throws_ok(
  $$ update public.catalog_products set unit_price_centavos = 1 $$,
  '42501', null,
  'a customer may not write through the view'
);
reset role;

select set_config('t.driver', tests.create_user('driver')::text, true);
select tests.authenticate_as(current_setting('t.driver')::uuid);
select throws_ok(
  $$ select public.delete_product(current_setting('t.ribeye')::uuid) $$,
  '42501', null,
  'a driver may not delete a Product'
);
reset role;

select tests.deactivate(current_setting('t.dispatcher')::uuid);
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select throws_ok(
  $$ select public.set_product_available(current_setting('t.ribeye')::uuid, true) $$,
  '42501', null,
  'a deactivated dispatcher may not change the catalog'
);
reset role;

select tests.authenticate_as_anon();
select throws_ok(
  $$ select * from public.catalog_products $$,
  '42501', null,
  'anon may not browse the catalog'
);
reset role;

select * from finish();
rollback;
