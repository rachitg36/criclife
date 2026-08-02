import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAuth } from './authContext';

/**
 * docs/11-SCREENS-AND-ROUTES.md § 1 — "Token exchange + redirect". The
 * exchange itself already happened: `detectSessionInUrl` on the Supabase
 * client (lib/supabase.ts) parses the magic-link/OAuth code the moment the
 * module loads, well before this component mounts. This screen just waits
 * for that result to land in AuthProvider's state.
 *
 * There's no persisted "has this user finished onboarding" flag yet, so
 * every successful sign-in lands on /onboarding, which is itself quick to
 * click through if there's nothing left to fill in.
 */
export function AuthCallbackPage() {
  const { session, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  if (!loading && session) return <Navigate to="/onboarding" replace />;

  if (!loading && !session && timedOut) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-[var(--text-primary)]">That sign-in link didn't work.</p>
        <p className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Links expire after a while, or may only work once. Request a new one.
        </p>
        <a href="/login" className="text-[var(--accent)] underline">
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <div className="w-full max-w-xs">
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}
