-- Product photos: uploaded by the dispatcher to the public `product-photos` bucket, read
-- by anyone, and pointed at from a Product by path.
--
-- Uploads are simulated the way the Storage API performs them: an insert into
-- storage.objects as the signed-in user, under the bucket's row security.

begin;
select plan(25);

select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);
select set_config('t.customer', tests.create_user('customer')::text, true);
select set_config('t.driver', tests.create_user('driver')::text, true);

select results_eq(
  $$ select public from storage.buckets where id = 'product-photos' $$,
  $$ values (true) $$,
  'the product-photos bucket exists and is public'
);
select hasnt_column('app', 'products', 'photo_url', 'Products no longer carry a URL');

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values
       ('product-photos', 'first/large.webp', auth.uid()::text),
       ('product-photos', 'first/thumb.webp', auth.uid()::text) $$,
  'a dispatcher uploads a photo and its thumbnail'
);
select set_config('t.ribeye', public.save_product(
  id => null,
  name => 'Ribeye',
  description => null,
  photo_path => 'first/large.webp',
  price_type => 'per_weight',
  unit_price_centavos => null,
  price_per_kg_centavos => 120000,
  weight_step_grams => 250,
  tolerance_grams => null
)::text, true);
select results_eq(
  $$ select photo_path from public.dispatcher_products()
     where id = current_setting('t.ribeye')::uuid $$,
  $$ values ('first/large.webp'::text) $$,
  'the console reads back the path it saved'
);
select throws_ok(
  $$ select public.save_product(null, 'Tocino', null, 'never/large.webp', 'per_unit',
                                16000, null, null, null) $$,
  '22023', null,
  'a Product cannot point at a photo that was never uploaded'
);
select set_config('t.tocino', public.save_product(
  null, 'Tocino', null, '  ', 'per_unit', 16000, null, null, null
)::text, true);
select results_eq(
  $$ select photo_path from public.dispatcher_products()
     where id = current_setting('t.tocino')::uuid $$,
  $$ values (null::text) $$,
  'a blank path saves as no photo'
);
reset role;

select tests.authenticate_as(current_setting('t.customer')::uuid);
select results_eq(
  $$ select photo_path from public.catalog_products
     where id = current_setting('t.ribeye')::uuid $$,
  $$ values ('first/large.webp'::text) $$,
  'a customer is told where the photo is'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('product-photos', 'mine.webp') $$,
  '42501', null,
  'a customer may not upload a product photo'
);
select set_config('storage.allow_delete_query', 'true', true);
select results_eq(
  $$ with gone as (delete from storage.objects where bucket_id = 'product-photos' returning 1)
     select count(*)::integer from gone $$,
  $$ values (0) $$,
  'a customer removes nothing from the product-photos bucket'
);
reset role;

select tests.authenticate_as(current_setting('t.driver')::uuid);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('product-photos', 'mine.webp') $$,
  '42501', null,
  'a driver may not upload a product photo'
);
reset role;

select tests.authenticate_as_anon();
select results_eq(
  $$ select count(*)::integer from storage.objects where bucket_id = 'product-photos' $$,
  $$ values (2) $$,
  'anon can read the product photos'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('product-photos', 'mine.webp') $$,
  '42501', null,
  'anon may not upload a product photo'
);
reset role;

-- Replacing: upload under a new name, save the Product against it, then remove the old
-- files. The Storage API's remove needs select as well as delete.
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
insert into storage.objects (bucket_id, name, owner_id) values
  ('product-photos', 'second/large.webp', auth.uid()::text),
  ('product-photos', 'second/thumb.webp', auth.uid()::text);
select lives_ok(
  $$ select public.save_product(current_setting('t.ribeye')::uuid, 'Ribeye', null,
                                'second/large.webp', 'per_weight', null, 120000, 250, null) $$,
  'a dispatcher points the Product at a new photo'
);
select results_eq(
  $$ select name from storage.objects where bucket_id = 'product-photos'
     and name like 'first/%' order by name $$,
  $$ values ('first/large.webp'::text), ('first/thumb.webp'::text) $$,
  'a dispatcher can see the old files before removing them'
);
select set_config('storage.allow_delete_query', 'true', true);
select results_eq(
  $$ with gone as (delete from storage.objects where bucket_id = 'product-photos'
                   and name like 'first/%' returning 1)
     select count(*)::integer from gone $$,
  $$ values (2) $$,
  'a dispatcher removes the replaced files'
);

-- Soft-deleting keeps the photo: old Orders may still show it (ADR 0003).
select public.delete_product(current_setting('t.ribeye')::uuid);
select results_eq(
  $$ select count(*)::integer from storage.objects where bucket_id = 'product-photos'
     and name like 'second/%' $$,
  $$ values (2) $$,
  'deleting a Product leaves its photo in the bucket'
);
reset role;

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
insert into storage.objects (bucket_id, name, owner_id)
values ('shop', 'qr-ph/stray.png', auth.uid()::text);
select throws_ok(
  $$ select public.save_product(null, 'Tocino', null, 'qr-ph/stray.png', 'per_unit',
                                16000, null, null, null) $$,
  '22023', null,
  'a path in some other bucket does not count'
);
reset role;

-- The rest of what the migration's comment promises, actor by actor. What is left in
-- the bucket now is the second photo, which the deleted Ribeye kept.
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select results_eq(
  $$ with changed as (update storage.objects set metadata = '{}'
                      where bucket_id = 'product-photos' and name = 'second/thumb.webp'
                      returning 1)
     select count(*)::integer from changed $$,
  $$ values (1) $$,
  'a dispatcher may replace a product photo'
);
reset role;

select tests.authenticate_as(current_setting('t.customer')::uuid);
select results_eq(
  $$ select count(*)::integer from storage.objects where bucket_id = 'product-photos' $$,
  $$ values (2) $$,
  'a customer can read the product photos'
);
select results_eq(
  $$ with changed as (update storage.objects set metadata = '{}'
                      where bucket_id = 'product-photos' returning 1)
     select count(*)::integer from changed $$,
  $$ values (0) $$,
  'a customer replaces nothing in the product-photos bucket'
);
reset role;

select tests.authenticate_as(current_setting('t.driver')::uuid);
select results_eq(
  $$ select count(*)::integer from storage.objects where bucket_id = 'product-photos' $$,
  $$ values (2) $$,
  'a driver can read the product photos'
);
select set_config('storage.allow_delete_query', 'true', true);
select results_eq(
  $$ with gone as (delete from storage.objects where bucket_id = 'product-photos' returning 1)
     select count(*)::integer from gone $$,
  $$ values (0) $$,
  'a driver removes nothing from the product-photos bucket'
);
reset role;

select tests.authenticate_as_anon();
select set_config('storage.allow_delete_query', 'true', true);
select results_eq(
  $$ with gone as (delete from storage.objects where bucket_id = 'product-photos' returning 1)
     select count(*)::integer from gone $$,
  $$ values (0) $$,
  'anon removes nothing from the product-photos bucket'
);
reset role;

update app.profiles set active = false, deactivated_at = app.now()
where id = current_setting('t.dispatcher')::uuid;
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('product-photos', 'late/large.webp', auth.uid()::text) $$,
  '42501', null,
  'a deactivated dispatcher may not upload a product photo'
);
reset role;

select throws_ok(
  $$ update app.products set photo_path = '  ' where id = current_setting('t.ribeye')::uuid $$,
  '23514', null,
  'a Product''s photo path is never blank: no photo is null'
);

select * from finish();
rollback;
