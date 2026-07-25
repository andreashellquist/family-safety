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

commit;
