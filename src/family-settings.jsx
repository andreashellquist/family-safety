import React, { useEffect, useState } from 'react';
import { acknowledgeRestrictionPolicy, createFamilyInvitation, createRestrictionPolicy, getFamilyRoster, getRestrictionPolicies } from './family-data.js';

export function FamilySettingsModal({ close, familyRole, currentUserId }) {
  const [members, setMembers] = useState([]);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('Evening web and app plan');
  const [memberId, setMemberId] = useState('');
  const [targetType, setTargetType] = useState('app');
  const [targetValue, setTargetValue] = useState('');
  const [action, setAction] = useState('limit');
  const [minutes, setMinutes] = useState('60');
  const [policies, setPolicies] = useState([]);

  const loadPolicies = () => getRestrictionPolicies(familyRole === 'child' ? currentUserId : undefined).then(setPolicies).catch((requestError) => setError(requestError.message || 'We could not load your proposed rules.'));

  useEffect(() => {
    getFamilyRoster().then((roster) => {
      setMembers(roster || []);
      setMemberId((roster || []).find((member) => member.role === 'child')?.user_id || roster?.[0]?.user_id || '');
    }).catch((requestError) => setError(requestError.message || 'We could not load your family members.'));
    loadPolicies();
  }, []);

  const makeInvite = async () => {
    setSaving(true); setError('');
    try { setInvite(await createFamilyInvitation('child')); }
    catch (requestError) { setError(requestError.message || 'We could not create an invitation.'); }
    finally { setSaving(false); }
  };

  const propose = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await createRestrictionPolicy({
        title,
        memberId,
        targets: [{ target_type: targetType, target_value: targetValue, action, allowance_minutes: action === 'limit' ? Number(minutes) : null, reason: 'A transparent family agreement', schedule: {} }]
      });
      setTargetValue('');
      setError('Policy proposed. The affected family member can review it before it becomes active.'); loadPolicies();
    } catch (requestError) { setError(requestError.message || 'We could not propose this policy.'); }
    finally { setSaving(false); }
  };

  const acknowledge = async (policyId) => {
    setSaving(true); setError('');
    try { await acknowledgeRestrictionPolicy(policyId); setError('Policy acknowledged and marked active.'); loadPolicies(); }
    catch (requestError) { setError(requestError.message || 'We could not acknowledge this policy.'); }
    finally { setSaving(false); }
  };

  return <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="family-settings-title"><div className="modal settings-modal"><button className="close" aria-label="Close family settings" onClick={close}>×</button><p className="eyebrow">FAMILY SETTINGS</p><h2 id="family-settings-title">Transparent restrictions</h2><p className="modal-intro">These settings describe an agreement. They do not collect browsing history or control a device until an enrolled companion service is connected.</p>{familyRole === 'parent' ? <><section className="settings-section"><h3>Invite a child</h3><p>Share this one-time code privately. It expires in seven days.</p><button className="secondary" disabled={saving} onClick={makeInvite}>Create invite code</button>{invite && <output className="invite-code">{invite.invite_code}</output>}</section><form className="settings-section" onSubmit={propose}><h3>Propose an app or website rule</h3><label>Who is this for<select required value={memberId} onChange={(event) => setMemberId(event.target.value)}>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name} · {member.role}</option>)}</select></label><label>Rule title<input required maxLength="120" value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="settings-row"><label>Applies to<select value={targetType} onChange={(event) => setTargetType(event.target.value)}><option value="app">An app</option><option value="category">An app category</option><option value="domain">A website domain</option></select></label><label>{targetType === 'domain' ? 'Domain only' : 'Name'}<input required maxLength="255" value={targetValue} placeholder={targetType === 'domain' ? 'example.com' : 'Minecraft'} onChange={(event) => setTargetValue(event.target.value.toLowerCase())} /></label></div><div className="settings-row"><label>Agreement<select value={action} onChange={(event) => setAction(event.target.value)}><option value="limit">Set a time limit</option><option value="block">Pause access</option><option value="allow">Allow access</option></select></label>{action === 'limit' && <label>Minutes<input required type="number" min="1" max="1440" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>}</div><button className="primary" disabled={saving || !memberId}>{saving ? 'Saving…' : 'Propose transparent rule'}</button></form></> : <section className="settings-section"><h3>Your family space</h3><p>Review the rules that affect you. Acknowledging makes an agreement active; it still will not control a device until a companion service is enrolled.</p></section>}<section className="settings-section"><h3>{familyRole === 'parent' ? 'Your proposed rules' : 'Rules for you'}</h3>{policies.length ? policies.map((policy) => <div className="policy-row" key={policy.id}><div><strong>{policy.title}</strong><small>{policy.restriction_targets.map((target) => `${target.action} ${target.target_value}${target.allowance_minutes ? ` · ${target.allowance_minutes} min` : ''}`).join(', ')}</small></div>{familyRole === 'child' && policy.status === 'proposed' ? <button className="secondary" disabled={saving} onClick={() => acknowledge(policy.id)}>Acknowledge</button> : <b>{policy.status}</b>}</div>) : <p>No restriction proposals yet.</p>}</section>{error && <p className={error.includes('Policy') ? 'settings-success' : 'auth-error'} role="status">{error}</p>}</div></div>;
}
