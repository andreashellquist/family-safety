import React, { useEffect, useState } from 'react';
import { createClient } from '@neondatabase/neon-js';
import { AuthView, NeonAuthUIProvider } from '@neondatabase/auth-ui';
import '@neondatabase/auth-ui/css';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL;
export const neon = authUrl && dataApiUrl ? createClient({ auth: { url: authUrl }, dataApi: { url: dataApiUrl } }) : null;
const authViewPaths = new Set(['accept-invitation', 'callback', 'email-otp', 'forgot-password', 'magic-link', 'recover-account', 'reset-password', 'sign-in', 'sign-out', 'sign-up', 'two-factor']);

function currentAuthViewPath() {
  const params = new URLSearchParams(window.location.search);
  const redirectedPath = params.get('auth_path');
  if (authViewPaths.has(redirectedPath)) return redirectedPath;
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const directPath = window.location.pathname.slice(basePath.length).replace(/^\//, '').replace(/\/$/, '');
  return authViewPaths.has(directPath) ? directPath : 'sign-in';
}

export function AuthGate({ children }) {
  const [state, setState] = useState({ loading: true, session: null, error: null });

  useEffect(() => {
    if (!neon) {
      setState({ loading: false, session: null, error: 'Neon Auth or the Data API has not been configured for this environment.' });
      return;
    }
    neon.auth.getSession()
      // Neon Auth uses Better Auth's { user, session } shape. Keep the user
      // alongside the session so family onboarding can use its stable auth ID.
      .then(({ data, error }) => setState({ loading: false, session: data?.session && data?.user ? { ...data.session, user: data.user } : null, error: error?.message ?? null }))
      .catch(() => setState({ loading: false, session: null, error: 'We could not reach the sign-in service.' }));
  }, []);

  if (state.loading) return <main className="auth-loading">Checking your secure session…</main>;
  if (state.session) return children(state.session, () => neon.auth.signOut());

  return <main className="auth-shell"><section className="auth-intro"><div className="brand"><span className="brand-mark">P</span><span>pact</span></div><p className="eyebrow">FOR FAMILIES</p><h1>Make room for trust.</h1><p>Shared agreements, thoughtful requests, and no hidden monitoring.</p><small>Private by design · No browsing history</small></section><section className="auth-panel"><div><p className="eyebrow">WELCOME</p><h2>Sign in to your family</h2>{state.error && <p className="auth-error">{state.error}</p>}<NeonAuthUIProvider authClient={neon.auth} basePath={`${import.meta.env.BASE_URL}auth`} redirectTo={`${import.meta.env.BASE_URL}`}><AuthView path={currentAuthViewPath()} /></NeonAuthUIProvider></div></section></main>;
}
