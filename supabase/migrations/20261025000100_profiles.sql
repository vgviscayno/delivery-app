-- Profiles: who an Auth user is to the shop.
--
-- One Supabase Auth instance holds every account -- customers, drivers and the
-- dispatcher alike -- and each has exactly one profile, created with the Auth user. The
-- profile carries the role, whether the account is still active, and the one push
-- token the account's phone last registered.
--
-- The table lives in `app`, out of PostgREST's reach. Clients learn about profiles only
-- through RPCs in `public`, each listed in the access matrix.

create type app.role as enum ('dispatcher', 'driver', 'customer');

comment on type app.role is
  'What an account is to the shop. Flat: there is no senior dispatcher, and nothing assumes there is only one.';

create table app.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role app.role not null,
  active boolean not null default true,
  deactivated_at timestamptz,
  -- One per account, overwritten by whichever phone registered last.
  push_token text,
  created_at timestamptz not null default app.now(),

  -- Deactivation is soft and recorded once: an inactive profile always says when, and
  -- an active one never carries a stale time.
  constraint profiles_deactivation_has_a_time check (active = (deactivated_at is null)),
  constraint profiles_push_token_not_blank check (push_token is null or length(btrim(push_token)) > 0),
  -- Deactivation nulls the push token in the same step, so nobody is paged after leaving.
  constraint profiles_inactive_has_no_push_token check (active or push_token is null)
);

comment on table app.profiles is
  'One per Auth user: role, active flag with its deactivation time, and a single overwritable FCM push token.';
comment on column app.profiles.push_token is
  'The FCM registration token of the phone that registered last. Nulled on deactivation.';

alter table app.profiles enable row level security;

revoke all on table app.profiles from public;
grant select, insert, update, delete on table app.profiles to service_role;

-- Every new Auth user gets a profile in the same transaction, so there is never an
-- account the rest of the schema has to guess about.
--
-- The role is read from `raw_app_meta_data`, which only the service role can write --
-- the Admin API, the seed, the driver invite. `raw_user_meta_data` is whatever the
-- caller of `signUp` chose to send, so it is never consulted: anyone signing up through
-- the public API is a customer, whatever they claim.
create or replace function app.role_from_app_metadata(app_metadata jsonb)
returns app.role
language sql
immutable
set search_path = ''
as $$ select coalesce(app_metadata ->> 'role', 'customer')::app.role $$;

comment on function app.role_from_app_metadata(jsonb) is
  'The role an Auth user was created with. Absent means customer: a public sign-up never sets it.';

create or replace function app.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app.profiles (id, role)
  values (new.id, app.role_from_app_metadata(new.raw_app_meta_data));
  return new;
end
$$;

revoke execute on function app.create_profile_for_new_user() from public;

create trigger create_profile_after_insert
  after insert on auth.users
  for each row execute function app.create_profile_for_new_user();

-- Any account that predates this migration gets its profile by the same rule.
insert into app.profiles (id, role)
select id, app.role_from_app_metadata(raw_app_meta_data)
from auth.users
on conflict (id) do nothing;

-- The one question the dispatcher console asks after a sign-in: who is this, and may
-- they be here? It answers only for an active dispatcher and refuses everyone else
-- with insufficient_privilege, so the console's gate is the server's, not the browser's.
create or replace function public.console_profile()
returns table (id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select p.id, u.email::text
    from app.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.role = 'dispatcher'
      and p.active;

  if not found then
    raise exception 'only an active dispatcher may use the console'
      using errcode = 'insufficient_privilege';
  end if;
end
$$;

comment on function public.console_profile() is
  'The signed-in dispatcher. Raises insufficient_privilege for any other account, active or not.';

-- Supabase's default privileges grant EXECUTE on new public functions to anon by name,
-- so revoking from PUBLIC alone would leave anon holding it.
revoke execute on function public.console_profile() from public, anon;
grant execute on function public.console_profile() to authenticated, service_role;

insert into app.access_matrix (object_name, object_kind, actor, allowed, note) values
  ('console_profile', 'function', 'anon', false,
   'Nobody is signed in, so there is nobody to describe. Not granted.'),
  ('console_profile', 'function', 'customer', false,
   'Customers share the Auth instance but never the console. Raises insufficient_privilege.'),
  ('console_profile', 'function', 'driver', false,
   'Drivers work from the driver app; the console is the dispatcher''s alone. Raises insufficient_privilege.'),
  ('console_profile', 'function', 'dispatcher', true,
   'How the console confirms a sign-in belongs to an active dispatcher. Deactivated ones are refused.');
