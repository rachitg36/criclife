/**
 * Innings end conditions. docs/04-RULES-ENGINE.md § 7.1.
 */

import { allOutWickets } from './config';
import type { InningsEndReason, InningsState, MatchConfig } from './types';

/** Legal balls available, honouring a rain-revised over count. */
export function ballsAllowed(innings: InningsState, config: MatchConfig): number {
  const overs = innings.revisedOvers ?? config.oversPerInnings;
  return overs * config.ballsPerOver;
}

/** The score needed to win, honouring a revised target. */
export function effectiveTarget(innings: InningsState): number | null {
  return innings.revisedTarget ?? innings.target;
}

/**
 * Why this innings is over, or null if it is not.
 *
 * Order matters: a chase that reaches its target on the same ball that brings
 * up the tenth wicket is a win, not an all-out. And per § 7.1, the winning run
 * ends the innings immediately even when it comes off a no-ball or wide —
 * which falls out naturally here because this is checked after the runs are
 * applied, regardless of the ball's legality.
 */
export function checkInningsEnd(
  innings: InningsState,
  config: MatchConfig
): InningsEndReason | null {
  const target = effectiveTarget(innings);
  if (target !== null && innings.runs >= target) return 'target_reached';

  if (innings.wickets >= allOutWickets(config)) return 'all_out';

  if (innings.legalBalls >= ballsAllowed(innings, config)) return 'overs_complete';

  return null;
}

/**
 * A side can also run out of batters without reaching the wicket ceiling —
 * retirements do that. If nobody is left to partner the striker the innings
 * is over, unless last-man-standing lets them bat alone.
 */
export function hasBattersRemaining(innings: InningsState, config: MatchConfig): boolean {
  if (innings.yetToBat.length > 0) return true;
  const atCrease = [innings.strikerId, innings.nonStrikerId].filter((id) => id !== null).length;
  return config.lastManStanding ? atCrease >= 1 : atCrease >= 2;
}
