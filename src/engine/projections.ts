/**
 * Derived numbers. docs/04-RULES-ENGINE.md § 2, docs/07-STATS-AND-RANKINGS.md.
 *
 * Never stored — always projected from state, so they cannot drift.
 *
 * Everything that can divide by zero returns `null`, never `NaN` and never a
 * misleading `0.00`. Per CLAUDE.md the UI renders a null as an en dash: a
 * batter who has faced no balls has no strike rate, which is not the same
 * claim as a strike rate of zero.
 */

import { ballsAllowed, effectiveTarget } from './inningsEnd';
import type { BatterState, BowlerState, InningsState, MatchConfig } from './types';

/** `12.4` = twelve complete overs and four balls. */
export function oversDisplay(legalBalls: number, ballsPerOver: number): string {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
}

/** Overs as a real number, for rate arithmetic. */
export function oversDecimal(legalBalls: number, ballsPerOver: number): number {
  return legalBalls / ballsPerOver;
}

export function currentRunRate(innings: InningsState, config: MatchConfig): number | null {
  if (innings.legalBalls === 0) return null;
  return innings.runs / oversDecimal(innings.legalBalls, config.ballsPerOver);
}

export function ballsRemaining(innings: InningsState, config: MatchConfig): number {
  return Math.max(0, ballsAllowed(innings, config) - innings.legalBalls);
}

/** Runs still needed to win. Null when this innings is not a chase. */
export function requiredRuns(innings: InningsState): number | null {
  const target = effectiveTarget(innings);
  if (target === null) return null;
  return Math.max(0, target - innings.runs);
}

/**
 * Required run rate. Null when there is no target, and null once no balls
 * remain — at that point the required rate is not infinite, it is undefined.
 */
export function requiredRate(innings: InningsState, config: MatchConfig): number | null {
  const need = requiredRuns(innings);
  if (need === null) return null;
  const balls = ballsRemaining(innings, config);
  if (balls === 0) return null;
  return need / oversDecimal(balls, config.ballsPerOver);
}

/** Naive projection: current rate sustained for the balls that remain. */
export function projectedScore(innings: InningsState, config: MatchConfig): number | null {
  const crr = currentRunRate(innings, config);
  if (crr === null) return null;
  return innings.runs + crr * oversDecimal(ballsRemaining(innings, config), config.ballsPerOver);
}

/** Runs per 100 balls. Null before the batter has faced one. */
export function strikeRate(batter: BatterState): number | null {
  if (batter.balls === 0) return null;
  return (batter.runs / batter.balls) * 100;
}

/** Runs conceded per over. Null before the bowler has bowled a legal ball. */
export function economy(bowler: BowlerState, ballsPerOver: number): number | null {
  if (bowler.legalBalls === 0) return null;
  return bowler.runsConceded / oversDecimal(bowler.legalBalls, ballsPerOver);
}

/** Runs per wicket. Null with no wickets — an average of infinity is not a number. */
export function bowlingAverage(bowler: BowlerState): number | null {
  if (bowler.wickets === 0) return null;
  return bowler.runsConceded / bowler.wickets;
}

/** Balls per wicket. */
export function bowlingStrikeRate(bowler: BowlerState): number | null {
  if (bowler.wickets === 0) return null;
  return bowler.legalBalls / bowler.wickets;
}

/** Dot balls as a share of balls faced. docs/07 § 1. */
export function dotPercentFaced(batter: BatterState): number | null {
  if (batter.balls === 0) return null;
  return (batter.dots / batter.balls) * 100;
}

export function totalExtras(innings: InningsState): number {
  const e = innings.extras;
  return e.wides + e.noBalls + e.byes + e.legByes + e.penalty;
}
