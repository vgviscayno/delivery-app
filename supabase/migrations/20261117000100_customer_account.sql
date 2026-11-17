-- Customer Account: the Account phone.
--
-- Every customer gives one at sign-up. It is how a driver or the dispatcher reaches
-- them about an order, so it is required, but never SMS-verified (ADR 0005). Stored
-- E.164 and Philippine only: the customer app normalises what was typed (`0917 …`,
-- `+63 917-…`, a landline), and the server only checks the result. The customer reads
-- and changes their own; a dispatcher may read it but never change it.

alter table app.profiles
  add column account_phone text
    constraint profiles_account_phone_is_e164 check (account_phone ~ '^\+63[1-9][0-9]{8,9}$'),
  add constraint profiles_account_phone_is_a_customers
    check (account_phone is null or role = 'customer');

comment on column app.profiles.account_phone is
  'The customer''s Account phone, E.164 (+63…). Required for customers, null for everyone else. Never SMS-verified.';

-- Required for every customer, but checked at commit rather than per statement: GoTrue's
-- `admin.createUser` -- how `invite-driver` provisions a driver -- inserts the user as a
-- customer with no metadata, then writes the driver role a statement later. The row is
-- read again here because the event's NEW is the row as it was then, not as it is now.
create or replace function app.require_customer_account_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from app.profiles p
    where p.id = new.id and p.role = 'customer' and p.account_phone is null
  ) then
    raise exception 'a customer needs an Account phone'
      using errcode = 'not_null_violation';
  end if;
  return null;
end
$$;

revoke execute on function app.require_customer_account_phone() from public;

create constraint trigger profiles_customer_has_account_phone
  after insert or update of role, account_phone on app.profiles
  deferrable initially deferred
  for each row execute function app.require_customer_account_phone();

-- The phone rides in `raw_user_meta_data`, the caller's own sign-up data. That is safe
-- here, unlike the role: a customer may choose their own phone. Anyone else is not a
-- customer and keeps none, whatever they sent.
create or replace function app.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_role app.role := app.role_from_app_metadata(new.raw_app_meta_data);
begin
  insert into app.profiles (id, role, display_name, account_phone)
  values (
    new.id,
    new_role,
    nullif(btrim(new.raw_app_meta_data ->> 'name'), ''),
    case when new_role = 'customer'
      then nullif(btrim(new.raw_user_meta_data ->> 'account_phone'), '')
    end
  );
  return new;
end
$$;

-- Re-roled before the first sign-in, an account that stops being a customer stops
-- holding an Account phone.
create or replace function app.settle_profile_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_role app.role := app.role_from_app_metadata(new.raw_app_meta_data);
begin
  if new.last_sign_in_at is null then
    update app.profiles p
       set role = new_role,
           display_name = nullif(btrim(new.raw_app_meta_data ->> 'name'), ''),
           account_phone = case when new_role = 'customer' then p.account_phone end
     where p.id = new.id;
  end if;
  return new;
end
$$;

-- The guard every customer-app RPC opens with, the customer's twin of
-- `app.require_active_driver()`.
create or replace function app.require_active_customer()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.profiles p
    where p.id = auth.uid() and p.role = 'customer' and p.active
  ) then
    raise exception 'only an active customer may use the customer app'
      using errcode = 'insufficient_privilege';
  end if;

  return auth.uid();
end
$$;

revoke execute on function app.require_active_customer() from public;

-- What the customer app's Account tab shows. The email is Auth's, and read-only here.
create or replace function app.customer_account(customer_id uuid)
returns table (id uuid, email text, account_phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, u.email::text, p.account_phone
  from app.profiles p
  join auth.users u on u.id = p.id
  where p.id = customer_id
$$;

revoke execute on function app.customer_account(uuid) from public;

create or replace function public.customer_account()
returns table (id uuid, email text, account_phone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query select * from app.customer_account(app.require_active_customer());
end
$$;

comment on function public.customer_account() is
  'The signed-in customer''s own Account: id, email and Account phone. Active customers only.';

revoke execute on function public.customer_account() from public, anon;
grant execute on function public.customer_account() to authenticated, service_role;

-- No customer id: it only ever changes the caller's own phone.
create or replace function public.update_account_phone(phone text)
returns table (id uuid, email text, account_phone text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  customer_id uuid := app.require_active_customer();
begin
  update app.profiles p
     set account_phone = update_account_phone.phone
   where p.id = customer_id;

  return query select * from app.customer_account(customer_id);
end
$$;

comment on function public.update_account_phone(text) is
  'Changes the signed-in customer''s own Account phone (E.164, +63…). Active customers only; no one else''s.';

revoke execute on function public.update_account_phone(text) from public, anon;
grant execute on function public.update_account_phone(text) to authenticated, service_role;

-- The dispatcher's read of a customer's Account phone, to call them about an order.
create or replace function public.customer_account_phone(customer_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  phone text;
begin
  perform app.require_active_dispatcher();

  select p.account_phone into phone
  from app.profiles p
  where p.id = customer_account_phone.customer_id and p.role = 'customer';

  if not found then
    raise exception 'no customer %', customer_account_phone.customer_id
      using errcode = 'no_data_found';
  end if;

  return phone;
end
$$;

comment on function public.customer_account_phone(uuid) is
  'A customer''s Account phone, for the dispatcher to call them. Read-only: there is no dispatcher write. Active dispatchers only.';

revoke execute on function public.customer_account_phone(uuid) from public, anon;
grant execute on function public.customer_account_phone(uuid) to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('customer_account', 'function', 'anon', false,
   'Nobody is signed in, so there is no Account to show. Not granted.'),
  ('customer_account', 'function', 'customer', true,
   'The Account tab: the customer''s own email and Account phone, never anyone else''s.'),
  ('customer_account', 'function', 'driver', false,
   'Drivers have no customer Account. Raises insufficient_privilege.'),
  ('customer_account', 'function', 'dispatcher', false,
   'Dispatchers have no customer Account; they read Account phones through customer_account_phone. Raises insufficient_privilege.'),
  ('update_account_phone', 'function', 'anon', false,
   'Nobody is signed in, so there is no Account to change. Not granted.'),
  ('update_account_phone', 'function', 'customer', true,
   'A customer changes their own Account phone. It takes no customer id, so it cannot reach anyone else''s.'),
  ('update_account_phone', 'function', 'driver', false,
   'Drivers hold no Account phone. Raises insufficient_privilege.'),
  ('update_account_phone', 'function', 'dispatcher', false,
   'A dispatcher may read an Account phone but never change it: the number is the customer''s word, and a wrong one is theirs to fix (ADR 0005). Raises insufficient_privilege.'),
  ('customer_account_phone', 'function', 'anon', false,
   'Customers'' phone numbers are not public. Not granted.'),
  ('customer_account_phone', 'function', 'customer', false,
   'A customer reads their own phone through customer_account and nobody else''s. Raises insufficient_privilege.'),
  ('customer_account_phone', 'function', 'driver', false,
   'Not yet: a driver will see the phone of the customer on their current Order, through the Order, not by customer id. Raises insufficient_privilege.'),
  ('customer_account_phone', 'function', 'dispatcher', true,
   'The dispatcher reads a customer''s Account phone to call them about an order.');
