import type { InningsEndReason, InningsState, MatchConfig } from './types';

/**
 * How many batters this side actually has.
 *
 * `config.playersPerSide` is what the match was set up for; `innings.squadSize`
 * is who was picked. A side of 2 in a 3-a-side match is all out at one wicket.
 * Null squadSize means nobody told the engine, and the configured number
 * stands — which is every engine test written before this existed.
 *
 * Exported so `result` and `applyDelivery` ask the same question the same way;
 * three copies of `playersPerSide - 1` is how they would drift.
 */
export function effectivePlayersPerSide(
  config: MatchConfig,
  innings: Pick<InningsState, 'squadSize'>
): number {
  return innings.squadSize === null
    ? config.playersPerSide
    : Math.min(config.playersPerSide, innings.squadSize);
}

/** docs/04-RULES-ENGINE.md §7.1 */
export function checkInningsEnd(
  innings: InningsState,
  config: MatchConfig
): InningsEndReason | null {
  // All out is "no batter left to send in", and that depends on who actually
  // turned up, not on what the match was configured for. `playersPerSide` is
  // the cap; `innings.squadSize` is the side, and a side of 2 in a 3-a-side
  // match is all out at one wicket, not two.
  //
  // Without this, a short side reached a state with nobody left to bat and an
  // innings that had not ended — the pad sat on "next batter: No batters
  // remaining" with no way forward. `squadSize` is null when nobody told the
  // engine, and then only the configured number applies, exactly as before.
  const effectivePlayers = effectivePlayersPerSide(config, innings);
  const maxWickets = config.lastManStanding ? effectivePlayers : effectivePlayers - 1;
  if (innings.wickets >= maxWickets) return 'all_out';

  const totalBalls = (innings.revisedOvers ?? config.oversPerInnings) * config.ballsPerOver;
  if (innings.legalBalls >= totalBalls) return 'overs_complete';

  const target = innings.revisedTarget ?? innings.target;
  if (target !== null && innings.runs >= target) return 'target_reached';

  return null;
}
