import type { InningsState, MatchConfig, MatchResult } from './types';

/** docs/04-RULES-ENGINE.md §7.2 */
export function computeMatchResult(
  innings1: InningsState,
  innings2: InningsState,
  config: MatchConfig
): MatchResult {
  const maxWickets = config.lastManStanding ? config.playersPerSide : config.playersPerSide - 1;
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
