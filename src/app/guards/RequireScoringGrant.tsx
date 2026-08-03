import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Skeleton } from '@/components/ui/Skeleton';
import { openChangeChannel } from '@/lib/realtime';
import { useAuth } from '@/features/auth/authContext';

type Status = 'checking' | 'allowed' | 'denied';

/**
 * The server-side truth is always `can_score(match_id, auth.uid())` in RLS —
 * this guard mirrors that check client-side so the pad isn't rendered for
 * someone every write will 403 for, and subscribes to `scoring_grants` so a
 * revocation flips it within ~2 seconds, even mid-over.
 *
 * A revocation discovered *after* the pad is already up does not unmount
 * it — that would drop in-flight scorer state. It instead flips
 * `useScorerStore`'s `revoked` flag, which `ScorerRoute` already renders as
 * the dimmed read-only pad + banner (docs/05 § 5 `READ_ONLY`). Only a grant
 * that was never there to begin with blocks rendering outright.
 *
 * Unlike every other authed screen, this one deliberately does NOT sit
 * behind `<RequireAuth>`. `RequireAuth` redirects via `<Navigate>`, which
 * swaps the whole matched route — including `ScoringLayout` — for `/login`,
 * so the no-scroll shell unmounts instead of rendering a state inside it.
 * That breaks `tests/e2e/scorer-no-scroll.spec.ts`'s premise (something
 * always renders under the shell) for anyone without a session. This guard
 * folds "not signed in" into its own render instead, same as "no grant" —
 * both stay inside `ScoringLayout`, so the shell is always there to measure.
 *
 * `supabase` and the scoring store are dynamically imported rather than
 * imported at module scope: this guard is a static import in `router.tsx`,
 * so anything it imports normally rides into the eager main chunk — the
 * exact "audience route (initial JS)" budget in package.json's size-limit
 * config exists to keep `@supabase/supabase-js` and the engine out of that
 * bundle until a route that actually needs them loads.
 *
 * docs/03-ROLES-PERMISSIONS.md § 3
 */
export function RequireScoringGrant({ children }: { children: ReactNode }) {
  const { matchId } = useParams<{ matchId: string }>();
  const location = useLocation();
  const { session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    if (authLoading || !matchId || !session) return;
    const mid = matchId;
    const uid = session.user.id;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const [{ supabase }, { useScorerStore }] = await Promise.all([
        import('@/lib/supabase'),
        import('@/features/scoring/store'),
      ]);
      if (cancelled) return;

      async function check() {
        const { data, error } = await supabase.rpc('can_score', {
          p_match_id: mid,
          p_profile_id: uid,
        });
        if (cancelled) return;
        const allowed = !error && data === true;
        setStatus((prev) => {
          if (prev === 'allowed' && !allowed) {
            useScorerStore.getState().markRevoked(true);
            return prev; // keep the pad mounted; the store shows read-only
          }
          if (allowed) useScorerStore.getState().markRevoked(false);
          return allowed ? 'allowed' : 'denied';
        });
      }

      await check();
      // Two awaits have gone by; the cleanup may already have run, in which
      // case subscribing now would leak a channel that nothing tears down.
      if (cancelled) return;

      const channel = openChangeChannel(supabase, `scoring-grants:${mid}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'scoring_grants', filter: `match_id=eq.${mid}` },
          () => void check()
        )
        .subscribe();
      unsubscribe = () => {
        void supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [matchId, session]);

  if (authLoading || status === 'checking') {
    return (
      <div className="flex h-full items-center justify-center">
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="text-[15px] text-[var(--text-secondary)]">Sign in to score this match.</p>
        <Link to="/login" state={{ from: location }} className="text-[var(--accent)] underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="text-[15px] text-[var(--text-secondary)]">
          You don't have scoring rights for this match.
        </p>
        <Link to={matchId ? `/matches/${matchId}` : '/'} className="text-[var(--accent)] underline">
          Go to the match
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
