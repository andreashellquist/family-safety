begin;

-- Migration metadata is not application data. It must not be reachable via
-- the Data API even if a future table grant is broadened.
alter table schema_migrations enable row level security;
revoke all on table schema_migrations from anonymous, authenticated;

-- Earlier baseline policies allowed direct browser writes. Removing them keeps
-- mutations on audited security-definer RPCs and prevents accidental bypasses
-- of the immutable policy-event trail.
drop policy if exists families_update_parent on families;
drop policy if exists app_users_update_own on app_users;
drop policy if exists pact_acceptances_add_own on pact_acceptances;
drop policy if exists requests_create_own on change_requests;
drop policy if exists decisions_add_parent on request_decisions;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Restrict
-- every browser-exposed function to authenticated Neon Auth sessions; helper
-- functions remain available to RLS policy evaluation for that same role.
revoke all on function current_app_user_id() from public, anonymous;
revoke all on function is_family_member(uuid) from public, anonymous;
revoke all on function is_family_parent(uuid) from public, anonymous;
revoke all on function onboard_family(text, text, text) from public, anonymous;
revoke all on function create_family_invitation(member_role, integer) from public, anonymous;
revoke all on function join_family_with_invite(text, text) from public, anonymous;
revoke all on function create_restriction_policy(text, uuid, jsonb, timestamptz, timestamptz) from public, anonymous;
revoke all on function acknowledge_restriction_policy(uuid) from public, anonymous;
revoke all on function get_family_roster() from public, anonymous;
revoke all on function create_device_pairing_code(uuid, text, integer) from public, anonymous;
revoke all on function get_device_pairing_codes() from public, anonymous;
revoke all on function set_updated_at() from public, anonymous;
revoke all on function assert_family_scope() from public, anonymous;

grant execute on function
  current_app_user_id(),
  is_family_member(uuid),
  is_family_parent(uuid),
  onboard_family(text, text, text),
  create_family_invitation(member_role, integer),
  join_family_with_invite(text, text),
  create_restriction_policy(text, uuid, jsonb, timestamptz, timestamptz),
  acknowledge_restriction_policy(uuid),
  get_family_roster(),
  create_device_pairing_code(uuid, text, integer),
  get_device_pairing_codes()
to authenticated;

-- Acknowledgement is a one-time, row-locked proposed -> active transition.
-- Active policies intentionally compose; the enforcement client evaluates all
-- active policies for a member rather than silently superseding an existing
-- transparent rule set.
create or replace function acknowledge_restriction_policy(policy_uuid uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare policy public.restriction_policies;
begin
  select * into policy from public.restriction_policies where id = policy_uuid for update;
  if policy.id is null or not public.is_family_member(policy.family_id) then
    raise exception 'Policy not found.' using errcode = '42501';
  end if;
  if policy.member_id <> public.current_app_user_id() then
    raise exception 'Only the affected member can acknowledge this policy.' using errcode = '42501';
  end if;
  if policy.status <> 'proposed' then
    raise exception 'Only a proposed policy can be acknowledged.' using errcode = '23514';
  end if;
  update public.restriction_policies set status = 'active' where id = policy.id;
  insert into public.policy_events (family_id, policy_id, actor_id, event_type)
    values (policy.family_id, policy.id, public.current_app_user_id(), 'acknowledged');
  insert into public.policy_events (family_id, policy_id, actor_id, event_type)
    values (policy.family_id, policy.id, public.current_app_user_id(), 'activated');
end;
$$;

commit;
