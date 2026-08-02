import type { InningsEndReason, InningsState, MatchConfig } from './types';

/** docs/04-RULES-ENGINE.md §7.1 */
export function checkInningsEnd(
  innings: InningsState,
  config: MatchConfig
): InningsEndReason | null {
  const maxWickets = config.lastManStanding ? config.playersPerSide : config.playersPerSide - 1;
  if (innings.wickets >= maxWickets) return 'all_out';

  const totalBalls = (innings.revisedOvers ?? config.oversPerInnings) * config.ballsPerOver;
  if (innings.legalBalls >= totalBalls) return 'overs_complete';

  const target = innings.revisedTarget ?? innings.target;
  if (target !== null && innings.runs >= target) return 'target_reached';

  return null;
}
