-- Shop settings: the shop's rules as data, maintained by the dispatcher on the console.
--
-- One row of scalar settings, the Ordering window as one row per open weekday, and the
-- dates the shop is closed. Like profiles, the tables live in `app`; clients read and
-- write them only through RPCs in `public`, each listed in the access matrix.
--
-- The values the business has agreed on are set here, so production has them from the
-- first migration. Those it has not -- radius, fee, Shop phone, the Time confirmation
-- morning cut-off, which weekdays are open and from when -- are left empty, and the seed
-- fills in placeholders for local and preview work. A rule that needs an empty setting
-- has nothing to judge against, which is the honest answer until someone decides.

create table app.shop_settings (
  -- Exactly one row: the shop has one set of rules.
  id boolean primary key default true constraint shop_settings_singleton check (id),

  -- How long before the Ordering window closes today stops being offered: the Same-day
  -- cutoff is that day's closing time minus this, so a 16:00 close and 30 make 15:30.
  same_day_cutoff_buffer_minutes integer not null default 30
    constraint shop_settings_cutoff_buffer_range check (same_day_cutoff_buffer_minutes between 0 and 720),

  -- Road distance from the Shop pin to an Address's pin.
  delivery_radius_meters integer
    constraint shop_settings_radius_positive check (delivery_radius_meters > 0),

  -- Whole centavos, like every amount of money in this system.
  delivery_fee_centavos integer
    constraint shop_settings_fee_not_negative check (delivery_fee_centavos >= 0),

  -- E.164: a plus, a country code, and no spaces or punctuation.
  shop_phone text
    constraint shop_settings_phone_e164 check (shop_phone ~ '^\+[1-9][0-9]{7,14}$'),

  -- The object in the `shop` Storage bucket customers pay against.
  qr_ph_image_path text
    constraint shop_settings_qr_path_not_blank check (length(btrim(qr_ph_image_path)) > 0),

  -- When duty auto-ends for a driver holding no work.
  end_of_day time not null default '16:00',

  -- How long without a fix before a driver holding work counts as dark.
  dark_threshold_minutes integer not null default 10
    constraint shop_settings_dark_threshold_range check (dark_threshold_minutes between 1 and 120),

  -- An Order whose Time confirmation is still pending at this time on its delivery day
  -- is cancelled (ADR 0007).
  time_confirmation_cutoff time,

  updated_at timestamptz not null default app.now(),
  updated_by uuid references app.profiles (id) on delete set null
);

comment on table app.shop_settings is
  'The shop''s scalar rules. One row. Empty columns are settings the business has not agreed a value for yet.';

insert into app.shop_settings default values;

alter table app.shop_settings enable row level security;

revoke all on table app.shop_settings from public;
grant select, insert, update, delete on table app.shop_settings to service_role;

-- What every signed-in actor reads: the customer app shows the fee, the Shop phone and
-- the QR Ph code; the driver app judges darkness and end of day by the same numbers the
-- console does.
create or replace function public.shop_settings()
returns table (
  same_day_cutoff_buffer_minutes integer,
  delivery_radius_meters integer,
  delivery_fee_centavos integer,
  shop_phone text,
  qr_ph_image_path text,
  end_of_day time,
  dark_threshold_minutes integer,
  time_confirmation_cutoff time,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.same_day_cutoff_buffer_minutes,
    s.delivery_radius_meters,
    s.delivery_fee_centavos,
    s.shop_phone,
    s.qr_ph_image_path,
    s.end_of_day,
    s.dark_threshold_minutes,
    s.time_confirmation_cutoff,
    s.updated_at
  from app.shop_settings s
$$;

comment on function public.shop_settings() is
  'The shop''s scalar settings. Readable by any signed-in account; nobody without one.';

revoke execute on function public.shop_settings() from public, anon;
grant execute on function public.shop_settings() to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('shop_settings', 'function', 'anon', false,
   'Nothing before sign-in needs the shop''s rules. Not granted.'),
  ('shop_settings', 'function', 'customer', true,
   'The customer app shows the Delivery fee, the Shop phone and the QR Ph code, and offers times from them.'),
  ('shop_settings', 'function', 'driver', true,
   'The driver app judges end of day and darkness by the same numbers the console does.'),
  ('shop_settings', 'function', 'dispatcher', true,
   'The console''s settings surface shows the current values before editing them.');

-- The gate in front of every settings write. Returns who is writing, so the change can
-- be recorded against them, and refuses anyone but an active dispatcher with the same
-- insufficient_privilege `console_profile()` uses.
create or replace function app.require_active_dispatcher()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Late-bound: `policies.is_active_dispatcher()` is created further down, with the
  -- Storage policies that also ask it.
  if not policies.is_active_dispatcher() then
    raise exception 'only an active dispatcher may change the shop settings'
      using errcode = 'insufficient_privilege';
  end if;

  return auth.uid();
end
$$;

revoke execute on function app.require_active_dispatcher() from public;

-- Every settings write, scalar or not, stamps who changed the shop's rules last and when.
create or replace function app.record_settings_change(dispatcher_id uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  update app.shop_settings s
     set updated_at = app.now(), updated_by = dispatcher_id
   where s.id
$$;

revoke execute on function app.record_settings_change(uuid) from public;

-- The console's form submits every scalar setting together, so this replaces them all.
-- The QR Ph image is set apart, by `set_qr_ph_image`, because it arrives as an upload.
create or replace function public.update_shop_settings(
  same_day_cutoff_buffer_minutes integer,
  delivery_radius_meters integer,
  delivery_fee_centavos integer,
  shop_phone text,
  end_of_day time,
  dark_threshold_minutes integer,
  time_confirmation_cutoff time
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dispatcher_id uuid := app.require_active_dispatcher();
begin
  update app.shop_settings s
     set same_day_cutoff_buffer_minutes = update_shop_settings.same_day_cutoff_buffer_minutes,
         delivery_radius_meters = update_shop_settings.delivery_radius_meters,
         delivery_fee_centavos = update_shop_settings.delivery_fee_centavos,
         shop_phone = update_shop_settings.shop_phone,
         end_of_day = update_shop_settings.end_of_day,
         dark_threshold_minutes = update_shop_settings.dark_threshold_minutes,
         time_confirmation_cutoff = update_shop_settings.time_confirmation_cutoff
   where s.id;

  perform app.record_settings_change(dispatcher_id);
end
$$;

comment on function public.update_shop_settings(integer, integer, integer, text, time, integer, time) is
  'Replaces every scalar shop setting but the QR Ph image. Active dispatchers only; raises insufficient_privilege otherwise.';

revoke execute on function public.update_shop_settings(integer, integer, integer, text, time, integer, time) from public, anon;
grant execute on function public.update_shop_settings(integer, integer, integer, text, time, integer, time) to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('update_shop_settings', 'function', 'anon', false,
   'Only the dispatcher maintains the shop''s rules. Not granted.'),
  ('update_shop_settings', 'function', 'customer', false,
   'Customers read the rules they order under; they never set them. Raises insufficient_privilege.'),
  ('update_shop_settings', 'function', 'driver', false,
   'Drivers read end of day and the dark threshold; they never set them. Raises insufficient_privilege.'),
  ('update_shop_settings', 'function', 'dispatcher', true,
   'The console''s settings form. Deactivated dispatchers are refused.');

-- The Ordering window: one row per weekday the shop delivers, ISO-numbered (Monday 1 to
-- Sunday 7, as `extract(isodow ...)` reads them). A weekday with no row is closed.
create table app.ordering_hours (
  weekday integer primary key
    constraint ordering_hours_iso_weekday check (weekday between 1 and 7),
  opens_at time not null,
  closes_at time not null,
  constraint ordering_hours_open_before_close check (opens_at < closes_at)
);

comment on table app.ordering_hours is
  'The Ordering window. One row per open ISO weekday; a missing weekday is closed.';

-- Dates the shop does not deliver on, whatever its weekday hours say.
create table app.shop_closures (
  closed_on date primary key,
  note text constraint shop_closures_note_not_blank check (length(btrim(note)) > 0)
);

comment on table app.shop_closures is
  'Dates the shop is closed, such as holidays. They override the Ordering window.';

alter table app.ordering_hours enable row level security;
alter table app.shop_closures enable row level security;

revoke all on table app.ordering_hours, app.shop_closures from public;
grant select, insert, update, delete on table app.ordering_hours, app.shop_closures to service_role;

create or replace function public.ordering_window()
returns table (weekday integer, opens_at time, closes_at time)
language sql
stable
security definer
set search_path = ''
as $$
  select h.weekday, h.opens_at, h.closes_at
  from app.ordering_hours h
  order by h.weekday
$$;

comment on function public.ordering_window() is
  'The open weekdays (ISO, Monday 1) and their hours. A weekday not listed is closed.';

-- Opens a weekday with both times, or closes it with neither. Half an answer is refused
-- rather than guessed at.
create or replace function public.set_ordering_day(weekday integer, opens_at time, closes_at time)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dispatcher_id uuid := app.require_active_dispatcher();
begin
  if (opens_at is null) <> (closes_at is null) then
    raise exception 'a weekday is open with both times or closed with neither'
      using errcode = 'invalid_parameter_value';
  end if;

  if opens_at is null then
    delete from app.ordering_hours h where h.weekday = set_ordering_day.weekday;
  else
    insert into app.ordering_hours as h (weekday, opens_at, closes_at)
    values (set_ordering_day.weekday, set_ordering_day.opens_at, set_ordering_day.closes_at)
    on conflict on constraint ordering_hours_pkey do update
      set opens_at = excluded.opens_at, closes_at = excluded.closes_at;
  end if;

  perform app.record_settings_change(dispatcher_id);
end
$$;

comment on function public.set_ordering_day(integer, time, time) is
  'Sets one weekday''s hours, or closes it when both are null. Active dispatchers only.';

-- Past closures bear on no rule -- nobody can order for yesterday -- so only those from
-- today on are shown.
create or replace function public.shop_closures()
returns table (closed_on date, note text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.closed_on, c.note
  from app.shop_closures c
  where c.closed_on >= app.today()
  order by c.closed_on
$$;

comment on function public.shop_closures() is
  'The dates from today on that the shop is closed, with their notes.';

create or replace function public.add_shop_closure(closed_on date, note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dispatcher_id uuid := app.require_active_dispatcher();
begin
  insert into app.shop_closures as c (closed_on, note)
  values (add_shop_closure.closed_on, nullif(btrim(add_shop_closure.note), ''))
  on conflict on constraint shop_closures_pkey do update set note = excluded.note;

  perform app.record_settings_change(dispatcher_id);
end
$$;

comment on function public.add_shop_closure(date, text) is
  'Closes the shop on a date, or rewrites the note of one already closed. Active dispatchers only.';

create or replace function public.remove_shop_closure(closed_on date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dispatcher_id uuid := app.require_active_dispatcher();
begin
  delete from app.shop_closures c where c.closed_on = remove_shop_closure.closed_on;

  perform app.record_settings_change(dispatcher_id);
end
$$;

comment on function public.remove_shop_closure(date) is
  'Reopens a closed date. Active dispatchers only.';

revoke execute on function
  public.ordering_window(),
  public.set_ordering_day(integer, time, time),
  public.shop_closures(),
  public.add_shop_closure(date, text),
  public.remove_shop_closure(date)
from public, anon;

grant execute on function
  public.ordering_window(),
  public.set_ordering_day(integer, time, time),
  public.shop_closures(),
  public.add_shop_closure(date, text),
  public.remove_shop_closure(date)
to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('ordering_window', 'function', 'anon', false,
   'Nothing before sign-in offers delivery times. Not granted.'),
  ('ordering_window', 'function', 'customer', true,
   'Requested delivery times are chosen from it.'),
  ('ordering_window', 'function', 'driver', true,
   'The days and hours the shop delivers are the days and hours drivers work.'),
  ('ordering_window', 'function', 'dispatcher', true,
   'The settings surface shows the hours before editing them.'),

  ('set_ordering_day', 'function', 'anon', false,
   'Only the dispatcher maintains the Ordering window. Not granted.'),
  ('set_ordering_day', 'function', 'customer', false,
   'Customers order within the window; they never move it. Raises insufficient_privilege.'),
  ('set_ordering_day', 'function', 'driver', false,
   'Drivers work the window; they never set it. Raises insufficient_privilege.'),
  ('set_ordering_day', 'function', 'dispatcher', true,
   'The settings surface opens, closes and re-times a weekday.'),

  ('shop_closures', 'function', 'anon', false,
   'Nothing before sign-in offers delivery days. Not granted.'),
  ('shop_closures', 'function', 'customer', true,
   'A closed date is never offered as a delivery day.'),
  ('shop_closures', 'function', 'driver', true,
   'Drivers see which days nobody works.'),
  ('shop_closures', 'function', 'dispatcher', true,
   'The settings surface lists the closures still to come.'),

  ('add_shop_closure', 'function', 'anon', false,
   'Only the dispatcher closes the shop. Not granted.'),
  ('add_shop_closure', 'function', 'customer', false,
   'Customers never close the shop. Raises insufficient_privilege.'),
  ('add_shop_closure', 'function', 'driver', false,
   'Drivers never close the shop. Raises insufficient_privilege.'),
  ('add_shop_closure', 'function', 'dispatcher', true,
   'The settings surface adds a holiday or other closed date.'),

  ('remove_shop_closure', 'function', 'anon', false,
   'Only the dispatcher reopens a closed date. Not granted.'),
  ('remove_shop_closure', 'function', 'customer', false,
   'Customers never reopen the shop. Raises insufficient_privilege.'),
  ('remove_shop_closure', 'function', 'driver', false,
   'Drivers never reopen the shop. Raises insufficient_privilege.'),
  ('remove_shop_closure', 'function', 'dispatcher', true,
   'The settings surface removes a closure added by mistake.');

-- The QR Ph image lives in Storage, in a private `shop` bucket: any signed-in account may
-- download it, only an active dispatcher may put anything there. Each upload takes a
-- new name rather than overwriting the old one, so no phone is ever shown a cached image
-- after it has been replaced.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop', 'shop', false, 2 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- The access matrix only sees `public`, so these rights are not in it. They are written
-- down here and held by supabase/tests/qr_ph_image_test.sql instead:
--
--   anon        nothing
--   customer    download                (pays against the code)
--   driver      download                (no use for it, no harm in it)
--   dispatcher  upload, replace, remove
--
-- Storage policies are evaluated as the caller, and `app` is closed to callers. This
-- schema holds the one question the policies need answered, and nothing else. It is not
-- in `api.schemas`, so PostgREST never serves it.
create schema if not exists policies;

revoke all on schema policies from public;
grant usage on schema policies to authenticated, service_role;

comment on schema policies is
  'Helpers row-security policies call. Usable by authenticated, never served by PostgREST.';

create or replace function policies.is_active_dispatcher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.profiles p
    where p.id = auth.uid() and p.role = 'dispatcher' and p.active
  )
$$;

comment on function policies.is_active_dispatcher() is
  'Whether the caller is an active dispatcher. For policies outside app, such as Storage''s.';

revoke execute on function policies.is_active_dispatcher() from public;
grant execute on function policies.is_active_dispatcher() to authenticated, service_role;

create policy "Signed-in accounts read the shop bucket"
  on storage.objects for select to authenticated
  using (bucket_id = 'shop');

create policy "Active dispatchers upload to the shop bucket"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'shop' and policies.is_active_dispatcher());

create policy "Active dispatchers replace objects in the shop bucket"
  on storage.objects for update to authenticated
  using (bucket_id = 'shop' and policies.is_active_dispatcher())
  with check (bucket_id = 'shop' and policies.is_active_dispatcher());

create policy "Active dispatchers remove objects from the shop bucket"
  on storage.objects for delete to authenticated
  using (bucket_id = 'shop' and policies.is_active_dispatcher());

-- Points the settings at an uploaded image and hands back the one it replaced, so the
-- console can remove it. Refuses a path with nothing behind it: a customer told to pay
-- against a missing image has no way to pay at all.
create or replace function public.set_qr_ph_image(path text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  dispatcher_id uuid := app.require_active_dispatcher();
  replaced text;
begin
  if not exists (
    select 1 from storage.objects o where o.bucket_id = 'shop' and o.name = path
  ) then
    raise exception 'nothing has been uploaded to the shop bucket at %', path
      using errcode = 'invalid_parameter_value';
  end if;

  select s.qr_ph_image_path into replaced from app.shop_settings s where s.id;

  update app.shop_settings s set qr_ph_image_path = path where s.id;
  perform app.record_settings_change(dispatcher_id);

  return replaced;
end
$$;

comment on function public.set_qr_ph_image(text) is
  'Points the settings at a QR Ph image already in the shop bucket; returns the path it replaced. Active dispatchers only.';

revoke execute on function public.set_qr_ph_image(text) from public, anon;
grant execute on function public.set_qr_ph_image(text) to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('set_qr_ph_image', 'function', 'anon', false,
   'Only the dispatcher sets the code customers pay against. Not granted.'),
  ('set_qr_ph_image', 'function', 'customer', false,
   'A customer choosing the code they pay against could pay themselves. Raises insufficient_privilege.'),
  ('set_qr_ph_image', 'function', 'driver', false,
   'Drivers never handle payment. Raises insufficient_privilege.'),
  ('set_qr_ph_image', 'function', 'dispatcher', true,
   'The settings surface uploads a new image to the shop bucket, then points here at it.');
