import { effectivePlayersPerSide } from './inningsEnd';
import type { InningsState, MatchConfig, MatchResult } from './types';

/** docs/04-RULES-ENGINE.md §7.2 */
export function computeMatchResult(
  innings1: InningsState,
  innings2: InningsState,
  config: MatchConfig
): MatchResult {
  const players = effectivePlayersPerSide(config, innings2);
  const maxWickets = config.lastManStanding ? players : players - 1;
  const target = innings2.target ?? innings1.runs + 1;

  if (innings2.runs >= target) {
    const marginWickets = maxWickets - innings2.wickets;
    return {
      type: 'win',
      winnerTeamId: innings2.battingTeamId,
      marginRuns: null,
      marginWickets,
      text: `${innings2.battingTeamId} won by ${marginWickets} wicket${marginWickets === 1 ? '' : 's'}`,
    };
  }

  if (innings2.runs === target - 1) {
    return {
      type: 'tie',
      winnerTeamId: null,
      marginRuns: null,
      marginWickets: null,
      text: 'Match tied',
    };
  }

  const marginRuns = target - 1 - innings2.runs;
  return {
    type: 'win',
    winnerTeamId: innings1.battingTeamId,
    marginRuns,
    marginWickets: null,
    text: `${innings1.battingTeamId} won by ${marginRuns} run${marginRuns === 1 ? '' : 's'}`,
  };
}

/**
 * docs/04-RULES-ENGINE.md §7.2 — "each side picks 3 batters and 1 bowler, the
 * innings ends at 2 wickets" means a 3-a-side game: `playersPerSide: 3` makes
 * `checkInningsEnd`'s existing all-out formula (`playersPerSide - 1`) land on
 * 2 without a separate special case.
 */
export function superOverConfig(base: MatchConfig): MatchConfig {
  return {
    ...base,
    oversPerInnings: 1,
    playersPerSide: 3,
    maxOversPerBowler: 1,
    powerplays: [],
    lastManStanding: false,
  };
}

/**
 * Who won the most recent super over, or null if it was level.
 *
 * A super over is decided on runs alone — wickets never carry a margin,
 * because "won by 2 wickets" is meaningless over six balls with three batters.
 * docs/04 § 7.2 says the side with more runs wins and a level score goes to
 * another super over, so that is exactly what this reports and nothing more.
 */
export function decideLastSuperOver(allInnings: InningsState[]): MatchResult | null {
  const supers = allInnings.filter((i) => i.isSuperOver);
  const second = supers[supers.length - 1];
  const first = supers[supers.length - 2];
  // A half-finished pair is not a result. Bailing out here is what keeps the
  // innings-break screen showing "start the second super over innings".
  if (!first || !second || second.status === 'in_progress') return null;
  if (first.runs === second.runs) return null;

  const winner = second.runs > first.runs ? second : first;
  const margin = Math.abs(second.runs - first.runs);
  return {
    type: 'super_over_win',
    winnerTeamId: winner.battingTeamId,
    marginRuns: margin,
    marginWickets: null,
    text: `${winner.battingTeamId} won the super over by ${margin} run${margin === 1 ? '' : 's'}`,
  };
}

function teamBoundaryCount(innings: InningsState, teamId: string): number {
  if (innings.battingTeamId !== teamId) return 0;
  return Object.values(innings.batters).reduce((sum, b) => sum + b.fours + b.sixes, 0);
}

/**
 * docs/04-RULES-ENGINE.md §7.2 — after `maxSuperOverAttempts` (default 3) ties
 * in a row, fall back to boundary countback across the whole match (all
 * innings, not just the super overs), then finally a declared tie.
 */
export function resolveTiedSuperOvers(
  allInnings: InningsState[],
  teamAId: string,
  teamBId: string,
  attemptsExhausted: boolean
): MatchResult {
  // **This function only ever handled the tied case, and the caller handed it
  // every case.** The name says "resolveTied…", but `handleInningsComplete`
  // called it for *any* completed super-over pair without first asking who
  // won — so a super over with a perfectly clear winner came back
  // `type: 'tie'`, the store saw a tie with `superOverOnTie` on, and offered
  // another super over. Forever.
  //
  // Reported 2026-08-04: side one all out for 0, side two scored 1, and the
  // match "goes into a loop of starts super over". Decide the pair first;
  // only a genuine tie belongs to the rest of this function.
  const decided = decideLastSuperOver(allInnings);
  if (decided) return decided;

  if (!attemptsExhausted) {
    return {
      type: 'tie',
      winnerTeamId: null,
      marginRuns: null,
      marginWickets: null,
      text: 'Super over tied',
    };
  }

  const boundariesA = allInnings.reduce((sum, i) => sum + teamBoundaryCount(i, teamAId), 0);
  const boundariesB = allInnings.reduce((sum, i) => sum + teamBoundaryCount(i, teamBId), 0);

  if (boundariesA === boundariesB) {
    return {
      type: 'tie',
      winnerTeamId: null,
      marginRuns: null,
      marginWickets: null,
      text: 'Match tied — boundary countback also level',
    };
  }

  const winnerTeamId = boundariesA > boundariesB ? teamAId : teamBId;
  return {
    type: 'super_over_win',
    winnerTeamId,
    marginRuns: null,
    marginWickets: null,
    text: `Match tied — ${winnerTeamId} win on boundary countback`,
  };
}

export const DEFAULT_MAX_SUPER_OVER_ATTEMPTS = 3;
