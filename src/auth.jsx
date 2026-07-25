import React, { useEffect, useState } from 'react';
import { createAuthClient } from '@neondatabase/neon-js/auth';
import { AuthView, NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react/ui';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
const authClient = authUrl ? createAuthClient(authUrl) : null;

export function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, session: null, error: null });

  useEffect(() => {
    if (!authClient) {
      setState({ loading: false, session: null, error: 'Neon Auth has not been configured for this environment.' });
      return;
    }
    authClient.getSession()
      .then(({ data, error }) => setState({ loading: false, session: data?.session ?? null, error: error?.message ?? null }))
      .catch(() => setState({ loading: false, session: null, error: 'We could not reach the sign-in service.' }));
  }, []);

  if (state.loading) return <main className="auth-loading">Checking your secure session…</main>;
  if (state.session) return children(state.session, () => authClient.signOut());

  return <main className="auth-shell"><section className="auth-intro"><div className="brand"><span className="brand-mark">P</span><span>pact</span></div><p className="eyebrow">FOR FAMILIES</p><h1>Make room for trust.</h1><p>Shared agreements, thoughtful requests, and no hidden monitoring.</p><small>Private by design · No browsing history</small></section><section className="auth-panel"><div><p className="eyebrow">WELCOME</p><h2>Sign in to your family</h2>{state.error && <p className="auth-error">{state.error}</p>}<NeonAuthUIProvider authClient={authClient}><AuthView pathname="sign-in" /></NeonAuthUIProvider></div></section></main>;
}
