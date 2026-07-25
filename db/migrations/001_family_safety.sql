begin;

create extension if not exists pgcrypto;

create type member_role as enum ('parent', 'child');
create type pact_status as enum ('draft', 'active', 'superseded', 'archived');
create type request_status as enum ('pending', 'approved', 'declined', 'countered', 'expired', 'cancelled');
create type enforcement_status as enum ('active', 'warning', 'expired_muted_locked', 'temporarily_extended', 'next_window_active', 'inactive');

create table app_users (
  id uuid primary key default gen_random_uuid(),
  auth_subject text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  timezone text not null default 'Europe/Stockholm',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table family_memberships (
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role member_role not null,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references app_users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'ipados', 'windows')),
  display_name text not null check (char_length(display_name) between 1 and 120),
  installation_id uuid not null unique,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table pacts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  status pact_status not null default 'draft',
  effective_from timestamptz,
  effective_until timestamptz,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pact_rules (
  id uuid primary key default gen_random_uuid(),
  pact_id uuid not null references pacts(id) on delete cascade,
  rule_type text not null check (rule_type in ('screen_time', 'focus_window', 'wind_down', 'safety_pause')),
  label text not null check (char_length(label) between 1 and 120),
  schedule jsonb not null,
  allowance_minutes integer check (allowance_minutes is null or allowance_minutes between 1 and 1440),
  local_selection_ref text,
  created_at timestamptz not null default now()
);

create table pact_acceptances (
  pact_id uuid not null references pacts(id) on delete cascade,
  member_id uuid not null references app_users(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  primary key (pact_id, member_id)
);

create table change_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  pact_id uuid references pacts(id) on delete set null,
  requested_by uuid not null references app_users(id),
  requested_for uuid references app_users(id),
  title text not null check (char_length(title) between 1 and 160),
  reason text not null check (char_length(reason) between 1 and 1000),
  requested_minutes integer check (requested_minutes is null or requested_minutes between 1 and 1440),
  starts_at timestamptz,
  expires_at timestamptz,
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table request_decisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references change_requests(id) on delete cascade,
  decided_by uuid not null references app_users(id),
  decision request_status not null check (decision in ('approved', 'declined', 'countered')),
  granted_minutes integer check (granted_minutes is null or granted_minutes between 1 and 1440),
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create table daily_summaries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references app_users(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  summary_date date not null,
  category text not null check (char_length(category) between 1 and 80),
  used_minutes integer not null check (used_minutes >= 0),
  allowance_minutes integer check (allowance_minutes is null or allowance_minutes >= 0),
  unique (member_id, device_id, summary_date, category)
);

create table enforcement_states (
  device_id uuid primary key references devices(id) on delete cascade,
  status enforcement_status not null default 'inactive',
  effective_until timestamptz,
  muted_at timestamptz,
  locked_at timestamptz,
  local_policy_version bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index family_memberships_user_idx on family_memberships(user_id);
create index devices_family_member_idx on devices(family_id, member_id);
create index pacts_family_status_idx on pacts(family_id, status);
create index change_requests_family_status_idx on change_requests(family_id, status, created_at desc);
create index daily_summaries_member_date_idx on daily_summaries(member_id, summary_date desc);

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger families_updated_at before update on families for each row execute function set_updated_at();
create trigger pacts_updated_at before update on pacts for each row execute function set_updated_at();
create trigger change_requests_updated_at before update on change_requests for each row execute function set_updated_at();
create trigger enforcement_states_updated_at before update on enforcement_states for each row execute function set_updated_at();

-- Neon Data API validates the JWT and exposes auth.user_id() to these policies.
-- Authorization is always derived from membership, never from browser-supplied IDs.
create or replace function current_app_user_id() returns uuid
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select id from public.app_users where auth_subject = auth.user_id()::text
$$;

create or replace function is_family_member(target_family_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select exists (select 1 from public.family_memberships where family_id = target_family_id and user_id = public.current_app_user_id())
$$;

create or replace function is_family_parent(target_family_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select exists (select 1 from public.family_memberships where family_id = target_family_id and user_id = public.current_app_user_id() and role = 'parent')
$$;

-- The only browser-accessible way to create the first membership in a family.
create or replace function onboard_family(family_name text, display_name text, family_timezone text default 'Europe/Stockholm')
returns table (id uuid, name text, timezone text, user_id uuid, role member_role)
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare new_family public.families; onboarding_user_id uuid;
begin
  if auth.user_id() is null then raise exception 'An authenticated session is required.' using errcode = '42501'; end if;
  insert into public.app_users (auth_subject, display_name) values (auth.user_id()::text, display_name)
    on conflict (auth_subject) do update set display_name = excluded.display_name returning app_users.id into onboarding_user_id;
  if exists (select 1 from public.family_memberships where user_id = onboarding_user_id) then
    raise exception 'This account already belongs to a family.' using errcode = '23505';
  end if;
  insert into public.families (name, timezone) values (family_name, family_timezone) returning * into new_family;
  insert into public.family_memberships (family_id, user_id, role) values (new_family.id, onboarding_user_id, 'parent');
  return query select new_family.id, new_family.name, new_family.timezone, onboarding_user_id, 'parent'::member_role;
end;
$$;

alter table app_users enable row level security;
alter table families enable row level security;
alter table family_memberships enable row level security;
alter table devices enable row level security;
alter table pacts enable row level security;
alter table pact_rules enable row level security;
alter table pact_acceptances enable row level security;
alter table change_requests enable row level security;
alter table request_decisions enable row level security;
alter table daily_summaries enable row level security;
alter table enforcement_states enable row level security;

create policy app_users_read_own on app_users for select using (id = current_app_user_id());
create policy app_users_update_own on app_users for update using (id = current_app_user_id()) with check (id = current_app_user_id() and auth_subject = auth.user_id()::text);
create policy families_read_member on families for select using (is_family_member(id));
create policy families_update_parent on families for update using (is_family_parent(id)) with check (is_family_parent(id));
create policy memberships_read_member on family_memberships for select using (is_family_member(family_id));

create policy devices_read_member on devices for select using (is_family_member(family_id));
create policy devices_manage_parent on devices for all using (is_family_parent(family_id)) with check (is_family_parent(family_id));
create policy pacts_read_member on pacts for select using (is_family_member(family_id));
create policy pacts_manage_parent on pacts for all using (is_family_parent(family_id)) with check (is_family_parent(family_id));
create policy pact_rules_read_member on pact_rules for select using (exists (select 1 from pacts where pacts.id = pact_rules.pact_id and is_family_member(pacts.family_id)));
create policy pact_rules_manage_parent on pact_rules for all using (exists (select 1 from pacts where pacts.id = pact_rules.pact_id and is_family_parent(pacts.family_id))) with check (exists (select 1 from pacts where pacts.id = pact_rules.pact_id and is_family_parent(pacts.family_id)));
create policy pact_acceptances_read_member on pact_acceptances for select using (exists (select 1 from pacts where pacts.id = pact_acceptances.pact_id and is_family_member(pacts.family_id)));
create policy pact_acceptances_add_own on pact_acceptances for insert with check (member_id = current_app_user_id() and exists (select 1 from pacts where pacts.id = pact_acceptances.pact_id and is_family_member(pacts.family_id)));

create policy requests_read_member on change_requests for select using (is_family_member(family_id));
create policy requests_create_own on change_requests for insert with check (is_family_member(family_id) and requested_by = current_app_user_id() and (requested_for is null or exists (select 1 from family_memberships where family_id = change_requests.family_id and user_id = requested_for)));
create policy requests_manage_parent on change_requests for update using (is_family_parent(family_id)) with check (is_family_parent(family_id));
create policy decisions_read_member on request_decisions for select using (exists (select 1 from change_requests where change_requests.id = request_decisions.request_id and is_family_member(change_requests.family_id)));
create policy decisions_add_parent on request_decisions for insert with check (decided_by = current_app_user_id() and exists (select 1 from change_requests where change_requests.id = request_decisions.request_id and is_family_parent(change_requests.family_id)));

create policy summaries_read_member on daily_summaries for select using (is_family_member(family_id));
create policy summaries_manage_parent on daily_summaries for all using (is_family_parent(family_id)) with check (is_family_parent(family_id));
create policy enforcement_read_owner_or_parent on enforcement_states for select using (exists (select 1 from devices where devices.id = enforcement_states.device_id and (devices.member_id = current_app_user_id() or is_family_parent(devices.family_id))));
create policy enforcement_manage_parent on enforcement_states for all using (exists (select 1 from devices where devices.id = enforcement_states.device_id and is_family_parent(devices.family_id))) with check (exists (select 1 from devices where devices.id = enforcement_states.device_id and is_family_parent(devices.family_id)));

commit;
