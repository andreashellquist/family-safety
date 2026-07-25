begin;

-- One account belongs to one family in the current product model. This closes
-- the bootstrap race and makes `getCurrentFamily` deterministic. Legacy data
-- gets a clear repair error instead of an opaque unique-constraint failure.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.family_memberships'::regclass
      and conname = 'family_memberships_user_unique'
  ) then
    if exists (
      select 1 from public.family_memberships
      group by user_id
      having count(*) > 1
    ) then
      raise exception 'Cannot enforce one-family-per-account: duplicate family memberships exist.' using errcode = '23505';
    end if;
    alter table family_memberships add constraint family_memberships_user_unique unique (user_id);
  end if;
end;
$$;

create table family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  role member_role not null default 'child',
  token_hash text not null unique,
  created_by uuid not null references app_users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table restriction_policies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  member_id uuid not null references app_users(id),
  version integer not null default 1 check (version > 0),
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'proposed' check (status in ('draft', 'proposed', 'active', 'superseded', 'revoked')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, member_id, version),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table restriction_targets (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references restriction_policies(id) on delete cascade,
  target_type text not null check (target_type in ('app', 'category', 'domain')),
  target_value text not null check (char_length(target_value) between 1 and 255),
  action text not null check (action in ('allow', 'block', 'limit')),
  allowance_minutes integer check (allowance_minutes is null or allowance_minutes between 1 and 1440),
  reason text check (reason is null or char_length(reason) <= 500),
  schedule jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((action = 'limit') = (allowance_minutes is not null)),
  check (target_type <> 'domain' or target_value = lower(target_value))
);

create table policy_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  policy_id uuid references restriction_policies(id) on delete set null,
  actor_id uuid references app_users(id) on delete set null,
  event_type text not null check (event_type in ('proposed', 'acknowledged', 'activated', 'superseded', 'revoked', 'delivery_acknowledged', 'delivery_failed')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index family_invitations_family_idx on family_invitations(family_id, expires_at);
create index restriction_policies_family_member_idx on restriction_policies(family_id, member_id, status);
create index restriction_targets_policy_idx on restriction_targets(policy_id);
create index policy_events_family_created_idx on policy_events(family_id, created_at desc);

alter table daily_summaries drop constraint if exists daily_summaries_member_id_device_id_summary_date_category_key;
alter table daily_summaries add constraint daily_summaries_unique unique nulls not distinct (member_id, device_id, summary_date, category);

create trigger restriction_policies_updated_at before update on restriction_policies for each row execute function set_updated_at();

-- Guard against cross-family references that ordinary single-column FKs permit.
create or replace function assert_family_scope() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_table_name = 'devices' and not exists (select 1 from public.family_memberships where family_id = new.family_id and user_id = new.member_id) then
    raise exception 'Device member must belong to its family.' using errcode = '23514';
  elsif tg_table_name = 'pacts' and not exists (select 1 from public.family_memberships where family_id = new.family_id and user_id = new.created_by) then
    raise exception 'Pact creator must belong to its family.' using errcode = '23514';
  elsif tg_table_name = 'daily_summaries' and (
    not exists (select 1 from public.family_memberships where family_id = new.family_id and user_id = new.member_id)
    or (new.device_id is not null and not exists (select 1 from public.devices where id = new.device_id and family_id = new.family_id and member_id = new.member_id))
  ) then
    raise exception 'Summary member and device must belong to its family.' using errcode = '23514';
  elsif tg_table_name = 'change_requests' and (
    not exists (select 1 from public.family_memberships where family_id = new.family_id and user_id = new.requested_by)
    or (new.requested_for is not null and not exists (select 1 from public.family_memberships where family_id = new.family_id and user_id = new.requested_for))
    or (new.pact_id is not null and not exists (select 1 from public.pacts where id = new.pact_id and family_id = new.family_id))
  ) then
    raise exception 'Request references must belong to its family.' using errcode = '23514';
  elsif tg_table_name = 'restriction_policies' and (
    not exists (select 1 from public.family_memberships where family_id = new.family_id and user_id = new.member_id)
    or not exists (select 1 from public.family_memberships where family_id = new.family_id and user_id = new.created_by)
  ) then
    raise exception 'Policy members must belong to its family.' using errcode = '23514';
  elsif tg_table_name = 'family_invitations' and not exists (select 1 from public.family_memberships where family_id = new.family_id and user_id = new.created_by and role = 'parent') then
    raise exception 'Only a family parent can create an invitation.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger devices_family_scope before insert or update on devices for each row execute function assert_family_scope();
create trigger pacts_family_scope before insert or update on pacts for each row execute function assert_family_scope();
create trigger daily_summaries_family_scope before insert or update on daily_summaries for each row execute function assert_family_scope();
create trigger change_requests_family_scope before insert or update on change_requests for each row execute function assert_family_scope();
create trigger restriction_policies_family_scope before insert or update on restriction_policies for each row execute function assert_family_scope();
create trigger invitations_family_scope before insert or update on family_invitations for each row execute function assert_family_scope();

alter table family_invitations enable row level security;
alter table restriction_policies enable row level security;
alter table restriction_targets enable row level security;
alter table policy_events enable row level security;

create policy invitations_read_parent on family_invitations for select using (is_family_parent(family_id));
create policy restriction_policies_read_member on restriction_policies for select using (is_family_member(family_id));
create policy restriction_targets_read_member on restriction_targets for select using (exists (select 1 from restriction_policies where restriction_policies.id = restriction_targets.policy_id and is_family_member(restriction_policies.family_id)));
create policy policy_events_read_member on policy_events for select using (is_family_member(family_id));

drop policy if exists devices_manage_parent on devices;
drop policy if exists pacts_manage_parent on pacts;
drop policy if exists pact_rules_manage_parent on pact_rules;
drop policy if exists requests_manage_parent on change_requests;
drop policy if exists summaries_manage_parent on daily_summaries;
drop policy if exists enforcement_manage_parent on enforcement_states;

-- RPCs are the only mutation paths: each records an immutable event and keeps
-- browser-supplied identity values out of authorization decisions.
create or replace function create_family_invitation(invited_role member_role default 'child', valid_for_hours integer default 168)
returns table (invitation_id uuid, invite_code text, expires_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare family_uuid uuid; token text; invitation public.family_invitations;
begin
  if auth.user_id() is null or valid_for_hours not between 1 and 720 then raise exception 'Invalid invitation request.' using errcode = '22023'; end if;
  select family_id into family_uuid from public.family_memberships where user_id = public.current_app_user_id() and role = 'parent';
  if family_uuid is null then raise exception 'Only a parent can invite someone.' using errcode = '42501'; end if;
  token := encode(gen_random_bytes(18), 'hex');
  insert into public.family_invitations (family_id, role, token_hash, created_by, expires_at)
  values (family_uuid, invited_role, encode(digest(token, 'sha256'), 'hex'), public.current_app_user_id(), now() + make_interval(hours => valid_for_hours))
  returning * into invitation;
  return query select invitation.id, token, invitation.expires_at;
end;
$$;

create or replace function join_family_with_invite(invite_code text, display_name text)
returns table (family_id uuid, role member_role)
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare joining_user uuid; invitation public.family_invitations;
begin
  if auth.user_id() is null then raise exception 'An authenticated session is required.' using errcode = '42501'; end if;
  insert into public.app_users (auth_subject, display_name) values (auth.user_id()::text, display_name)
    on conflict (auth_subject) do update set display_name = excluded.display_name returning id into joining_user;
  if exists (select 1 from public.family_memberships where user_id = joining_user) then raise exception 'This account already belongs to a family.' using errcode = '23505'; end if;
  select * into invitation from public.family_invitations where token_hash = encode(digest(invite_code, 'sha256'), 'hex') and accepted_at is null and expires_at > now() for update;
  if invitation.id is null then raise exception 'This invitation is invalid or expired.' using errcode = '22023'; end if;
  insert into public.family_memberships (family_id, user_id, role) values (invitation.family_id, joining_user, invitation.role);
  update public.family_invitations set accepted_at = now(), accepted_by = joining_user where id = invitation.id;
  return query select invitation.family_id, invitation.role;
end;
$$;

create or replace function create_restriction_policy(policy_title text, target_member_id uuid, target_rules jsonb, starts_at_input timestamptz default null, ends_at_input timestamptz default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare family_uuid uuid; policy_uuid uuid; next_version integer; target jsonb;
begin
  select family_id into family_uuid from public.family_memberships where user_id = public.current_app_user_id() and role = 'parent';
  if family_uuid is null then raise exception 'Only a parent can propose a restriction policy.' using errcode = '42501'; end if;
  if jsonb_typeof(target_rules) <> 'array' or jsonb_array_length(target_rules) = 0 then raise exception 'At least one transparent restriction target is required.' using errcode = '22023'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.restriction_policies where family_id = family_uuid and member_id = target_member_id;
  insert into public.restriction_policies (family_id, member_id, version, title, status, starts_at, ends_at, created_by)
  values (family_uuid, target_member_id, next_version, policy_title, 'proposed', starts_at_input, ends_at_input, public.current_app_user_id()) returning id into policy_uuid;
  for target in select value from jsonb_array_elements(target_rules) loop
  insert into public.restriction_targets (policy_id, target_type, target_value, action, allowance_minutes, reason, schedule)
    values (policy_uuid, target->>'target_type', lower(target->>'target_value'), target->>'action', nullif(target->>'allowance_minutes', '')::integer, nullif(target->>'reason', ''), coalesce(target->'schedule', '{}'::jsonb));
  end loop;
  insert into public.policy_events (family_id, policy_id, actor_id, event_type, detail) values (family_uuid, policy_uuid, public.current_app_user_id(), 'proposed', jsonb_build_object('target_count', jsonb_array_length(target_rules)));
  return policy_uuid;
end;
$$;

create or replace function acknowledge_restriction_policy(policy_uuid uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare policy public.restriction_policies;
begin
  select * into policy from public.restriction_policies where id = policy_uuid for update;
  if policy.id is null or not public.is_family_member(policy.family_id) then raise exception 'Policy not found.' using errcode = '42501'; end if;
  if policy.member_id <> public.current_app_user_id() then raise exception 'Only the affected member can acknowledge this policy.' using errcode = '42501'; end if;
  if policy.status <> 'proposed' then raise exception 'Only a proposed policy can be acknowledged.' using errcode = '23514'; end if;
  update public.restriction_policies set status = 'active' where id = policy.id;
  insert into public.policy_events (family_id, policy_id, actor_id, event_type) values (policy.family_id, policy.id, public.current_app_user_id(), 'acknowledged');
  insert into public.policy_events (family_id, policy_id, actor_id, event_type) values (policy.family_id, policy.id, public.current_app_user_id(), 'activated');
end;
$$;

create or replace function get_family_roster()
returns table (user_id uuid, display_name text, role member_role)
language sql stable security definer set search_path = pg_catalog, public, auth as $$
  select membership.user_id, user_profile.display_name, membership.role
  from public.family_memberships membership
  join public.app_users user_profile on user_profile.id = membership.user_id
  where membership.family_id = (select family_id from public.family_memberships where user_id = public.current_app_user_id())
  order by membership.joined_at
$$;

commit;
