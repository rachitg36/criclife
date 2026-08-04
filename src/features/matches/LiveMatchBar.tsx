import { Link, useLocation } from 'react-router';
import { Radio } from 'lucide-react';
import { useMyTeams } from '@/features/teams/hooks';
import { useMatches } from './hooks';
import { groupMatches, mineOnly } from './matchGroups';

/**
 * A live match must never be lost.
 *
 * `/matches` gave a way back, but only if you thought to go looking. This is
 * the standing one: while any match is in progress, a bar sits above the tab
 * bar on every authenticated screen with a tap straight into the pad. It is
 * driven by the same `useMatches` query as the list, so it survives a refresh,
 * a navigation, or a cold start — there is no local state to lose.
 *
 * Deliberately not rendered on the scorer route itself (that layout has no tab
 * bar and its own rules) or on `/matches`, where the list already leads with
 * the same match.
 */
export function LiveMatchBar() {
  const location = useLocation();
  const { data } = useMatches();
  const { data: myTeams } = useMyTeams();
  // Only matches this person could resume. Everything is world-readable, so
  // an unfiltered count includes other people's games entirely.
  const { live } = groupMatches(
    mineOnly(
      (data ?? []) as unknown as {
        status: never;
        scheduled_at: string | null;
        team_a_id: string;
        team_b_id: string;
      }[],
      (myTeams ?? []).map((t) => t.id)
    )
  );

  const hidden = location.pathname.startsWith('/matches');
  if (hidden || live.length === 0) return null;

  const match = live[0] as unknown as { id: string; title: string | null };
  const more = live.length - 1;

  // With one live match, go straight to its pad. With several, go to the list
  // and let the human pick: guessing sent somebody who had just finished one
  // match into an *older* one that was still open, which reads as the app
  // reopening a match it was told was over.
  const to = more > 0 ? '/matches' : `/matches/${match.id}/score`;

  return (
    <Link
      to={to}
      className="press fixed inset-x-3 z-40 flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--surface-glass-strong)] px-3 py-2 backdrop-blur-xl"
      style={{ bottom: 'calc(var(--tabbar-h) + var(--safe-b) + 8px)' }}
    >
      <Radio size={16} className="shrink-0 text-[var(--live)]" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
        {more > 0 ? `${live.length} matches in progress` : (match.title ?? 'Match in progress')}
      </span>
      <span className="shrink-0 text-[13px] font-semibold text-[var(--accent)]">
        {more > 0 ? 'Choose' : 'Resume'}
      </span>
    </Link>
  );
}
