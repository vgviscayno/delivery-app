-- The catalog: Products, Categories, and which Products are in which Category, in what
-- order. Dispatcher-maintained data on the console's settings surface.
--
-- The tables live in `app`. Customers read the catalog through views in `public` that
-- show only what can be ordered; the dispatcher reads and writes all of it through RPCs.
--
-- These are the first views in `public`; until now clients reached `app` only through
-- RPCs. A view lets the customer app select, filter and page the catalog the way
-- PostgREST does for any table, which a fixed RPC result does not. Each runs with its
-- owner's rights, not the caller's: `app` is closed to callers, so the WHERE clause in
-- each view decides everything it shows. Each is select-only and listed in the access
-- matrix like any RPC.
-- Placed Orders never read these tables: they copy what they need at submission (ADR
-- 0003), so nothing here can rewrite one.

create type app.price_type as enum ('per_unit', 'per_weight');

comment on type app.price_type is
  'How a Product is priced: per unit (a packaged item) or per weight (cut to order, at a rate per kg).';

create table app.products (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint products_name_not_blank check (length(btrim(name)) > 0),
  description text
    constraint products_description_not_blank check (length(btrim(description)) > 0),
  photo_url text constraint products_photo_url_is_http check (photo_url ~ '^https?://'),
  -- A manual toggle, not a stock count.
  available boolean not null default true,

  price_type app.price_type not null,
  -- Whole centavos, like every amount of money in this system.
  unit_price_centavos integer
    constraint products_unit_price_positive check (unit_price_centavos > 0),
  -- Per kilogram, never converted per gram: a per-gram rate in whole centavos would
  -- round every price in the shop.
  price_per_kg_centavos integer
    constraint products_price_per_kg_positive check (price_per_kg_centavos > 0),
  -- The increment a customer estimates their weight in, and also the least they may ask for.
  weight_step_grams integer
    constraint products_weight_step_positive check (weight_step_grams > 0),
  -- Symmetric: a shortfall counts the same as an excess. Allowed to reach or pass the
  -- step; the console warns about that rather than refusing it.
  tolerance_grams integer
    constraint products_tolerance_not_negative check (tolerance_grams >= 0),

  -- Soft-deleted, so an Order's reference to it never dangles (ADR 0003).
  deleted_at timestamptz,
  created_at timestamptz not null default app.now(),
  updated_at timestamptz not null default app.now(),
  updated_by uuid references app.profiles (id) on delete set null,

  -- Each price type carries exactly its own fields, so a Product is never half one and
  -- half the other.
  constraint products_price_matches_type check (
    case price_type
      when 'per_unit' then
        unit_price_centavos is not null
        and price_per_kg_centavos is null
        and weight_step_grams is null
        and tolerance_grams is null
      when 'per_weight' then
        unit_price_centavos is null
        and price_per_kg_centavos is not null
        and weight_step_grams is not null
        and tolerance_grams is not null
    end
  )
);

comment on table app.products is
  'The catalog''s Products. Edited in place; placed Orders hold their own copy (ADR 0003).';

alter table app.products enable row level security;

revoke all on table app.products from public;
grant select, insert, update, delete on table app.products to service_role;

-- What a customer may order. The view runs with its owner's rights, which is how it
-- reads `app` without anyone being granted the table; the filter is the whole of what
-- it lets through.
create view public.catalog_products as
  select
    p.id,
    p.name,
    p.description,
    p.photo_url,
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
-- a write path into the catalog.
revoke all on public.catalog_products from public, anon, authenticated;
grant select on public.catalog_products to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('catalog_products', 'view', 'anon', false,
   'Browsing comes after sign-in. Not granted.'),
  ('catalog_products', 'view', 'customer', true,
   'The customer app lists what can be ordered: available, undeleted Products only.'),
  ('catalog_products', 'view', 'driver', true,
   'Read-only and nothing in it is private; drivers have no screen for it yet.'),
  ('catalog_products', 'view', 'dispatcher', true,
   'Shows the console what customers currently see. The full list comes from dispatcher_products.');

-- Adds a Product when `id` is null, or replaces every field of an existing one. A
-- per-weight Product given no tolerance gets 250 g. Returns the Product's id.
create or replace function public.save_product(
  id uuid,
  name text,
  description text,
  photo_url text,
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
  tolerance integer := case
    when kind = 'per_weight' then coalesce(save_product.tolerance_grams, 250)
    else save_product.tolerance_grams
  end;
  saved uuid;
begin
  if save_product.id is null then
    insert into app.products as p (
      name, description, photo_url, price_type, unit_price_centavos,
      price_per_kg_centavos, weight_step_grams, tolerance_grams, updated_by
    )
    values (
      btrim(save_product.name), nullif(btrim(save_product.description), ''),
      nullif(btrim(save_product.photo_url), ''), kind, save_product.unit_price_centavos,
      save_product.price_per_kg_centavos, save_product.weight_step_grams, tolerance,
      dispatcher_id
    )
    returning p.id into saved;
  else
    update app.products p
       set name = btrim(save_product.name),
           description = nullif(btrim(save_product.description), ''),
           photo_url = nullif(btrim(save_product.photo_url), ''),
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

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('save_product', 'function', 'anon', false,
   'Only the dispatcher maintains the catalog. Not granted.'),
  ('save_product', 'function', 'customer', false,
   'A customer setting a price could set their own. Raises insufficient_privilege.'),
  ('save_product', 'function', 'driver', false,
   'Drivers carry Products; they never define them. Raises insufficient_privilege.'),
  ('save_product', 'function', 'dispatcher', true,
   'The console''s Product form, for adding and editing. Deactivated dispatchers are refused.');

-- Everything the console lists: available or not, deleted excepted. Raises for anyone
-- but an active dispatcher, so what customers cannot order stays the shop's business.
create or replace function public.dispatcher_products()
returns table (
  id uuid,
  name text,
  description text,
  photo_url text,
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
      p.id, p.name, p.description, p.photo_url, p.available, p.price_type::text,
      p.unit_price_centavos, p.price_per_kg_centavos, p.weight_step_grams,
      p.tolerance_grams, p.updated_at
    from app.products p
    where p.deleted_at is null
    order by lower(p.name), p.id;
end
$$;

comment on function public.dispatcher_products() is
  'Every undeleted Product, available or not, by name. Active dispatchers only.';

create or replace function public.set_product_available(id uuid, available boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dispatcher_id uuid := app.require_active_dispatcher();
begin
  update app.products p
     set available = set_product_available.available,
         updated_at = app.now(),
         updated_by = dispatcher_id
   where p.id = set_product_available.id and p.deleted_at is null;

  if not found then
    raise exception 'there is no Product % to change', set_product_available.id
      using errcode = 'no_data_found';
  end if;
end
$$;

comment on function public.set_product_available(uuid, boolean) is
  'Switches an undeleted Product on or off for customers. Active dispatchers only.';

-- Soft: the row stays for any Order that refers to it, and nothing brings it back. It
-- leaves every Category, so no Category holds a place for something gone for good.
create or replace function public.delete_product(id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dispatcher_id uuid := app.require_active_dispatcher();
begin
  update app.products p
     set deleted_at = app.now(),
         updated_at = app.now(),
         updated_by = dispatcher_id
   where p.id = delete_product.id and p.deleted_at is null;

  if not found then
    raise exception 'there is no Product % to delete', delete_product.id
      using errcode = 'no_data_found';
  end if;

  -- Late-bound: the membership table is created further down, with the Categories.
  delete from app.product_categories m where m.product_id = delete_product.id;
end
$$;

comment on function public.delete_product(uuid) is
  'Soft-deletes a Product: gone from every list, kept for the Orders that refer to it. Active dispatchers only.';

revoke execute on function
  public.dispatcher_products(),
  public.set_product_available(uuid, boolean),
  public.delete_product(uuid)
from public, anon;

grant execute on function
  public.dispatcher_products(),
  public.set_product_available(uuid, boolean),
  public.delete_product(uuid)
to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('dispatcher_products', 'function', 'anon', false,
   'Only the dispatcher sees Products customers cannot order. Not granted.'),
  ('dispatcher_products', 'function', 'customer', false,
   'Customers read catalog_products instead. Raises insufficient_privilege.'),
  ('dispatcher_products', 'function', 'driver', false,
   'Drivers have no use for the shop''s hidden Products. Raises insufficient_privilege.'),
  ('dispatcher_products', 'function', 'dispatcher', true,
   'The console''s catalog lists every Product, so an unavailable one can be switched back on.'),

  ('set_product_available', 'function', 'anon', false,
   'Only the dispatcher maintains the catalog. Not granted.'),
  ('set_product_available', 'function', 'customer', false,
   'Customers never decide what is on sale. Raises insufficient_privilege.'),
  ('set_product_available', 'function', 'driver', false,
   'Drivers never decide what is on sale. Raises insufficient_privilege.'),
  ('set_product_available', 'function', 'dispatcher', true,
   'The console''s availability toggle, for a Product the shop has run out of.'),

  ('delete_product', 'function', 'anon', false,
   'Only the dispatcher maintains the catalog. Not granted.'),
  ('delete_product', 'function', 'customer', false,
   'Customers never remove Products. Raises insufficient_privilege.'),
  ('delete_product', 'function', 'driver', false,
   'Drivers never remove Products. Raises insufficient_privilege.'),
  ('delete_product', 'function', 'dispatcher', true,
   'The console removes a Product the shop no longer sells. Soft: placed Orders keep their reference.');

-- Categories, in the order the dispatcher lists them. Positions are unique but checked
-- at commit, so a reordering can pass through a moment where two coincide.
create table app.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint categories_name_not_blank check (length(btrim(name)) > 0),
  position integer not null,
  constraint categories_position_unique unique (position) deferrable initially deferred
);

-- "Beef" and "beef " are the same Category to anyone browsing.
create unique index categories_name_unique on app.categories (lower(btrim(name)));

comment on table app.categories is
  'The groupings customers navigate the catalog by, in the dispatcher''s display order.';

-- Product–Category membership, with the Product's position within that Category, so a
-- Product in two Categories can rank differently in each.
create table app.product_categories (
  product_id uuid not null references app.products (id) on delete cascade,
  category_id uuid not null references app.categories (id) on delete cascade,
  position integer not null,
  primary key (product_id, category_id),
  constraint product_categories_position_unique
    unique (category_id, position) deferrable initially deferred
);

comment on table app.product_categories is
  'Which Products are in which Category, and each one''s position within it.';

alter table app.categories enable row level security;
alter table app.product_categories enable row level security;

revoke all on table app.categories, app.product_categories from public;
grant select, insert, update, delete on table app.categories, app.product_categories to service_role;

create view public.catalog_categories as
  select c.id, c.name, c.position
  from app.categories c;

comment on view public.catalog_categories is
  'Every Category, with its display position.';

-- Only the memberships of Products a customer can order, so a Category never lists one
-- the customer cannot open.
create view public.catalog_memberships as
  select m.product_id, m.category_id, m.position
  from app.product_categories m
  join app.products p on p.id = m.product_id
  where p.available and p.deleted_at is null;

comment on view public.catalog_memberships is
  'Which orderable Products are in which Category, and each one''s position there.';

revoke all on public.catalog_categories, public.catalog_memberships from public, anon, authenticated;
grant select on public.catalog_categories, public.catalog_memberships to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('catalog_categories', 'view', 'anon', false,
   'Browsing comes after sign-in. Not granted.'),
  ('catalog_categories', 'view', 'customer', true,
   'The customer app navigates the catalog by Category, in the dispatcher''s order.'),
  ('catalog_categories', 'view', 'driver', true,
   'Read-only and nothing in it is private; drivers have no screen for it yet.'),
  ('catalog_categories', 'view', 'dispatcher', true,
   'The console lists, renames and reorders the Categories from it.'),

  ('catalog_memberships', 'view', 'anon', false,
   'Browsing comes after sign-in. Not granted.'),
  ('catalog_memberships', 'view', 'customer', true,
   'Places each orderable Product in its Categories, in order.'),
  ('catalog_memberships', 'view', 'driver', true,
   'Read-only and nothing in it is private; drivers have no screen for it yet.'),
  ('catalog_memberships', 'view', 'dispatcher', true,
   'Shows what customers see. The full membership comes from dispatcher_category_products.');

-- Every membership of every undeleted Product, unavailable ones included.
create or replace function public.dispatcher_category_products()
returns table (product_id uuid, category_id uuid, "position" integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_active_dispatcher();

  return query
    select m.product_id, m.category_id, m.position
    from app.product_categories m
    order by m.category_id, m.position;
end
$$;

comment on function public.dispatcher_category_products() is
  'Every Product–Category membership, unavailable Products included. Active dispatchers only.';

-- Adds a Category at the end of the list when `id` is null, or renames one. Returns its id.
create or replace function public.save_category(id uuid, name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  saved uuid;
begin
  perform app.require_active_dispatcher();

  if save_category.id is null then
    insert into app.categories as c (name, position)
    values (
      btrim(save_category.name),
      (select coalesce(max(c.position), 0) + 1 from app.categories c)
    )
    returning c.id into saved;
  else
    update app.categories c
       set name = btrim(save_category.name)
     where c.id = save_category.id
    returning c.id into saved;

    if saved is null then
      raise exception 'there is no Category % to rename', save_category.id
        using errcode = 'no_data_found';
    end if;
  end if;

  return saved;
end
$$;

comment on function public.save_category(uuid, text) is
  'Adds a Category last (null id) or renames one; returns its id. Active dispatchers only.';

-- The whole new order, every Category exactly once: a partial list would leave the rest
-- with positions nobody chose.
create or replace function public.reorder_categories(ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_active_dispatcher();

  if cardinality(ids) <> (select count(*) from app.categories)
     or cardinality(ids) <> (select count(distinct given) from unnest(ids) as given)
     or exists (
       select 1 from app.categories c where c.id <> all (ids)
     )
  then
    raise exception 'a reordering lists every Category exactly once'
      using errcode = 'invalid_parameter_value';
  end if;

  update app.categories c
     set position = given.ordinality
    from unnest(ids) with ordinality as given (id, ordinality)
   where c.id = given.id;
end
$$;

comment on function public.reorder_categories(uuid[]) is
  'Puts the Categories in the given order, which must list each exactly once. Active dispatchers only.';

-- Takes its memberships with it. Its Products stay, in whatever other Categories they
-- belong to.
create or replace function public.delete_category(id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_active_dispatcher();

  delete from app.categories c where c.id = delete_category.id;

  if not found then
    raise exception 'there is no Category % to delete', delete_category.id
      using errcode = 'no_data_found';
  end if;
end
$$;

comment on function public.delete_category(uuid) is
  'Deletes a Category and its memberships, never its Products. Active dispatchers only.';

-- A Category's Products, in order. Replaces its membership outright: a Product left
-- out of the list is taken out of the Category.
create or replace function public.set_category_products(category_id uuid, product_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_active_dispatcher();

  if not exists (select 1 from app.categories c where c.id = set_category_products.category_id) then
    raise exception 'there is no Category %', set_category_products.category_id
      using errcode = 'no_data_found';
  end if;

  if cardinality(product_ids) <> (select count(distinct given) from unnest(product_ids) as given)
  then
    raise exception 'a Product appears in a Category once'
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1
    from unnest(product_ids) as given (id)
    left join app.products p on p.id = given.id and p.deleted_at is null
    where p.id is null
  ) then
    raise exception 'only existing, undeleted Products can be put in a Category'
      using errcode = 'invalid_parameter_value';
  end if;

  delete from app.product_categories m
   where m.category_id = set_category_products.category_id;

  insert into app.product_categories (product_id, category_id, position)
  select given.id, set_category_products.category_id, given.ordinality
  from unnest(product_ids) with ordinality as given (id, ordinality);
end
$$;

comment on function public.set_category_products(uuid, uuid[]) is
  'Sets a Category''s Products and their order, replacing its membership. Active dispatchers only.';

revoke execute on function
  public.dispatcher_category_products(),
  public.save_category(uuid, text),
  public.reorder_categories(uuid[]),
  public.delete_category(uuid),
  public.set_category_products(uuid, uuid[])
from public, anon;

grant execute on function
  public.dispatcher_category_products(),
  public.save_category(uuid, text),
  public.reorder_categories(uuid[]),
  public.delete_category(uuid),
  public.set_category_products(uuid, uuid[])
to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('dispatcher_category_products', 'function', 'anon', false,
   'Only the dispatcher sees where unavailable Products sit. Not granted.'),
  ('dispatcher_category_products', 'function', 'customer', false,
   'Customers read catalog_memberships instead. Raises insufficient_privilege.'),
  ('dispatcher_category_products', 'function', 'driver', false,
   'Drivers have no use for the catalog''s arrangement. Raises insufficient_privilege.'),
  ('dispatcher_category_products', 'function', 'dispatcher', true,
   'The console shows each Category''s Products, unavailable ones in their places too.'),

  ('save_category', 'function', 'anon', false,
   'Only the dispatcher maintains the catalog. Not granted.'),
  ('save_category', 'function', 'customer', false,
   'Customers navigate Categories; they never name them. Raises insufficient_privilege.'),
  ('save_category', 'function', 'driver', false,
   'Drivers never arrange the catalog. Raises insufficient_privilege.'),
  ('save_category', 'function', 'dispatcher', true,
   'The console adds and renames Categories.'),

  ('reorder_categories', 'function', 'anon', false,
   'Only the dispatcher maintains the catalog. Not granted.'),
  ('reorder_categories', 'function', 'customer', false,
   'Customers never arrange the catalog. Raises insufficient_privilege.'),
  ('reorder_categories', 'function', 'driver', false,
   'Drivers never arrange the catalog. Raises insufficient_privilege.'),
  ('reorder_categories', 'function', 'dispatcher', true,
   'The console moves Categories up and down the list.'),

  ('delete_category', 'function', 'anon', false,
   'Only the dispatcher maintains the catalog. Not granted.'),
  ('delete_category', 'function', 'customer', false,
   'Customers never arrange the catalog. Raises insufficient_privilege.'),
  ('delete_category', 'function', 'driver', false,
   'Drivers never arrange the catalog. Raises insufficient_privilege.'),
  ('delete_category', 'function', 'dispatcher', true,
   'The console removes a Category. Its Products stay.'),

  ('set_category_products', 'function', 'anon', false,
   'Only the dispatcher maintains the catalog. Not granted.'),
  ('set_category_products', 'function', 'customer', false,
   'Customers never arrange the catalog. Raises insufficient_privilege.'),
  ('set_category_products', 'function', 'driver', false,
   'Drivers never arrange the catalog. Raises insufficient_privilege.'),
  ('set_category_products', 'function', 'dispatcher', true,
   'The console adds, removes and orders the Products in a Category.');
