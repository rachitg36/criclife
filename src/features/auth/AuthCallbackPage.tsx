import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAuth } from './authContext';
import { hasAuthPayload, parseCallbackError } from './callbackError';

/**
 * docs/11-SCREENS-AND-ROUTES.md § 1 — "Token exchange + redirect". The
 * exchange itself already happened: `detectSessionInUrl` on the Supabase
 * client (lib/supabase.ts) parses the magic-link/OAuth code the moment the
 * module loads, well before this component mounts. This screen just waits
 * for that result to land in AuthProvider's state.
 *
 * When it does not land, this screen used to shrug — "links expire after a
 * while, or may only work once" — regardless of what actually happened.
 * Supabase puts the real reason in the callback URL, so it is read and shown
 * now. See `./callbackError`.
 *
 * There's no persisted "has this user finished onboarding" flag yet, so
 * every successful sign-in lands on /onboarding, which is itself quick to
 * click through if there's nothing left to fill in.
 */
export function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Captured on mount: `detectSessionInUrl` strips the parameters out of the
  // address bar once it has read them, so waiting until the timeout to look
  // would find an empty URL.
  const initial = useMemo(
    () =>
      typeof window === 'undefined'
        ? { error: null, payload: false }
        : {
            error: parseCallbackError(window.location.href),
            payload: hasAuthPayload(window.location.href),
          },
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  if (!loading && session) return <Navigate to="/onboarding" replace />;

  // An explicit error needs no waiting — the answer is already in hand.
  const failed = initial.error !== null || (!loading && !session && timedOut);
  if (!failed) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="w-full max-w-xs">
          <SkeletonText lines={2} />
        </div>
      </div>
    );
  }

  const headline = initial.error
    ? initial.error.message
    : initial.payload
      ? "That sign-in link couldn't be completed."
      : 'There was no sign-in link to use.';

  const hint =
    initial.error?.hint ??
    (initial.payload
      ? 'Links work once, and only in the browser they were requested from. Request a new one here.'
      : 'Open the link from your email, or request a new one.');

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="max-w-sm text-[var(--text-primary)]">{headline}</p>
      <p className="max-w-sm text-[var(--text-body-sm)] text-[var(--text-secondary)]">{hint}</p>
      {initial.error?.code && (
        <p className="font-mono text-[11px] text-[var(--text-tertiary)]">{initial.error.code}</p>
      )}
      <a href="/login" className="text-[var(--accent)] underline">
        Back to sign in
      </a>
    </div>
  );
}
