import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { motion } from 'motion/react';
import { Mail } from 'lucide-react';
import { Aurora } from '@/components/ui/Aurora';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { useAuth } from './authContext';
import { humanAuthError } from './authErrors';

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

          {status === 'sent' ? (
            <div className="rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 text-center">
              <Mail size={24} className="mx-auto mb-2 text-[var(--accent)]" aria-hidden />
              <p className="text-[var(--text-body-sm)]">
                Check <strong className="text-[var(--text-primary)]">{email}</strong> for a sign-in
                link.
              </p>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <label htmlFor="login-email" className="sr-only">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-2)] px-4 text-[15px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={status === 'sending' || !email}
              >
                {status === 'sending' ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
          )}

          {errorMessage && (
            <p role="alert" className="mt-3 text-[var(--text-body-sm)] text-[var(--wicket)]">
              {errorMessage}
            </p>
          )}

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--border-subtle)]" />
            <span className="text-[var(--text-body-sm)] text-[var(--text-tertiary)]">or</span>
            <div className="h-px flex-1 bg-[var(--border-subtle)]" />
          </div>

          <Button variant="secondary" size="lg" fullWidth onClick={handleGoogle}>
            Continue with Google
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
