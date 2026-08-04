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

/**
 * When a match happened, for ordering.
 *
 * `scheduled_at` alone was wrong, and wrong in a way that hid the most
 * interesting match on the screen: a match created without a date sorted to
 * the *bottom* of Finished, so the game played twenty minutes ago fell below
 * three older ones and never made Home's top three. Reported on 2026-08-04 as
 * "the test4 game is not available at the home screen. This was the most
 * recent game that was played."
 *
 * `completed_at` first, because for a finished match that is the truth and
 * `scheduled_at` is only ever an intention. `created_at` last, so a row with
 * no dates at all still lands somewhere sensible instead of nowhere.
 */
export function matchSortKey(m: {
  scheduled_at: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}): string {
  return m.completed_at ?? m.scheduled_at ?? m.created_at ?? '';
}

export function groupMatches<
  T extends {
    status: MatchStatus;
    scheduled_at: string | null;
    completed_at?: string | null;
    created_at?: string | null;
  },
>(matches: readonly T[]): GroupedMatches<T> {
  // Newest first inside each group, on the best date each row actually has.
  const byDate = [...matches].sort((a, b) => matchSortKey(b).localeCompare(matchSortKey(a)));

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

/**
 * Only the matches this person could actually resume.
 *
 * `matches_read_public` makes every match world-readable — correct, a live
 * score is public — so a bar built on "all live matches" counts strangers'
 * games. It read "9 matches in progress" on a phone whose owner had two teams,
 * and would read far worse the moment anybody else used the app.
 *
 * "Mine" is a side I am a member of. That is narrower than the server's
 * `can_score` (which also honours a scoring grant issued to somebody outside
 * both teams), and deliberately so: this drives a convenience bar, not a
 * permission. The server refuses anything it should.
 */
export function mineOnly<T extends { team_a_id: string; team_b_id: string }>(
  matches: readonly T[],
  myTeamIds: readonly string[]
): T[] {
  if (myTeamIds.length === 0) return [];
  const mine = new Set(myTeamIds);
  return matches.filter((m) => mine.has(m.team_a_id) || mine.has(m.team_b_id));
}
