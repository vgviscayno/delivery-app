-- Customer Addresses (ticket #64): the places a customer has saved to receive Orders at.
--
-- The pin is authoritative: it is where the driver navigates to. The formatted address
-- (a Mapbox Permanent Geocode, reverse-geocoded from the pin with `permanent=true`),
-- the unit and the landmark note only help a human close the last few metres. Every
-- Address carries an Arrival contact: whoever should be rung at that door.
--
-- Exactly one undeleted Address per customer is the default. Deleting is soft, like a
-- Product's: an Order copies its Delivery address whole at submission (ADR 0003), so
-- nothing placed ever depends on this row again.
--
-- Raw coordinates go back to the customer app only to put the pin on a map; no surface
-- displays them (Mapbox Product Terms §2.7.1(b)).

create table app.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references app.profiles (id),
  label text not null
    constraint addresses_label_present check (length(btrim(label)) > 0),
  pin extensions.geography(point, 4326) not null,
  formatted_address text,
  unit text,
  landmark text,
  arrival_contact_name text not null
    constraint addresses_arrival_contact_name_present
      check (length(btrim(arrival_contact_name)) > 0),
  -- Any Philippine number in E.164, landlines included: the Arrival contact may be an
  -- office receptionist with no mobile.
  arrival_contact_phone text not null
    constraint addresses_arrival_contact_phone_is_e164
      check (arrival_contact_phone ~ '^\+63[0-9]{9,10}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default app.now(),
  updated_at timestamptz not null default app.now(),
  deleted_at timestamptz
);

comment on table app.addresses is
  'A customer''s saved Addresses. The pin is authoritative. Soft-deleted; one undeleted default per customer.';
comment on column app.addresses.pin is
  'Where the driver goes. Placed or confirmed by the customer. Never displayed as coordinates.';
comment on column app.addresses.formatted_address is
  'A Mapbox Permanent Geocode of the pin. Null where Mapbox knows no street address there.';

create index addresses_customer_idx on app.addresses (customer_id) where deleted_at is null;

-- At most one undeleted default per customer, even when two saves race for the first
-- Address. "At least one" is the RPCs' job: the first save claims it, and deleting the
-- default promotes a survivor.
create unique index addresses_one_default_per_customer
  on app.addresses (customer_id) where is_default and deleted_at is null;

alter table app.addresses enable row level security;

revoke all on table app.addresses from public;
grant select, insert, update, delete on table app.addresses to service_role;

-- What the customer app reads for one customer: undeleted, the default first, then the
-- newest.
create or replace function app.customer_addresses(customer_id uuid)
returns table (
  id uuid,
  label text,
  latitude double precision,
  longitude double precision,
  formatted_address text,
  unit text,
  landmark text,
  arrival_contact_name text,
  arrival_contact_phone text,
  is_default boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.label,
    extensions.st_y(a.pin::extensions.geometry),
    extensions.st_x(a.pin::extensions.geometry),
    a.formatted_address,
    a.unit,
    a.landmark,
    a.arrival_contact_name,
    a.arrival_contact_phone,
    a.is_default,
    a.created_at
  from app.addresses a
  where a.customer_id = customer_addresses.customer_id and a.deleted_at is null
  order by a.is_default desc, a.created_at desc, a.id
$$;

revoke execute on function app.customer_addresses(uuid) from public;

create or replace function public.customer_addresses()
returns table (
  id uuid,
  label text,
  latitude double precision,
  longitude double precision,
  formatted_address text,
  unit text,
  landmark text,
  arrival_contact_name text,
  arrival_contact_phone text,
  is_default boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query select * from app.customer_addresses(app.require_active_customer());
end
$$;

comment on function public.customer_addresses() is
  'The signed-in customer''s own undeleted Addresses, default first. Active customers only.';

revoke execute on function public.customer_addresses() from public, anon;
grant execute on function public.customer_addresses() to authenticated, service_role;

-- Adds an Address when `id` is null, or replaces every field of one of the caller's
-- own. The first Address a customer saves becomes their default. Returns its id.
create or replace function public.save_address(
  id uuid,
  label text,
  latitude double precision,
  longitude double precision,
  formatted_address text,
  unit text,
  landmark text,
  arrival_contact_name text,
  arrival_contact_phone text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner uuid := app.require_active_customer();
  placed extensions.geography := extensions.st_setsrid(
    extensions.st_makepoint(save_address.longitude, save_address.latitude), 4326
  )::extensions.geography;
  saved uuid;
begin
  if save_address.id is not null then
    update app.addresses a
       set label = btrim(save_address.label),
           pin = placed,
           formatted_address = nullif(btrim(save_address.formatted_address), ''),
           unit = nullif(btrim(save_address.unit), ''),
           landmark = nullif(btrim(save_address.landmark), ''),
           arrival_contact_name = btrim(save_address.arrival_contact_name),
           arrival_contact_phone = save_address.arrival_contact_phone,
           updated_at = app.now()
     where a.id = save_address.id and a.customer_id = owner and a.deleted_at is null
    returning a.id into saved;

    -- Another customer's Address is "not found" too, so its existence never leaks.
    if saved is null then
      raise exception 'there is no Address % to edit', save_address.id
        using errcode = 'no_data_found';
    end if;

    return saved;
  end if;

  insert into app.addresses as a (
    customer_id, label, pin, formatted_address, unit, landmark,
    arrival_contact_name, arrival_contact_phone, is_default
  )
  values (
    owner,
    btrim(save_address.label),
    placed,
    nullif(btrim(save_address.formatted_address), ''),
    nullif(btrim(save_address.unit), ''),
    nullif(btrim(save_address.landmark), ''),
    btrim(save_address.arrival_contact_name),
    save_address.arrival_contact_phone,
    not exists (
      select 1 from app.addresses d
      where d.customer_id = owner and d.deleted_at is null
    )
  )
  returning a.id into saved;

  return saved;
end
$$;

comment on function public.save_address(uuid, text, double precision, double precision, text, text, text, text, text) is
  'Adds an Address (null id) or replaces one of the caller''s own; returns its id. The first becomes the default. Active customers only.';

revoke execute on function public.save_address(uuid, text, double precision, double precision, text, text, text, text, text) from public, anon;
grant execute on function public.save_address(uuid, text, double precision, double precision, text, text, text, text, text) to authenticated, service_role;

-- Makes one of the caller's own Addresses their default, and the old default an
-- ordinary Address. Checkout preselects it.
create or replace function public.set_default_address(id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner uuid := app.require_active_customer();
begin
  if not exists (
    select 1 from app.addresses a
    where a.id = set_default_address.id and a.customer_id = owner and a.deleted_at is null
  ) then
    raise exception 'there is no Address % to make the default', set_default_address.id
      using errcode = 'no_data_found';
  end if;

  -- Cleared first: the one-default index is checked per statement.
  update app.addresses a
     set is_default = false, updated_at = app.now()
   where a.customer_id = owner and a.is_default and a.id <> set_default_address.id;

  update app.addresses a
     set is_default = true, updated_at = app.now()
   where a.id = set_default_address.id and not a.is_default;
end
$$;

comment on function public.set_default_address(uuid) is
  'Makes one of the caller''s own undeleted Addresses their default. Active customers only.';

revoke execute on function public.set_default_address(uuid) from public, anon;
grant execute on function public.set_default_address(uuid) to authenticated, service_role;

-- Soft-deletes one of the caller's own Addresses. Placed Orders keep their own copy, so
-- this needs no guard. Deleting the default promotes the most recently created survivor,
-- so a customer with any Address left always has a default.
create or replace function public.delete_address(id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner uuid := app.require_active_customer();
  was_default boolean;
begin
  select a.is_default into was_default
  from app.addresses a
  where a.id = delete_address.id and a.customer_id = owner and a.deleted_at is null
  for update;

  if not found then
    raise exception 'there is no Address % to delete', delete_address.id
      using errcode = 'no_data_found';
  end if;

  update app.addresses a
     set deleted_at = app.now(), is_default = false, updated_at = app.now()
   where a.id = delete_address.id;

  if was_default then
    update app.addresses a
       set is_default = true, updated_at = app.now()
     where a.id = (
       select s.id from app.addresses s
       where s.customer_id = owner and s.deleted_at is null
       order by s.created_at desc, s.id
       limit 1
     );
  end if;
end
$$;

comment on function public.delete_address(uuid) is
  'Soft-deletes one of the caller''s own Addresses; deleting the default promotes the newest survivor. Active customers only.';

revoke execute on function public.delete_address(uuid) from public, anon;
grant execute on function public.delete_address(uuid) to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('delete_address', 'function', 'anon', false,
   'Nobody is signed in, so there is nothing to delete. Not granted.'),
  ('delete_address', 'function', 'customer', true,
   'A customer deletes their own Addresses, softly; placed Orders keep their copy. Another''s is not found.'),
  ('delete_address', 'function', 'driver', false,
   'Drivers have no saved Addresses. Raises insufficient_privilege.'),
  ('delete_address', 'function', 'dispatcher', false,
   'A customer''s address book is theirs. Raises insufficient_privilege.'),
  ('set_default_address', 'function', 'anon', false,
   'Nobody is signed in, so there is no default to choose. Not granted.'),
  ('set_default_address', 'function', 'customer', true,
   'A customer chooses which of their own Addresses checkout preselects. Another''s is not found.'),
  ('set_default_address', 'function', 'driver', false,
   'Drivers have no saved Addresses. Raises insufficient_privilege.'),
  ('set_default_address', 'function', 'dispatcher', false,
   'Which Address a customer prefers is theirs to choose. Raises insufficient_privilege.'),
  ('customer_addresses', 'function', 'anon', false,
   'Nobody is signed in, so there are no Addresses to show. Not granted.'),
  ('customer_addresses', 'function', 'customer', true,
   'The customer''s own undeleted Addresses, for the Account tab and checkout. Never anyone else''s.'),
  ('customer_addresses', 'function', 'driver', false,
   'A driver sees the Delivery address copied onto an Order they hold, never a customer''s saved Addresses. Raises insufficient_privilege.'),
  ('customer_addresses', 'function', 'dispatcher', false,
   'A dispatcher sees the Delivery address copied onto each Order, never the saved Addresses behind it. Raises insufficient_privilege.'),
  ('save_address', 'function', 'anon', false,
   'Nobody is signed in, so there is no one to save an Address for. Not granted.'),
  ('save_address', 'function', 'customer', true,
   'A customer adds or edits their own Addresses. Editing reaches only their own; another''s is not found.'),
  ('save_address', 'function', 'driver', false,
   'Nothing a driver learns at the door flows back to a saved Address. Raises insufficient_privilege.'),
  ('save_address', 'function', 'dispatcher', false,
   'A dispatcher may correct one Order''s copy, never the saved Address (ADR 0003). Raises insufficient_privilege.');
