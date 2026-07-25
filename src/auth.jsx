import React, { useEffect, useState } from 'react';
import { createClient } from '@neondatabase/neon-js';
import { AuthView, NeonAuthUIProvider } from '@neondatabase/auth-ui';
import '@neondatabase/auth-ui/css';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL;
export const neon = authUrl && dataApiUrl ? createClient({ auth: { url: authUrl }, dataApi: { url: dataApiUrl } }) : null;

export function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, session: null, error: null });

  useEffect(() => {
    if (!neon) {
      setState({ loading: false, session: null, error: 'Neon Auth or the Data API has not been configured for this environment.' });
      return;
    }
    neon.auth.getSession()
      .then(({ data, error }) => setState({ loading: false, session: data?.session ?? null, error: error?.message ?? null }))
      .catch(() => setState({ loading: false, session: null, error: 'We could not reach the sign-in service.' }));
  }, []);

  if (state.loading) return <main className="auth-loading">Checking your secure session…</main>;
  if (state.session) return children(state.session, () => neon.auth.signOut());

  return <main className="auth-shell"><section className="auth-intro"><div className="brand"><span className="brand-mark">P</span><span>pact</span></div><p className="eyebrow">FOR FAMILIES</p><h1>Make room for trust.</h1><p>Shared agreements, thoughtful requests, and no hidden monitoring.</p><small>Private by design · No browsing history</small></section><section className="auth-panel"><div><p className="eyebrow">WELCOME</p><h2>Sign in to your family</h2>{state.error && <p className="auth-error">{state.error}</p>}<NeonAuthUIProvider authClient={neon.auth} redirectTo={`${import.meta.env.BASE_URL}`}><AuthView path="sign-in" /></NeonAuthUIProvider></div></section></main>;
}
