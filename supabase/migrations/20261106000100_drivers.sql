-- Drivers: their name, and whether they are On duty.
--
-- A driver is provisioned by the dispatcher (the `invite-driver` Edge Function), signs
-- in to the driver app on whichever vehicle phone they take, and is On duty from that
-- sign-in until they sign out. On duty is a flag plus the time it last changed, and
-- nothing more: it is deliberately not a timekeeping record, so no history is kept.

alter table app.profiles
  -- What the driver app's sign-in screen and the console call this person. Drivers
  -- always have one; nobody else needs one yet.
  add column display_name text
    constraint profiles_display_name_not_blank check (length(btrim(display_name)) > 0),
  add column on_duty boolean not null default false,
  add column on_duty_changed_at timestamptz;

-- Any driver that predates this migration is named after their email until renamed.
update app.profiles p
   set display_name = split_part(u.email, '@', 1)
  from auth.users u
 where u.id = p.id and p.role = 'driver' and p.display_name is null;

alter table app.profiles
  add constraint profiles_driver_has_a_name check (role <> 'driver' or display_name is not null),
  -- Only an active driver can be available for work. Deactivation clears it in the
  -- same step it nulls the push token.
  add constraint profiles_on_duty_is_an_active_driver check (not on_duty or (role = 'driver' and active)),
  add constraint profiles_on_duty_has_a_time check (not on_duty or on_duty_changed_at is not null);

comment on column app.profiles.display_name is
  'The name the driver app and the console show. Required for drivers; set from app metadata when the account is created.';
comment on column app.profiles.on_duty is
  'Whether the driver is available for work: set by signing in to the driver app, cleared by signing out. No history.';
comment on column app.profiles.on_duty_changed_at is
  'When on_duty last changed, by the server clock. Null for an account that has never been On duty.';

-- The name rides in app metadata beside the role, for the same reason: only the service
-- role can write it, so a public sign-up cannot name itself anything.
create or replace function app.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app.profiles (id, role, display_name)
  values (
    new.id,
    app.role_from_app_metadata(new.raw_app_meta_data),
    nullif(btrim(new.raw_app_meta_data ->> 'name'), '')
  );
  return new;
end
$$;

-- GoTrue's `admin.createUser` -- which is how `invite-driver` provisions a driver --
-- inserts the user with only the provider in app metadata, then writes the rest in a
-- second statement. So the role and name are copied again whenever app metadata
-- changes, but only until the account is first signed in to: from then on what it is
-- to the shop is settled, and a later metadata edit cannot quietly re-role it.
create or replace function app.settle_profile_from_app_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_sign_in_at is null then
    update app.profiles p
       set role = app.role_from_app_metadata(new.raw_app_meta_data),
           display_name = nullif(btrim(new.raw_app_meta_data ->> 'name'), '')
     where p.id = new.id;
  end if;
  return new;
end
$$;

revoke execute on function app.settle_profile_from_app_metadata() from public;

create trigger settle_profile_after_app_metadata_update
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
  execute function app.settle_profile_from_app_metadata();

-- The guard every driver-app RPC opens with: the caller, if they are an active driver,
-- or insufficient_privilege -- the same refusal the console's guard gives.
create or replace function app.require_active_driver()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from app.profiles p
    where p.id = auth.uid() and p.role = 'driver' and p.active
  ) then
    raise exception 'only an active driver may use the driver app'
      using errcode = 'insufficient_privilege';
  end if;

  return auth.uid();
end
$$;

revoke execute on function app.require_active_driver() from public;

-- A driver as the driver app sees them.
create or replace function app.driver(driver_id uuid)
returns table (
  id uuid,
  email text,
  name text,
  on_duty boolean,
  on_duty_changed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, u.email::text, p.display_name, p.on_duty, p.on_duty_changed_at
  from app.profiles p
  join auth.users u on u.id = p.id
  where p.id = driver_id
$$;

revoke execute on function app.driver(uuid) from public;

-- Signing in is going On duty. The driver app calls this straight after authenticating;
-- a refusal means the account is not an active driver, and the app signs it back out.
create or replace function public.go_on_duty()
returns table (
  id uuid,
  email text,
  name text,
  on_duty boolean,
  on_duty_changed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  driver_id uuid := app.require_active_driver();
begin
  update app.profiles p
     set on_duty = true,
         -- A second sign-in mid-shift changes nothing, so it keeps the time.
         on_duty_changed_at = case when p.on_duty then p.on_duty_changed_at else app.now() end
   where p.id = driver_id;

  return query select * from app.driver(driver_id);
end
$$;

comment on function public.go_on_duty() is
  'Puts the signed-in driver On duty and returns them. Raises insufficient_privilege for anyone but an active driver.';

revoke execute on function public.go_on_duty() from public, anon;
grant execute on function public.go_on_duty() to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('go_on_duty', 'function', 'anon', false,
   'Nobody is signed in, so nobody can go On duty. Not granted.'),
  ('go_on_duty', 'function', 'customer', false,
   'Customers are never available for work. Raises insufficient_privilege.'),
  ('go_on_duty', 'function', 'driver', true,
   'Signing in to the driver app is going On duty. Deactivated drivers are refused.'),
  ('go_on_duty', 'function', 'dispatcher', false,
   'A dispatcher cannot put anyone On duty, themselves included; only a driver signing in does. Raises insufficient_privilege.');

-- Signing out is coming off duty. The driver app calls this before it drops the
-- session, so a driver is never left On duty by a phone that has already let go.
create or replace function public.go_off_duty()
returns table (
  id uuid,
  email text,
  name text,
  on_duty boolean,
  on_duty_changed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  driver_id uuid := app.require_active_driver();
begin
  update app.profiles p
     set on_duty = false,
         on_duty_changed_at = case when p.on_duty then app.now() else p.on_duty_changed_at end
   where p.id = driver_id;

  return query select * from app.driver(driver_id);
end
$$;

comment on function public.go_off_duty() is
  'Takes the signed-in driver off duty and returns them. Raises insufficient_privilege for anyone but an active driver.';

revoke execute on function public.go_off_duty() from public, anon;
grant execute on function public.go_off_duty() to authenticated, service_role;

-- What the driver app asks when it resumes a session the phone stored earlier: the
-- account may have been deactivated since, and resuming is not signing in, so it
-- changes nothing.
create or replace function public.driver_profile()
returns table (
  id uuid,
  email text,
  name text,
  on_duty boolean,
  on_duty_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query select * from app.driver(app.require_active_driver());
end
$$;

comment on function public.driver_profile() is
  'The signed-in driver. Raises insufficient_privilege for anyone but an active driver.';

revoke execute on function public.driver_profile() from public, anon;
grant execute on function public.driver_profile() to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('go_off_duty', 'function', 'anon', false,
   'Nobody is signed in, so nobody is On duty. Not granted.'),
  ('go_off_duty', 'function', 'customer', false,
   'Customers are never On duty. Raises insufficient_privilege.'),
  ('go_off_duty', 'function', 'driver', true,
   'Signing out of the driver app takes the driver off duty.'),
  ('go_off_duty', 'function', 'dispatcher', false,
   'A dispatcher does not take drivers off duty; deactivation does that as a side effect. Raises insufficient_privilege.'),
  ('driver_profile', 'function', 'anon', false,
   'Nobody is signed in, so there is nobody to describe. Not granted.'),
  ('driver_profile', 'function', 'customer', false,
   'The driver app is not the customer''s. Raises insufficient_privilege.'),
  ('driver_profile', 'function', 'driver', true,
   'How the driver app confirms a stored session still belongs to an active driver.'),
  ('driver_profile', 'function', 'dispatcher', false,
   'The dispatcher reads drivers through dispatcher_drivers instead. Raises insufficient_privilege.');

-- The console's driver list: everyone the dispatcher has provisioned, deactivated ones
-- included so a mistaken deactivation is visible, each with their On duty state.
create or replace function public.dispatcher_drivers()
returns table (
  id uuid,
  email text,
  name text,
  active boolean,
  deactivated_at timestamptz,
  on_duty boolean,
  on_duty_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_active_dispatcher();

  return query
    select p.id, u.email::text, p.display_name, p.active, p.deactivated_at,
           p.on_duty, p.on_duty_changed_at
    from app.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'driver'
    order by p.active desc, p.display_name, u.email;
end
$$;

comment on function public.dispatcher_drivers() is
  'Every driver, active first then by name, with On duty state. Active dispatchers only.';

revoke execute on function public.dispatcher_drivers() from public, anon;
grant execute on function public.dispatcher_drivers() to authenticated, service_role;

-- Deactivation is soft: the profile stays, so everything they ever did still points at
-- someone. In one transaction it takes them off duty, nulls their push token, bans the
-- Auth user and ends their sessions -- so they cannot sign in, a refresh token they
-- hold is worthless, and nobody pages a phone they no longer carry.
--
-- The ban is written straight to `auth.users` rather than through the Admin API, so it
-- cannot land without the profile change or the profile change without it. GoTrue
-- reads `banned_until` on every password sign-in and token refresh.
create or replace function public.deactivate_driver(driver_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_active_dispatcher();

  update app.profiles p
     set active = false,
         deactivated_at = coalesce(p.deactivated_at, app.now()),
         push_token = null,
         on_duty = false,
         on_duty_changed_at = case when p.on_duty then app.now() else p.on_duty_changed_at end
   where p.id = deactivate_driver.driver_id and p.role = 'driver';

  if not found then
    raise exception 'no driver %', deactivate_driver.driver_id
      using errcode = 'no_data_found';
  end if;

  -- Far enough out to be permanent; `infinity` is not a time GoTrue can parse.
  update auth.users u
     set banned_until = app.now() + interval '1000 years',
         updated_at = app.now()
   where u.id = deactivate_driver.driver_id;

  -- Refresh tokens go with their session.
  delete from auth.sessions s where s.user_id = deactivate_driver.driver_id;
end
$$;

comment on function public.deactivate_driver(uuid) is
  'Soft-deactivates a driver: off duty, push token nulled, Auth user banned, sessions ended. Active dispatchers only.';

revoke execute on function public.deactivate_driver(uuid) from public, anon;
grant execute on function public.deactivate_driver(uuid) to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('dispatcher_drivers', 'function', 'anon', false,
   'Staff names and emails are not public. Not granted.'),
  ('dispatcher_drivers', 'function', 'customer', false,
   'Customers never see the roster. Raises insufficient_privilege.'),
  ('dispatcher_drivers', 'function', 'driver', false,
   'Drivers do not see each other''s duty state. Raises insufficient_privilege.'),
  ('dispatcher_drivers', 'function', 'dispatcher', true,
   'The console lists drivers with their On duty state.'),
  ('deactivate_driver', 'function', 'anon', false,
   'Not granted.'),
  ('deactivate_driver', 'function', 'customer', false,
   'Raises insufficient_privilege.'),
  ('deactivate_driver', 'function', 'driver', false,
   'A driver cannot deactivate anyone, themselves included. Raises insufficient_privilege.'),
  ('deactivate_driver', 'function', 'dispatcher', true,
   'Staff changes: a driver who leaves is deactivated, never deleted.');
