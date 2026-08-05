import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { motion } from 'motion/react';
import { Mail } from 'lucide-react';
import { Aurora } from '@/components/ui/Aurora';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from './authContext';
import { humanAuthError } from './authErrors';
import { fetchAuthProviders } from './authProviders';

/**
 * docs/11-SCREENS-AND-ROUTES.md § 1 — single email field, no password, plus
 * Google. No phone OTP: SMS costs money on a free-tier budget.
 */
export function LoginPage() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Starts false. `signInWithOAuth` navigates the browser rather than calling
  // an API, so a disabled provider lands on GoTrue's raw JSON with no way back
  // — the button must not exist until the project says it will work.
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    void fetchAuthProviders(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, abort.signal).then(
      (p) => setGoogleEnabled(p.google)
    );
    return () => abort.abort();
  }, []);

  if (!loading && session) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from?.pathname ?? '/'} replace />;
  }

  const redirectTo = `${env.VITE_PUBLIC_URL}/auth/callback`;

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setErrorMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setStatus('error');
      setErrorMessage(humanAuthError(error));
      return;
    }
    setStatus('sent');
  }

  async function handleGoogle() {
    setErrorMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) setErrorMessage(humanAuthError(error));
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <Aurora />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="panel w-full max-w-sm p-6"
        >
          <div className="mb-6 text-center">
            <div className="font-display text-[22px] font-bold tracking-tight">CricLife</div>
            <p className="mt-1 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
              Score, watch and rank — sign in to get started.
            </p>
          </div>

          {errorMessage && (
            <p role="alert" className="mb-4 mt-3 text-[var(--text-body-sm)] text-[var(--wicket)]">
              {errorMessage}
            </p>
          )}

          {googleEnabled ? (
            <Button variant="primary" size="lg" fullWidth onClick={handleGoogle}>
              Continue with Google
            </Button>
          ) : (
            <p className="text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
              Sign-in is currently misconfigured on this environment.
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
