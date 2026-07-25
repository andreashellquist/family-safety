begin;

-- Neon Data API executes HTTP requests as its configured anonymous role and
-- relies on RLS/auth.user_id() for row authorization. Grant only the base
-- capabilities needed to reach those policies and explicit RPCs.
grant usage on schema public to anonymous;
grant select on table
  app_users, families, family_memberships, devices, pacts, pact_rules,
  pact_acceptances, change_requests, request_decisions, daily_summaries,
  enforcement_states, family_invitations, restriction_policies,
  restriction_targets, policy_events, device_pairing_codes
to anonymous;

grant execute on function
  onboard_family(text, text, text),
  create_family_invitation(member_role, integer),
  join_family_with_invite(text, text),
  create_restriction_policy(text, uuid, jsonb, timestamptz, timestamptz),
  acknowledge_restriction_policy(uuid),
  get_family_roster(),
  create_device_pairing_code(uuid, text, integer),
  get_device_pairing_codes()
to anonymous;

commit;
