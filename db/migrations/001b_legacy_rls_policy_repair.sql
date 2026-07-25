begin;

-- Repair early installations that had the base tables but not the original RLS
-- setup. Client reads are deliberately narrow; mutations use security-definer
-- RPCs introduced by later migrations.
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

drop policy if exists app_users_read_own on app_users;
drop policy if exists families_read_member on families;
drop policy if exists memberships_read_member on family_memberships;
drop policy if exists devices_read_member on devices;
drop policy if exists pacts_read_member on pacts;
drop policy if exists pact_rules_read_member on pact_rules;
drop policy if exists pact_acceptances_read_member on pact_acceptances;
drop policy if exists requests_read_member on change_requests;
drop policy if exists decisions_read_member on request_decisions;
drop policy if exists summaries_read_member on daily_summaries;
drop policy if exists enforcement_read_owner_or_parent on enforcement_states;

create policy app_users_read_own on app_users for select using (id = current_app_user_id());
create policy families_read_member on families for select using (is_family_member(id));
create policy memberships_read_member on family_memberships for select using (is_family_member(family_id));
create policy devices_read_member on devices for select using (is_family_member(family_id));
create policy pacts_read_member on pacts for select using (is_family_member(family_id));
create policy pact_rules_read_member on pact_rules for select using (exists (select 1 from pacts where pacts.id = pact_rules.pact_id and is_family_member(pacts.family_id)));
create policy pact_acceptances_read_member on pact_acceptances for select using (exists (select 1 from pacts where pacts.id = pact_acceptances.pact_id and is_family_member(pacts.family_id)));
create policy requests_read_member on change_requests for select using (is_family_member(family_id));
create policy decisions_read_member on request_decisions for select using (exists (select 1 from change_requests where change_requests.id = request_decisions.request_id and is_family_member(change_requests.family_id)));
create policy summaries_read_member on daily_summaries for select using (is_family_member(family_id));
create policy enforcement_read_owner_or_parent on enforcement_states for select using (exists (select 1 from devices where devices.id = enforcement_states.device_id and (devices.member_id = current_app_user_id() or is_family_parent(devices.family_id))));

create or replace function onboard_family(family_name text, display_name text, family_timezone text default 'Europe/Stockholm')
returns table (id uuid, name text, timezone text, user_id uuid, role member_role)
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare new_family public.families; onboarding_user_id uuid;
begin
  if auth.user_id() is null then raise exception 'An authenticated session is required.' using errcode = '42501'; end if;
  insert into public.app_users (auth_subject, display_name) values (auth.user_id()::text, display_name)
    on conflict (auth_subject) do update set display_name = excluded.display_name returning app_users.id into onboarding_user_id;
  if exists (select 1 from public.family_memberships membership where membership.user_id = onboarding_user_id) then
    raise exception 'This account already belongs to a family.' using errcode = '23505';
  end if;
  insert into public.families (name, timezone) values (family_name, family_timezone) returning * into new_family;
  insert into public.family_memberships (family_id, user_id, role) values (new_family.id, onboarding_user_id, 'parent');
  return query select new_family.id, new_family.name, new_family.timezone, onboarding_user_id, 'parent'::member_role;
end;
$$;

commit;
