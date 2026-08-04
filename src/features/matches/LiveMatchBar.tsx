import { Link, useLocation } from 'react-router';
import { Radio } from 'lucide-react';
import { useMatches } from './hooks';
import { groupMatches } from './matchGroups';

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
  const { live } = groupMatches(
    (data ?? []) as unknown as { status: never; scheduled_at: string | null }[]
  );

  const hidden = location.pathname.startsWith('/matches');
  if (hidden || live.length === 0) return null;

  const match = live[0] as unknown as { id: string; title: string | null };
  const more = live.length - 1;

  return (
    <Link
      to={`/matches/${match.id}/score`}
      className="press fixed inset-x-3 z-40 flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--surface-glass-strong)] px-3 py-2 backdrop-blur-xl"
      style={{ bottom: 'calc(var(--tabbar-h) + var(--safe-b) + 8px)' }}
    >
      <Radio size={16} className="shrink-0 text-[var(--live)]" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
        {match.title ?? 'Match in progress'}
        {more > 0 && (
          <span className="font-normal text-[var(--text-tertiary)]"> +{more} more live</span>
        )}
      </span>
      <span className="shrink-0 text-[13px] font-semibold text-[var(--accent)]">Resume</span>
    </Link>
  );
}
