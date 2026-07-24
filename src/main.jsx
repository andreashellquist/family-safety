import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const initialRequest = {
  id: 1,
  title: 'Extra time for Minecraft',
  detail: '30 minutes · Today, 18:30–19:00',
  reason: 'I’m building with Leo and we planned it yesterday.',
  status: 'pending',
  icon: '◈'
};

function App() {
  const [role, setRole] = useState('parent');
  const [tab, setTab] = useState('home');
  const [request, setRequest] = useState(initialRequest);
  const [pactAccepted, setPactAccepted] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [showPact, setShowPact] = useState(false);
  const [enforcement, setEnforcement] = useState('warning');
  const [toast, setToast] = useState('');

  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const approve = () => { setRequest({ ...request, status: 'approved' }); setEnforcement('extended'); notify('30 minutes approved — Maya has been notified.'); };
  const decline = () => { setRequest({ ...request, status: 'declined' }); notify('Request declined with a kind note.'); };

  return <main>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">P</span><span>pact</span></div>
      <div className="family"><div className="family-avatar">AH</div><div><strong>Andreas’s family</strong><small>2 members</small></div><span className="chevron">⌄</span></div>
      <nav>
        <Nav active={tab === 'home'} icon="⌂" label="Today" onClick={() => setTab('home')} />
        <Nav active={tab === 'pacts'} icon="♡" label="Our pact" onClick={() => {setTab('pacts'); setShowPact(true)}} />
        <Nav active={tab === 'requests'} icon="↗" label="Requests" badge={request.status === 'pending' ? '1' : ''} onClick={() => setTab('requests')} />
        <Nav active={tab === 'insights'} icon="⌁" label="Weekly reflection" onClick={() => setTab('insights')} />
      </nav>
      <div className="sidebar-bottom"><button className="support">? <span>Help & support</span></button><div className="privacy"><span>♧</span><p><strong>Private by design</strong><br/>We never show browsing history.</p></div></div>
    </aside>
    <section className="content">
      <header><div><p className="eyebrow">FRIDAY, 24 JULY</p><h1>{role === 'parent' ? 'Good afternoon, Andreas.' : 'Good afternoon, Maya.'}</h1></div><div className="header-actions"><div className="role-switch"><button className={role === 'parent' ? 'selected' : ''} onClick={() => setRole('parent')}>Parent</button><button className={role === 'child' ? 'selected' : ''} onClick={() => setRole('child')}>Child</button></div><button className="avatar">AH</button></div></header>
      <div className="notice"><span className="notice-icon">✦</span><p><strong>Your family pact is working well.</strong> You’ve had 4 calm handovers this week.</p><button onClick={() => setTab('insights')}>See reflection →</button></div>
      <section className="hero-grid">
        <article className="time-card"><div className="card-top"><div><p className="eyebrow">TODAY’S AGREEMENT</p><h2>After-school time</h2></div><span className="live-dot">● Active</span></div><div className="time-body"><div className="ring"><div><strong>48</strong><small>min left</small></div></div><div className="time-copy"><h3>1h 12m used of 2h</h3><div className="progress"><i/></div><p>Time ends at <strong>19:00</strong></p></div></div><div className="time-footer"><span><b>◉</b> Applies to selected fun apps</span><button onClick={() => {setShowPact(true); setTab('pacts')}}>View agreement</button></div></article>
        <article className="device-card"><div className="card-top"><div><p className="eyebrow">WINDOWS COMPUTER</p><h2>Maya’s Surface Laptop</h2></div><span className={'device-state ' + enforcement}>{enforcement === 'warning' ? 'Ends in 48 min' : enforcement === 'extended' ? 'Extension active' : 'Muted & locked'}</span></div><div className="device-panel"><span className="laptop">▱</span><div><strong>{enforcement === 'expired' ? 'Screen is locked' : 'Ready for handover'}</strong><p>{enforcement === 'expired' ? 'Audio is muted until access resumes.' : 'Sound will mute and screen will lock at time end.'}</p></div><span className="verified">✓</span></div><div className="enforcement-row"><span>Enforcement promise</span><strong>Mute audio + lock screen</strong></div></article>
      </section>
      {request.status === 'pending' && <article className="request-card"><div className="request-symbol">{request.icon}</div><div className="request-copy"><p className="eyebrow">NEW REQUEST FROM MAYA</p><h2>{request.title}</h2><p>{request.detail}</p><blockquote>“{request.reason}”</blockquote></div><div className="request-actions">{role === 'parent' ? <><button className="secondary" onClick={decline}>Not today</button><button className="primary" onClick={approve}>Approve 30 min</button></> : <span className="pending-pill">Waiting for Andreas</span>}</div></article>}
      {request.status !== 'pending' && <article className="request-card result"><div className="request-symbol">{request.status === 'approved' ? '✓' : '–'}</div><div className="request-copy"><p className="eyebrow">REQUEST UPDATED</p><h2>{request.status === 'approved' ? 'Your extra time is approved' : 'Extra time wasn’t approved today'}</h2><p>{request.status === 'approved' ? 'Minecraft is available until 19:30. We’ll return to the normal plan tomorrow.' : 'The plan stays in place, and you can try again another day.'}</p></div></article>}
      <section className="bottom-grid"><article className="agreement-list"><div className="section-title"><div><p className="eyebrow">THIS EVENING</p><h2>What we agreed</h2></div><button onClick={() => setShowPact(true)}>Edit pact</button></div><Rule icon="◈" title="Fun apps" sub="2 hours total · Ends at 19:00" value="48 min left"/><Rule icon="◌" title="Focus time" sub="No social apps during homework" value="Done"/><Rule icon="☾" title="Wind down" sub="Screens rest at 20:30" value="Later"/></article><article className="reflection"><p className="eyebrow">WEEKLY REFLECTION</p><div className="reflection-score"><strong>4</strong><span>calm<br/>handovers</span><span className="sprout">♧</span></div><p>You both kept the agreement four times this week. Nice work.</p><button onClick={() => setTab('insights')}>Reflect together <span>→</span></button></article></section>
    </section>
    {showRequest && <RequestModal close={() => setShowRequest(false)} />}
    {showPact && <PactModal accepted={pactAccepted} accept={() => {setPactAccepted(true); notify('Your family pact is now active.')}} close={() => setShowPact(false)} />}
    <button className="floating-request" onClick={() => setShowRequest(true)}>+ Request a change</button>
    {toast && <div className="toast">✓ {toast}</div>}
  </main>;
}

function Nav({ active, icon, label, badge, onClick }) { return <button className={'nav-item ' + (active ? 'active' : '')} onClick={onClick}><span>{icon}</span>{label}{badge && <b>{badge}</b>}</button> }
function Rule({icon,title,sub,value}) { return <div className="rule"><span className="rule-icon">{icon}</span><div><strong>{title}</strong><small>{sub}</small></div><span>{value}</span></div> }
function RequestModal({close}) { const [sent,setSent]=useState(false); return <div className="overlay"><div className="modal"><button className="close" onClick={close}>×</button><p className="eyebrow">ASK FOR A CHANGE</p><h2>What would help today?</h2>{sent ? <div className="success"><span>✓</span><h3>Request sent</h3><p>Your parent will see it right away.</p></div> : <><label>Extra time<small>How much would you like?</small></label><div className="choices"><button className="picked">30 min</button><button>1 hour</button><button>Custom</button></div><label>Tell them why<textarea defaultValue="I’m building with Leo and we planned it yesterday."/></label><button className="primary wide" onClick={() => setSent(true)}>Send request</button></>}</div></div> }
function PactModal({close,accepted,accept}) { return <div className="overlay"><div className="modal pact-modal"><button className="close" onClick={close}>×</button><p className="eyebrow">OUR FAMILY PACT</p><h2>After-school time</h2><p className="modal-intro">A shared plan for fun, focus, and winding down.</p><div className="pact-rule"><span>◈</span><div><strong>Fun apps</strong><small>2 hours on school days · until 19:00</small></div><b>Both agreed</b></div><div className="pact-rule"><span>◌</span><div><strong>Homework focus</strong><small>Social apps pause during homework</small></div><b>Both agreed</b></div><div className="pact-rule"><span>☾</span><div><strong>Wind down</strong><small>Screens rest from 20:30</small></div><b className={accepted ? 'agreed' : 'awaiting'}>{accepted ? 'Both agreed' : 'Needs Maya’s yes'}</b></div>{!accepted && <button className="primary wide" onClick={accept}>Agree to this pact</button>}<p className="privacy-copy">Everyone sees the same rules and outcomes. No hidden monitoring.</p></div></div> }

createRoot(document.getElementById('root')).render(<App />);
