-- The QR Ph image: uploaded by the dispatcher to the private `shop` bucket, read by any
-- signed-in account, and pointed at from the shop settings.
--
-- Uploads are simulated the way the Storage API performs them: an insert into
-- storage.objects as the signed-in user, under the bucket's row security.
--
-- `db reset --no-seed` still uploads config.toml's bucket objects, so the seed's
-- placeholder image may be in the bucket. Nothing here counts on it either way.

begin;
select plan(13);

select set_config('t.dispatcher', tests.create_user('dispatcher')::text, true);
select set_config('t.customer', tests.create_user('customer')::text, true);
select set_config('t.driver', tests.create_user('driver')::text, true);

select results_eq(
  $$ select public from storage.buckets where id = 'shop' $$,
  $$ values (false) $$,
  'the shop bucket exists and is private'
);

select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('shop', 'qr-ph/first.png', auth.uid()::text) $$,
  'a dispatcher uploads a QR Ph image'
);
select is(
  public.set_qr_ph_image('qr-ph/first.png'), null,
  'pointing the settings at the first image replaces nothing'
);
select throws_ok(
  $$ select public.set_qr_ph_image('qr-ph/never-uploaded.png') $$,
  '22023', null,
  'the settings cannot point at an image that was never uploaded'
);
reset role;

select tests.authenticate_as(current_setting('t.customer')::uuid);
select results_eq(
  $$ select qr_ph_image_path from public.shop_settings() $$,
  $$ values ('qr-ph/first.png'::text) $$,
  'a customer is told where the QR Ph image is'
);
select results_eq(
  $$ select count(*)::integer from storage.objects
     where bucket_id = 'shop' and name = 'qr-ph/first.png' $$,
  $$ values (1) $$,
  'a customer may download it'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('shop', 'qr-ph/mine.png') $$,
  '42501', null,
  'a customer may not upload to the shop bucket'
);
select throws_ok(
  $$ select public.set_qr_ph_image('qr-ph/first.png') $$,
  '42501', null,
  'a customer may not change which image is the QR Ph code'
);
reset role;

select tests.authenticate_as(current_setting('t.driver')::uuid);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('shop', 'qr-ph/mine.png') $$,
  '42501', null,
  'a driver may not upload to the shop bucket'
);
reset role;

select tests.authenticate_as_anon();
select results_eq(
  $$ select count(*)::integer from storage.objects where bucket_id = 'shop' $$,
  $$ values (0) $$,
  'anon sees nothing in the shop bucket'
);
reset role;

-- Replacing: upload a new image under a new name, point at it, and remove the old one.
-- The old path comes back so the console knows what to remove.
select tests.authenticate_as(current_setting('t.dispatcher')::uuid);
insert into storage.objects (bucket_id, name, owner_id)
values ('shop', 'qr-ph/second.png', auth.uid()::text);
select is(
  public.set_qr_ph_image('qr-ph/second.png'), 'qr-ph/first.png',
  'replacing the image hands back the one it replaced'
);
-- The Storage API sets this before its own deletes; direct SQL deletes are blocked.
select set_config('storage.allow_delete_query', 'true', true);
select results_eq(
  $$ with gone as (delete from storage.objects where bucket_id = 'shop'
                   and name = 'qr-ph/first.png' returning 1)
     select count(*)::integer from gone $$,
  $$ values (1) $$,
  'a dispatcher removes the replaced image'
);
reset role;

select tests.authenticate_as(current_setting('t.customer')::uuid);
select set_config('storage.allow_delete_query', 'true', true);
select results_eq(
  $$ with gone as (delete from storage.objects where bucket_id = 'shop' returning 1)
     select count(*)::integer from gone $$,
  $$ values (0) $$,
  'a customer removes nothing from the shop bucket'
);
reset role;

select * from finish();
rollback;
