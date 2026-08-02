/**
 * Match result and super overs. docs/04-RULES-ENGINE.md § 7.2.
 */

import { allOutWickets } from './config';
import type { InningsState, MatchConfig, MatchResult, MatchState } from './types';

/**
 * A super over is one over a side, three batters, and the innings ends at two
 * wickets down — which the existing all-out rule produces for free once
 * `playersPerSide` is 3.
 */
export function superOverConfig(config: MatchConfig): MatchConfig {
  return {
    ...config,
    oversPerInnings: 1,
    playersPerSide: 3,
    maxOversPerBowler: 1,
    powerplays: [],
    lastManStanding: false,
  };
}

/** The config that governs a given innings — super overs play by their own rules. */
export function configForInnings(state: MatchState, inningsIndex: number): MatchConfig {
  const innings = state.innings[inningsIndex];
  if (innings?.isSuperOver) return superOverConfig(state.config);
  return state.config;
}

/**
 * The result once both innings of a pair are done.
 *
 * `first` is the side that set the target, `second` the side that chased it.
 * A tie here does not necessarily end the match — see `needsSuperOver`.
 */
export function computeResult(
  first: InningsState,
  second: InningsState,
  config: MatchConfig,
  viaSuperOver = false
): MatchResult {
  const target = second.revisedTarget ?? second.target ?? first.runs + 1;

  if (second.runs >= target) {
    const wicketsInHand = allOutWickets(config) - second.wickets;
    return {
      kind: 'win',
      winnerTeamId: second.battingTeamId,
      margin: { by: 'wickets', value: wicketsInHand },
      viaSuperOver,
      text: `won by ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'}`,
    };
  }

  if (second.runs === target - 1) {
    return {
      kind: 'tie',
      winnerTeamId: null,
      margin: null,
      viaSuperOver,
      text: 'match tied',
    };
  }

  const byRuns = target - 1 - second.runs;
  return {
    kind: 'win',
    winnerTeamId: first.battingTeamId,
    margin: { by: 'runs', value: byRuns },
    viaSuperOver,
    text: `won by ${byRuns} run${byRuns === 1 ? '' : 's'}`,
  };
}

/** Maximum super overs before falling back to a countback. docs/04 § 7.2. */
export const MAX_SUPER_OVERS = 3;

export function needsSuperOver(result: MatchResult, config: MatchConfig): boolean {
  return result.kind === 'tie' && config.superOverOnTie;
}

/** How many super overs have already been played. */
export function superOverCount(state: MatchState): number {
  return Math.floor(state.innings.filter((i) => i.isSuperOver).length / 2);
}

/**
 * Boundary countback — the tiebreak once `MAX_SUPER_OVERS` is exhausted.
 * Counts fours and sixes across every innings a side batted.
 */
export function boundaryCountback(state: MatchState, teamId: string): number {
  return state.innings
    .filter((i) => i.battingTeamId === teamId)
    .reduce(
      (total, i) => total + Object.values(i.batters).reduce((sum, b) => sum + b.fours + b.sixes, 0),
      0
    );
}
