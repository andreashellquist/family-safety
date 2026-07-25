import { neon } from './auth.jsx';

// All requests inherit the Neon Auth access token from the signed-in session.
// RLS policies on the database, not browser-supplied IDs, determine what is visible.
export async function getCurrentFamily(authSubject) {
  if (!neon) throw new Error('Neon Data API is not configured.');

  const { data: user, error: userError } = await neon
    .from('app_users')
    .select('id, display_name')
    .eq('auth_subject', authSubject)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) return null;

  const { data: membership, error: membershipError } = await neon
    .from('family_memberships')
    .select('family_id, role, families(id, name, timezone)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  return membership ? { user, ...membership } : null;
}

export async function createFamily({ familyName, displayName, timezone }) {
  if (!neon) throw new Error('Neon Data API is not configured.');
  const { data, error } = await neon.rpc('onboard_family', {
    family_name: familyName, display_name: displayName, family_timezone: timezone
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function callRpc(name, args) {
  if (!neon) throw new Error('Neon Data API is not configured.');
  const { data, error } = await neon.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function getFamilyRoster() {
  return callRpc('get_family_roster', {});
}

export async function createFamilyInvitation(role = 'child') {
  const data = await callRpc('create_family_invitation', { invited_role: role });
  return Array.isArray(data) ? data[0] : data;
}

export async function joinFamilyWithInvite({ inviteCode, displayName }) {
  const data = await callRpc('join_family_with_invite', { invite_code: inviteCode, display_name: displayName });
  return Array.isArray(data) ? data[0] : data;
}

export async function createRestrictionPolicy({ title, memberId, targets }) {
  return callRpc('create_restriction_policy', {
    policy_title: title,
    target_member_id: memberId,
    target_rules: targets
  });
}

export async function getRestrictionPolicies(memberId) {
  if (!neon) throw new Error('Neon Data API is not configured.');
  let query = neon
    .from('restriction_policies')
    .select('id, title, status, member_id, restriction_targets(target_type, target_value, action, allowance_minutes)')
    .order('created_at', { ascending: false });
  if (memberId) query = query.eq('member_id', memberId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function acknowledgeRestrictionPolicy(policyId) {
  return callRpc('acknowledge_restriction_policy', { policy_uuid: policyId });
}

export async function createDevicePairingCode({ memberId, deviceLabel }) {
  const data = await callRpc('create_device_pairing_code', {
    target_member_id: memberId,
    requested_device_label: deviceLabel,
    valid_for_minutes: 15
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function getDevicePairingCodes() {
  return callRpc('get_device_pairing_codes', {});
}
