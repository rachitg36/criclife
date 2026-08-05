import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { SkeletonText } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { useAuth } from './authContext';
import { humanAuthError } from './authErrors';
import {
  describeExchangeFailure,
  hasAuthPayload,
  parseCallbackError,
  type CallbackError,
} from './callbackError';

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
  const [exchangeError, setExchangeError] = useState<CallbackError | null>(null);

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

  // `initialize()` resolves the very promise the client kicked off on import,
  // so this is asking for the result of the exchange that already ran, not
  // starting a second one. It is the only public handle on that error.
  useEffect(() => {
    let alive = true;
    void supabase.auth.initialize().then(({ error }) => {
      if (!alive || !error) return;
      setExchangeError(
        describeExchangeFailure({
          message: humanAuthError(error),
          code: error.code,
          status: error.status,
        })
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  const [targetPath, setTargetPath] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    let alive = true;

    async function checkProfile() {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session!.user.id)
          .maybeSingle();

        if (!alive) return;
        if (data?.display_name && data.display_name.trim().length > 0) {
          setTargetPath('/');
        } else {
          setTargetPath('/onboarding');
        }
      } catch {
        if (!alive) return;
        setTargetPath('/onboarding');
      }
    }

    void checkProfile();

    return () => {
      alive = false;
    };
  }, [session]);

  if (!loading && session && targetPath) return <Navigate to={targetPath} replace />;

  // Either error needs no waiting — the answer is already in hand.
  const known = initial.error ?? exchangeError;
  const failed = known !== null || (!loading && !session && timedOut);
  if (!failed) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="w-full max-w-xs">
          <SkeletonText lines={2} />
        </div>
      </div>
    );
  }

  const headline = known
    ? known.message
    : initial.payload
      ? "That sign-in link couldn't be completed."
      : 'There was no sign-in link to use.';

  const hint =
    known?.hint ??
    (initial.payload
      ? 'Links work once, and only in the browser they were requested from. Request a new one here.'
      : 'Open the link from your email, or request a new one.');

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="max-w-sm text-[var(--text-primary)]">{headline}</p>
      <p className="max-w-sm text-[var(--text-body-sm)] text-[var(--text-secondary)]">{hint}</p>
      {known?.code && (
        <p className="font-mono text-[11px] text-[var(--text-tertiary)]">{known.code}</p>
      )}
      <a href="/login" className="text-[var(--accent)] underline">
        Back to sign in
      </a>
    </div>
  );
}
