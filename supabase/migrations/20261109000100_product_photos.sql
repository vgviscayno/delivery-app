-- Product photos live in Storage, in a public `product-photos` bucket. A Product keeps
-- the path of its large image; the thumbnail sits beside it under the same folder, and
-- clients build both public URLs from the path. Each upload takes a new folder rather
-- than overwriting, so no cache ever serves a replaced photo.
--
-- Paths rather than URLs, so a later move to another store is a copy and a new base URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 2 * 1024 * 1024, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

-- The access matrix only sees `public`, so these rights are not in it. They are written
-- down here and held by supabase/tests/product_photos_test.sql instead:
--
--   anon        download                (the bucket is public; photos are the shop window)
--   customer    download
--   driver      download
--   dispatcher  download, upload, replace, remove
--
-- Download is a select policy as well as the public flag: the Storage API's remove reads
-- the objects before it deletes them, so the dispatcher needs select to clean up.
create policy "Anyone reads the product-photos bucket"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-photos');

create policy "Active dispatchers upload product photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and policies.is_active_dispatcher());

create policy "Active dispatchers replace product photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and policies.is_active_dispatcher())
  with check (bucket_id = 'product-photos' and policies.is_active_dispatcher());

create policy "Active dispatchers remove product photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and policies.is_active_dispatcher());

-- The production catalog is empty, so the URL column goes without converting anything.
-- The view reads the column, so it goes first and comes back carrying the path.
drop view public.catalog_products;

alter table app.products
  drop constraint products_photo_url_is_http,
  drop column photo_url,
  add column photo_path text
    constraint products_photo_path_not_blank check (length(btrim(photo_path)) > 0);

comment on column app.products.photo_path is
  'Where the large photo is in the product-photos bucket; the thumbnail is beside it. Null for no photo.';

-- What a customer may order. The view runs with its owner's rights, which is how it
-- reads `app` without anyone being granted the table; the filter is the whole of what
-- it lets through.
create view public.catalog_products as
  select
    p.id,
    p.name,
    p.description,
    p.photo_path,
    p.price_type::text as price_type,
    p.unit_price_centavos,
    p.price_per_kg_centavos,
    p.weight_step_grams,
    p.tolerance_grams
  from app.products p
  where p.available and p.deleted_at is null;

comment on view public.catalog_products is
  'The Products a customer can order: available and not deleted.';

-- Supabase's default privileges grant everything on a new public view to anon and
-- authenticated. A single-table view is updatable, so anything beyond select would be
-- a write path into the catalog. The matrix rows from the catalog migration still hold.
revoke all on public.catalog_products from public, anon, authenticated;
grant select on public.catalog_products to authenticated, service_role;

-- A parameter cannot be renamed in place, so save_product is dropped and made again.
-- Its matrix rows key on the name and still hold.
drop function public.save_product(uuid, text, text, text, text, integer, integer, integer, integer);

-- Adds a Product when `id` is null, or replaces every field of an existing one. A
-- per-weight Product given no tolerance gets 250 g. Refuses a photo path with nothing
-- uploaded behind it, so a Product never points at a missing image. Returns its id.
create function public.save_product(
  id uuid,
  name text,
  description text,
  photo_path text,
  price_type text,
  unit_price_centavos integer,
  price_per_kg_centavos integer,
  weight_step_grams integer,
  tolerance_grams integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dispatcher_id uuid := app.require_active_dispatcher();
  kind app.price_type := save_product.price_type::app.price_type;
  stored_path text := nullif(btrim(save_product.photo_path), '');
  tolerance integer := case
    when kind = 'per_weight' then coalesce(save_product.tolerance_grams, 250)
    else save_product.tolerance_grams
  end;
  saved uuid;
begin
  if stored_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'product-photos' and o.name = stored_path
  ) then
    raise exception 'nothing has been uploaded to the product-photos bucket at %', stored_path
      using errcode = 'invalid_parameter_value';
  end if;

  if save_product.id is null then
    insert into app.products as p (
      name, description, photo_path, price_type, unit_price_centavos,
      price_per_kg_centavos, weight_step_grams, tolerance_grams, updated_by
    )
    values (
      btrim(save_product.name), nullif(btrim(save_product.description), ''),
      stored_path, kind, save_product.unit_price_centavos,
      save_product.price_per_kg_centavos, save_product.weight_step_grams, tolerance,
      dispatcher_id
    )
    returning p.id into saved;
  else
    update app.products p
       set name = btrim(save_product.name),
           description = nullif(btrim(save_product.description), ''),
           photo_path = stored_path,
           price_type = kind,
           unit_price_centavos = save_product.unit_price_centavos,
           price_per_kg_centavos = save_product.price_per_kg_centavos,
           weight_step_grams = save_product.weight_step_grams,
           tolerance_grams = tolerance,
           updated_at = app.now(),
           updated_by = dispatcher_id
     where p.id = save_product.id and p.deleted_at is null
    returning p.id into saved;

    if saved is null then
      raise exception 'there is no Product % to edit', save_product.id
        using errcode = 'no_data_found';
    end if;
  end if;

  return saved;
end
$$;

comment on function public.save_product(uuid, text, text, text, text, integer, integer, integer, integer) is
  'Adds a Product (null id) or replaces an undeleted one''s fields; returns its id. Active dispatchers only.';

revoke execute on function public.save_product(uuid, text, text, text, text, integer, integer, integer, integer) from public, anon;
grant execute on function public.save_product(uuid, text, text, text, text, integer, integer, integer, integer) to authenticated, service_role;

-- The return type changes, which also needs a drop. Matrix rows still hold.
drop function public.dispatcher_products();

-- Everything the console lists: available or not, deleted excepted. Raises for anyone
-- but an active dispatcher, so what customers cannot order stays the shop's business.
create function public.dispatcher_products()
returns table (
  id uuid,
  name text,
  description text,
  photo_path text,
  available boolean,
  price_type text,
  unit_price_centavos integer,
  price_per_kg_centavos integer,
  weight_step_grams integer,
  tolerance_grams integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_active_dispatcher();

  return query
    select
      p.id, p.name, p.description, p.photo_path, p.available, p.price_type::text,
      p.unit_price_centavos, p.price_per_kg_centavos, p.weight_step_grams,
      p.tolerance_grams, p.updated_at
    from app.products p
    where p.deleted_at is null
    order by lower(p.name), p.id;
end
$$;

comment on function public.dispatcher_products() is
  'Every undeleted Product, available or not, by name. Active dispatchers only.';

revoke execute on function public.dispatcher_products() from public, anon;
grant execute on function public.dispatcher_products() to authenticated, service_role;
