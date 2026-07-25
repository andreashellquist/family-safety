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
