import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './pages.css';
import './settings.css';
import { AuthGate } from './auth.jsx';
import { createFamily, getCurrentFamily, joinFamilyWithInvite } from './family-data.js';
import { FamilySettingsModal } from './family-settings.jsx';
import { LanguageProvider, LanguageSwitcher } from './i18n.jsx';

const initialRequest = {
  id: 1,
  title: 'Extra time for Minecraft',
  detail: '30 minutes · Today, 18:30–19:00',
  reason: 'I’m building with Leo and we planned it yesterday.',
  status: 'pending',
  icon: '◈'
};
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const routeForTab = { home: '/', pacts: '/pact/', requests: '/requests/', insights: '/reflection/' };
const tabForRoute = (path) => {
  const relativePath = path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return Object.entries(routeForTab).find(([, route]) => route === relativePath)?.[0] ?? 'home';
};

function FamilyGate({ session, signOut }) {
  const [state, setState] = useState({ loading: true, family: null, error: null });
  const authSubject = session.user?.id;
  const loadFamily = async () => {
    if (!authSubject) return setState({ loading: false, family: null, error: 'Your session is missing an account identifier.' });
    try {
      setState((previous) => ({ ...previous, loading: true, error: null }));
      setState({ loading: false, family: await getCurrentFamily(authSubject), error: null });
    } catch (error) { setState({ loading: false, family: null, error: error.message || 'We could not load your family.' }); }
  };
  useEffect(() => { loadFamily(); }, [authSubject]);
  if (state.loading) return <main className="auth-loading">Loading your family…</main>;
  if (state.error) return <FamilyLoadError signOut={signOut} retry={loadFamily} error={state.error} />;
  if (!state.family) return <Onboarding session={session} signOut={signOut} onComplete={loadFamily} />;
  return <App session={session} signOut={signOut} family={state.family} />;
}

function FamilyLoadError({ signOut, retry, error }) { return <main className="onboarding-shell"><section className="onboarding-card"><p className="eyebrow">FAMILY SPACE UNAVAILABLE</p><h1>We couldn’t load your family.</h1><p className="onboarding-intro">{error}</p><button className="primary wide" onClick={retry}>Try again</button><button className="sign-out-link" onClick={signOut}>Sign out</button></section></main>; }

function Onboarding({ session, signOut, onComplete }) {
  const defaultName = session.user?.name || session.user?.email?.split('@')[0] || '';
  const [displayName, setDisplayName] = useState(defaultName);
  const [familyName, setFamilyName] = useState(defaultName ? `${defaultName}'s family` : '');
  const [mode, setMode] = useState('create');
  const [inviteCode, setInviteCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setFormError(null);
    try { if (mode === 'create') await createFamily({ familyName, displayName, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Stockholm' }); else await joinFamilyWithInvite({ inviteCode, displayName }); await onComplete(); }
    catch (requestError) { setFormError(requestError.message || 'We could not complete family setup.'); }
    finally { setSaving(false); }
  };
  return <main className="onboarding-shell"><style>{`.onboarding-shell{min-height:100vh;display:grid;place-items:center;padding:28px;background:linear-gradient(135deg,#f6f5ef,#ebe9fc)}.onboarding-card{width:min(470px,100%);padding:38px;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 18px 60px #2a315b16}.onboarding-card .brand{padding:0 0 38px}.onboarding-card h1{font-size:34px}.onboarding-intro{color:var(--muted);font-size:14px;line-height:1.55;margin:12px 0 25px}.onboarding-card label{display:block;font-size:13px;font-weight:600;margin:17px 0 0}.onboarding-card input{display:block;width:100%;margin-top:7px;border:1px solid #dfdfe4;border-radius:9px;padding:11px;font:14px 'DM Sans';color:var(--ink)}.onboarding-card input:focus{outline:2px solid #d8d3ff;border-color:#685bd3}.onboarding-card .wide{margin-top:22px}.onboarding-card button:disabled{opacity:.7;cursor:wait}.sign-out-link{display:block;margin:17px auto 0;background:transparent;color:#687087;font-size:12px}.onboarding-switch{display:flex;gap:8px;margin:0 0 18px}.onboarding-switch button{flex:1;padding:8px;border-radius:8px;background:#f0eff6;color:#5d587a;font-size:12px}.onboarding-switch .selected{background:#5f51d2;color:#fff}`}</style><section className="onboarding-card"><LanguageSwitcher /><div className="brand"><span className="brand-mark">P</span><span>pact</span></div><p className="eyebrow">WELCOME</p><h1>{mode === 'create' ? 'Start your family space' : 'Join your family space'}</h1><p className="onboarding-intro">{mode === 'create' ? 'Set up shared agreements and requests. You’ll be the first parent; dashboard data stays in safe mock mode for now.' : 'Use the one-time invite code shared by your parent. You’ll see every rule that affects you.'}</p><div className="onboarding-switch"><button type="button" className={mode === 'create' ? 'selected' : ''} onClick={() => setMode('create')}>Create family</button><button type="button" className={mode === 'join' ? 'selected' : ''} onClick={() => setMode('join')}>Use invite code</button></div><form onSubmit={submit}><label>Your name<input required maxLength="80" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Andreas" /></label>{mode === 'create' ? <label>Family name<input required maxLength="100" value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="The Andersson family" /></label> : <label>Invite code<input required value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Shared one-time code" /></label>}{formError && <p className="auth-error" role="alert">{formError}</p>}<button className="primary wide" disabled={saving}>{saving ? 'Saving…' : mode === 'create' ? 'Create family' : 'Join family'}</button></form><button className="sign-out-link" onClick={signOut}>Sign out</button></section></main>;
}

function App({ session, signOut, family }) {
  const [role, setRole] = useState('parent');
  const [tab, setTab] = useState(() => tabForRoute(window.location.pathname));
  const [request, setRequest] = useState(initialRequest);
  const [pactAccepted, setPactAccepted] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [showPact, setShowPact] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [enforcement, setEnforcement] = useState('warning');
  const [toast, setToast] = useState('');

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const navigate = (nextTab) => { window.location.assign(`${basePath}${routeForTab[nextTab]}`); };
  useEffect(() => { const onPopState = () => setTab(tabForRoute(window.location.pathname)); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); }, []);
  const approve = () => { setRequest({ ...request, status: 'approved' }); setEnforcement('extended'); notify('Demo preview updated — no device or notification was changed.'); };
  const decline = () => { setRequest({ ...request, status: 'declined' }); notify('Demo preview updated — no request was sent.'); };

  const currentName = session.user?.name || session.user?.email?.split('@')[0] || 'there';
  const initials = currentName.slice(0, 2).toUpperCase();
  return <main>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">P</span><span>pact</span></div>
      <div className="family"><div className="family-avatar">{initials}</div><div><strong>{family.families.name}</strong><small>Family space</small></div><span className="chevron">⌄</span></div>
      <nav>
        <Nav active={tab === 'home'} icon="⌂" label="Today" onClick={() => navigate('home')} />
        <Nav active={tab === 'pacts'} icon="♡" label="Our pact" onClick={() => navigate('pacts')} />
        <Nav active={tab === 'requests'} icon="↗" label="Requests" badge={request.status === 'pending' ? '1' : ''} onClick={() => navigate('requests')} />
        <Nav active={tab === 'insights'} icon="⌁" label="Weekly reflection" onClick={() => navigate('insights')} />
        <Nav icon="⚙" label="Family settings" onClick={() => setShowSettings(true)} />
      </nav>
      <div className="sidebar-bottom"><button className="support">? <span>Help & support</span></button><div className="privacy"><span>♧</span><p><strong>Private by design</strong><br/>We never show browsing history.</p></div></div>
    </aside>
    <section className="content">
      <header><div><p className="eyebrow">FRIDAY, 24 JULY</p><h1>{role === 'parent' ? `Good afternoon, ${currentName}.` : 'Good afternoon, Maya.'}</h1></div><div className="header-actions"><LanguageSwitcher /><div className="role-switch" aria-label="Demo preview role"><button className={role === 'parent' ? 'selected' : ''} onClick={() => setRole('parent')}>Preview parent</button><button className={role === 'child' ? 'selected' : ''} onClick={() => setRole('child')}>Preview child</button></div><button className="avatar" aria-label="Sign out" title="Sign out" onClick={signOut}>{initials}</button></div></header>
      <div className="demo-banner" role="status"><strong>Demo preview:</strong> agreements, requests, device status, and notifications below are mock data. Family setup and restriction proposals are the only live flows.</div>
      {tab === 'home' && <>
      <div className="notice"><span className="notice-icon">✦</span><p><strong>Your family pact is working well.</strong> You’ve had 4 calm handovers this week.</p><button onClick={() => navigate('insights')}>See reflection →</button></div>
      <section className="hero-grid">
        <article className="time-card"><div className="card-top"><div><p className="eyebrow">TODAY’S AGREEMENT</p><h2>After-school time</h2></div><span className="live-dot">● Active</span></div><div className="time-body"><div className="ring"><div><strong>48</strong><small>min left</small></div></div><div className="time-copy"><h3>1h 12m used of 2h</h3><div className="progress"><i/></div><p>Time ends at <strong>19:00</strong></p></div></div><div className="time-footer"><span><b>◉</b> Applies to selected fun apps</span><button onClick={() => navigate('pacts')}>View agreement</button></div></article>
        <article className="device-card"><div className="card-top"><div><p className="eyebrow">WINDOWS COMPUTER</p><h2>Maya’s Surface Laptop</h2></div><span className={'device-state ' + enforcement}>{enforcement === 'warning' ? 'Ends in 48 min' : enforcement === 'extended' ? 'Extension active' : 'Muted & locked'}</span></div><div className="device-panel"><span className="laptop">▱</span><div><strong>{enforcement === 'expired' ? 'Screen is locked' : 'Ready for handover'}</strong><p>{enforcement === 'expired' ? 'Audio is muted until access resumes.' : 'Sound will mute and screen will lock at time end.'}</p></div><span className="verified">✓</span></div><div className="enforcement-row"><span>Enforcement promise</span><strong>Mute audio + lock screen</strong></div></article>
      </section>
      {request.status === 'pending' && <article className="request-card"><div className="request-symbol">{request.icon}</div><div className="request-copy"><p className="eyebrow">NEW REQUEST FROM MAYA</p><h2>{request.title}</h2><p>{request.detail}</p><blockquote>“{request.reason}”</blockquote></div><div className="request-actions">{role === 'parent' ? <><button className="secondary" onClick={decline}>Not today</button><button className="primary" onClick={approve}>Approve 30 min</button></> : <span className="pending-pill">Waiting for Andreas</span>}</div></article>}
      {request.status !== 'pending' && <article className="request-card result"><div className="request-symbol">{request.status === 'approved' ? '✓' : '–'}</div><div className="request-copy"><p className="eyebrow">REQUEST UPDATED</p><h2>{request.status === 'approved' ? 'Your extra time is approved' : 'Extra time wasn’t approved today'}</h2><p>{request.status === 'approved' ? 'Minecraft is available until 19:30. We’ll return to the normal plan tomorrow.' : 'The plan stays in place, and you can try again another day.'}</p></div></article>}
      <section className="bottom-grid"><article className="agreement-list"><div className="section-title"><div><p className="eyebrow">THIS EVENING</p><h2>What we agreed</h2></div><button onClick={() => navigate('pacts')}>Edit pact</button></div><Rule icon="◈" title="Fun apps" sub="2 hours total · Ends at 19:00" value="48 min left"/><Rule icon="◌" title="Focus time" sub="No social apps during homework" value="Done"/><Rule icon="☾" title="Wind down" sub="Screens rest at 20:30" value="Later"/></article><article className="reflection"><p className="eyebrow">WEEKLY REFLECTION</p><div className="reflection-score"><strong>4</strong><span>calm<br/>handovers</span><span className="sprout">♧</span></div><p>You both kept the agreement four times this week. Nice work.</p><button onClick={() => navigate('insights')}>Reflect together <span>→</span></button></article></section>
      </>}
      {tab === 'pacts' && <PactsPage accepted={pactAccepted} onEdit={() => setShowPact(true)} />}
      {tab === 'requests' && <RequestsPage request={request} role={role} onApprove={approve} onDecline={decline} onCreate={() => setShowRequest(true)} />}
      {tab === 'insights' && <InsightsPage />}
    </section>
    {showRequest && <RequestModal close={() => setShowRequest(false)} />}
    {showPact && <PactModal accepted={pactAccepted} accept={() => {setPactAccepted(true); notify('Demo pact preview updated — no agreement was activated.')}} close={() => setShowPact(false)} />}
    {showSettings && <FamilySettingsModal familyRole={family.role} currentUserId={family.user.id} close={() => setShowSettings(false)} />}
    <button className="floating-request" onClick={() => setShowRequest(true)}>+ Request a change</button>
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}

function Nav({ active, icon, label, badge, onClick }) { return <button className={'nav-item ' + (active ? 'active' : '')} onClick={onClick}><span>{icon}</span>{label}{badge && <b>{badge}</b>}</button> }
function Rule({icon,title,sub,value}) { return <div className="rule"><span className="rule-icon">{icon}</span><div><strong>{title}</strong><small>{sub}</small></div><span>{value}</span></div> }
function PactsPage({accepted,onEdit}) { return <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">SHARED AGREEMENTS</p><h2>Our family pact</h2><p>Rules work best when everyone can understand and shape them.</p></div><button className="primary" onClick={onEdit}>Propose a change</button></div><div className="pact-layout"><article className="pact-overview"><div className="pact-status"><span>♡</span><div><strong>After-school time</strong><small>{accepted ? 'Both people have agreed' : 'Waiting for Maya’s agreement'}</small></div><b>{accepted ? 'Active' : 'Draft'}</b></div><div className="pact-detail"><p className="eyebrow">WEEKDAYS</p><h3>Make room for fun, focus, and rest.</h3><Rule icon="◈" title="Fun apps" sub="2 hours between 15:00 and 19:00" value="Active"/><Rule icon="◌" title="Homework focus" sub="Social apps pause from 16:00 to 17:30" value="Active"/><Rule icon="☾" title="Wind down" sub="Selected apps rest from 20:30" value="Active"/></div></article><aside className="pact-side"><p className="eyebrow">HOW IT WORKS</p><h3>Nothing is hidden.</h3><p>Both of you see the rule, the time left, and every approved change.</p><div className="mini-step"><b>1</b><span>Talk about what feels fair</span></div><div className="mini-step"><b>2</b><span>Agree before it goes live</span></div><div className="mini-step"><b>3</b><span>Reflect at the end of the week</span></div></aside></div><section className="history-card"><div><p className="eyebrow">PACT HISTORY</p><h3>This week</h3></div><div className="history-item"><span>✓</span><p><strong>Wind down moved to 20:30</strong><small>Both agreed · Monday</small></p></div><div className="history-item"><span>✓</span><p><strong>Fun time extended for Friday</strong><small>Both agreed · Wednesday</small></p></div></section></div> }
function RequestsPage({request,role,onApprove,onDecline,onCreate}) { const pending=request.status==='pending'; return <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">CONVERSATIONS, NOT COMMANDS</p><h2>Requests</h2><p>Small changes have a clear reason, answer, and expiry.</p></div><button className="primary" onClick={onCreate}>+ Request a change</button></div><div className="requests-grid"><article className="request-full"><div className="request-full-head"><span className="request-symbol">{pending ? '◈' : request.status==='approved' ? '✓' : '–'}</span><div><p className="eyebrow">{pending ? 'WAITING FOR A DECISION' : 'DECISION RECORDED'}</p><h3>{request.title}</h3><p>{request.detail}</p></div><b className={'status-label '+request.status}>{request.status}</b></div><blockquote>“{request.reason}”</blockquote>{pending && role==='parent' && <div className="request-decision"><button className="secondary" onClick={onDecline}>Not today</button><button className="primary" onClick={onApprove}>Approve 30 min</button></div>}{pending && role==='child' && <div className="waiting-box">Andreas will see your request right away. You’ll get a notification when they reply.</div>}</article><aside className="request-guide"><p className="eyebrow">A GOOD REQUEST</p><h3>Explain the why.</h3><p>Say what you need, how long for, and why it matters today.</p><div className="guide-example"><span>✦</span><p>“I’m finishing a game with my friend and we planned it together.”</p></div></aside></div><article className="history-card"><div><p className="eyebrow">PAST REQUESTS</p><h3>Recent decisions</h3></div><div className="history-item"><span>✓</span><p><strong>30 minutes for a class project</strong><small>Approved · Yesterday</small></p></div><div className="history-item"><span>–</span><p><strong>More time after wind down</strong><small>Not today · Tuesday</small></p></div></article></div> }
function InsightsPage() { return <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">LOOK BACK TOGETHER</p><h2>Weekly reflection</h2><p>Notice what worked, then make next week feel fairer.</p></div><button className="secondary">Choose week</button></div><section className="insight-hero"><div><p className="eyebrow">THIS WEEK</p><strong>4</strong><h3>calm handovers</h3><p>Four times this week, the day ended as planned without a reminder.</p></div><div className="week-bars"><i/><i/><i className="tall"/><i/><i className="soft"/><i className="soft"/><i className="soft"/><span>M&nbsp;&nbsp; T&nbsp;&nbsp; W&nbsp;&nbsp; T&nbsp;&nbsp; F&nbsp;&nbsp; S&nbsp;&nbsp; S</span></div></section><div className="reflection-prompts"><article><span>☼</span><p className="eyebrow">A QUESTION FOR MAYA</p><h3>What made handovers easier this week?</h3><button>Write a thought →</button></article><article><span>♡</span><p className="eyebrow">A QUESTION FOR ANDREAS</p><h3>What felt fair about the plan?</h3><button>Write a thought →</button></article></div></div> }
function RequestModal({close}) { const [sent,setSent]=useState(false); return <div className="overlay"><div className="modal"><button className="close" onClick={close}>×</button><p className="eyebrow">ASK FOR A CHANGE</p><h2>What would help today?</h2>{sent ? <div className="success"><span>✓</span><h3>Request sent</h3><p>Your parent will see it right away.</p></div> : <><label>Extra time<small>How much would you like?</small></label><div className="choices"><button className="picked">30 min</button><button>1 hour</button><button>Custom</button></div><label>Tell them why<textarea defaultValue="I’m building with Leo and we planned it yesterday."/></label><button className="primary wide" onClick={() => setSent(true)}>Send request</button></>}</div></div> }
function PactModal({close,accepted,accept}) { return <div className="overlay"><div className="modal pact-modal"><button className="close" onClick={close}>×</button><p className="eyebrow">OUR FAMILY PACT</p><h2>After-school time</h2><p className="modal-intro">A shared plan for fun, focus, and winding down.</p><div className="pact-rule"><span>◈</span><div><strong>Fun apps</strong><small>2 hours on school days · until 19:00</small></div><b>Both agreed</b></div><div className="pact-rule"><span>◌</span><div><strong>Homework focus</strong><small>Social apps pause during homework</small></div><b>Both agreed</b></div><div className="pact-rule"><span>☾</span><div><strong>Wind down</strong><small>Screens rest from 20:30</small></div><b className={accepted ? 'agreed' : 'awaiting'}>{accepted ? 'Both agreed' : 'Needs Maya’s yes'}</b></div>{!accepted && <button className="primary wide" onClick={accept}>Agree to this pact</button>}<p className="privacy-copy">Everyone sees the same rules and outcomes. No hidden monitoring.</p></div></div> }

createRoot(document.getElementById('root')).render(<LanguageProvider><AuthGate>{(session, signOut) => <FamilyGate session={session} signOut={signOut} />}</AuthGate></LanguageProvider>);
