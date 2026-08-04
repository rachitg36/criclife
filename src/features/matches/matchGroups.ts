import type { MatchStatus } from '@/engine/types';

/**
 * Sorts a flat list of matches into the three groups the list screen shows.
 *
 * Pure, because "which matches can I get back to" turned out to be the
 * question the app could not answer: `/matches` was a Phase 0 stub, Home is
 * still the Phase 0 placeholder, and the ⊕ tab went straight to
 * `/matches/new`. Once you navigated away from a live match there was no route
 * back to it short of the browser history. docs/11's navigation model says
 * that tab's action is "start **or resume** a match" — only half of it was
 * built.
 */

/** In progress right now, and the reason this screen exists. */
const LIVE: readonly MatchStatus[] = ['live', 'innings_break', 'super_over'];
/** Set up but not started — `scheduled` and `toss`. */
const UPCOMING: readonly MatchStatus[] = ['scheduled', 'toss'];

export type GroupedMatches<T> = {
  live: T[];
  upcoming: T[];
  finished: T[];
};

export function groupMatches<T extends { status: MatchStatus; scheduled_at: string | null }>(
  matches: readonly T[]
): GroupedMatches<T> {
  // Newest first inside each group. A null date sorts last rather than
  // throwing the whole list to the top, which is what `?? ''` would do.
  const byDate = [...matches].sort((a, b) => {
    if (a.scheduled_at === b.scheduled_at) return 0;
    if (a.scheduled_at === null) return 1;
    if (b.scheduled_at === null) return -1;
    return b.scheduled_at.localeCompare(a.scheduled_at);
  });

  return {
    live: byDate.filter((m) => LIVE.includes(m.status)),
    upcoming: byDate.filter((m) => UPCOMING.includes(m.status)),
    finished: byDate.filter((m) => !LIVE.includes(m.status) && !UPCOMING.includes(m.status)),
  };
}

/**
 * Where the primary button on a match row should go, and what it should say.
 *
 * A finished match goes to the match hub rather than a scorecard route:
 * `/matches/:matchId/scorecard` is still a Phase 0 stub, and the real
 * scorecard is the audience view, which needs a `public_slug` this function
 * does not have. The hub knows the slug and links straight through.
 */
export function resumeAction(status: MatchStatus): { label: string; path: string } {
  if (LIVE.includes(status)) return { label: 'Resume scoring', path: 'score' };
  if (status === 'completed' || status === 'abandoned') return { label: 'Result', path: '' };
  return { label: 'Set up', path: 'setup' };
}
