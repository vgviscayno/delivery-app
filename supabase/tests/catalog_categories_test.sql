-- Categories and Product–Category membership: the dispatcher names Categories, orders
-- them, and orders the Products within each. Customers read both through views.

begin;
select plan(21);

select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);
select set_config('t.customer', tests.create_user('customer')::text, true);
select set_config('t.driver', tests.create_user('driver')::text, true);

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);

select set_config('t.beef', public.save_category(null, 'Beef')::text, true);
select set_config('t.pork', public.save_category(null, 'Pork')::text, true);
select set_config('t.grill', public.save_category(null, '  For the grill ')::text, true);

select set_config('t.ribeye', public.save_product(
  null, 'Ribeye', null, null, 'per_weight', null, 120000, 250, null)::text, true);
select set_config('t.liempo', public.save_product(
  null, 'Pork belly (liempo)', null, null, 'per_weight', null, 38000, 500, null)::text, true);
select set_config('t.tocino', public.save_product(
  null, 'Pork tocino, 450 g pack', null, null, 'per_unit', 16500, null, null, null)::text, true);

-- A new Category goes to the end of the list.
select results_eq(
  $$ select name from public.catalog_categories order by position $$,
  $$ values ('Beef'::text), ('Pork'), ('For the grill') $$,
  'new Categories are listed after the existing ones, names trimmed'
);

select lives_ok(
  $$ select public.save_category(current_setting('t.grill')::uuid, 'Grilling') $$,
  'a dispatcher renames a Category'
);
select throws_ok(
  $$ select public.save_category(null, 'beef ') $$,
  '23505', null,
  'two Categories cannot share a name, whatever the case'
);
select throws_ok(
  $$ select public.save_category(null, ' ') $$,
  '23514', null,
  'a Category needs a name'
);

select lives_ok(
  $$ select public.reorder_categories(array[
       current_setting('t.grill')::uuid,
       current_setting('t.beef')::uuid,
       current_setting('t.pork')::uuid]) $$,
  'a dispatcher reorders the Categories'
);
select results_eq(
  $$ select name from public.catalog_categories order by position $$,
  $$ values ('Grilling'::text), ('Beef'), ('Pork') $$,
  'Categories are shown in the order the dispatcher gave'
);
select throws_ok(
  $$ select public.reorder_categories(array[current_setting('t.beef')::uuid]) $$,
  '22023', null,
  'a reordering must place every Category, so none is left without a position'
);
select throws_ok(
  $$ select public.reorder_categories(array[
       current_setting('t.beef')::uuid, current_setting('t.beef')::uuid,
       current_setting('t.pork')::uuid]) $$,
  '22023', null,
  'and place each only once'
);

-- Membership is many-to-many, with a position of its own in each Category.
select lives_ok(
  $$ select public.set_category_products(current_setting('t.grill')::uuid, array[
       current_setting('t.liempo')::uuid, current_setting('t.ribeye')::uuid]) $$,
  'a dispatcher fills a Category in order'
);
select lives_ok(
  $$ select public.set_category_products(current_setting('t.pork')::uuid, array[
       current_setting('t.tocino')::uuid, current_setting('t.liempo')::uuid]) $$,
  'the same Product goes in a second Category'
);
select lives_ok(
  $$ select public.set_category_products(current_setting('t.beef')::uuid, array[
       current_setting('t.ribeye')::uuid]) $$,
  'and a third'
);
select throws_ok(
  $$ select public.set_category_products(current_setting('t.beef')::uuid, array[
       current_setting('t.ribeye')::uuid, current_setting('t.ribeye')::uuid]) $$,
  '22023', null,
  'a Product appears in a Category once'
);
reset role;

select tests.authenticate_as(current_setting('t.customer')::uuid);
select results_eq(
  $$ select p.name from public.catalog_memberships m
     join public.catalog_products p on p.id = m.product_id
     where m.category_id = current_setting('t.pork')::uuid order by m.position $$,
  $$ values ('Pork tocino, 450 g pack'::text), ('Pork belly (liempo)') $$,
  'a customer reads a Category''s Products in the dispatcher''s order'
);
select results_eq(
  $$ select p.name from public.catalog_memberships m
     join public.catalog_products p on p.id = m.product_id
     where m.category_id = current_setting('t.grill')::uuid order by m.position $$,
  $$ values ('Pork belly (liempo)'::text), ('Ribeye') $$,
  'the same Product ranks independently in another Category'
);
reset role;

-- Rearranging a Category replaces its members: one left out is taken out.
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select lives_ok(
  $$ select public.set_category_products(current_setting('t.grill')::uuid, array[
       current_setting('t.ribeye')::uuid]) $$,
  'a dispatcher takes a Product out of a Category'
);
select results_eq(
  $$ select product_id from public.dispatcher_category_products()
     where category_id = current_setting('t.grill')::uuid $$,
  $$ values (current_setting('t.ribeye')::uuid) $$,
  'only the Products still listed remain in it'
);

-- An unavailable Product keeps its place, but customers do not see it there.
select public.set_product_available(current_setting('t.tocino')::uuid, false);
reset role;
select tests.authenticate_as(current_setting('t.customer')::uuid);
select is_empty(
  $$ select 1 from public.catalog_memberships where product_id = current_setting('t.tocino')::uuid $$,
  'customers see no membership for a Product they cannot order'
);
reset role;

-- A deleted Product leaves every Category, and cannot be put back into one.
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select public.delete_product(current_setting('t.liempo')::uuid);
select throws_ok(
  $$ select public.set_category_products(current_setting('t.pork')::uuid, array[
       current_setting('t.liempo')::uuid]) $$,
  '22023', null,
  'a deleted Product cannot be put in a Category'
);

-- Deleting a Category takes its memberships with it, never its Products.
select lives_ok(
  $$ select public.delete_category(current_setting('t.beef')::uuid) $$,
  'a dispatcher deletes a Category'
);
select results_eq(
  $$ select (select count(*)::integer from public.dispatcher_category_products()
             where product_id = current_setting('t.ribeye')::uuid),
            (select count(*)::integer from public.dispatcher_products()
             where id = current_setting('t.ribeye')::uuid) $$,
  $$ values (1, 1) $$,
  'its Products stay, in the other Categories they belong to'
);
reset role;

-- Only an active dispatcher arranges the catalog.
select tests.authenticate_as(current_setting('t.driver')::uuid);
select throws_ok(
  $$ select public.save_category(null, 'Driver specials') $$,
  '42501', null,
  'a driver may not add a Category'
);
reset role;

select * from finish();
rollback;
