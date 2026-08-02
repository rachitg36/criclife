import type { InningsState, MatchConfig, PlayerId } from './types';

/** docs/04-RULES-ENGINE.md §2 — "Derived, never stored" formulas. */
export function oversDisplay(legalBalls: number, ballsPerOver: number): string {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
}

export function currentRunRate(innings: InningsState, config: MatchConfig): number {
  if (innings.legalBalls === 0) return 0;
  return innings.runs / (innings.legalBalls / config.ballsPerOver);
}

export function requiredRuns(innings: InningsState): number | null {
  return innings.target === null ? null : innings.target - innings.runs;
}

export function ballsRemaining(innings: InningsState, config: MatchConfig): number {
  const totalBalls = (innings.revisedOvers ?? config.oversPerInnings) * config.ballsPerOver;
  return Math.max(0, totalBalls - innings.legalBalls);
}

export function requiredRunRate(innings: InningsState, config: MatchConfig): number | null {
  const req = requiredRuns(innings);
  if (req === null) return null;
  if (req <= 0) return 0;

  const remaining = ballsRemaining(innings, config);
  if (remaining === 0) return Infinity;
  return req / (remaining / config.ballsPerOver);
}

export function projectedScore(innings: InningsState, config: MatchConfig): number {
  const remaining = ballsRemaining(innings, config);
  return innings.runs + currentRunRate(innings, config) * (remaining / config.ballsPerOver);
}

export type PartnershipEntry = {
  /** 1-indexed; the current, unbroken stand is `wickets + 1`. */
  wicketNumber: number;
  runs: number;
  legalBalls: number;
  /** `null` for the current, still-unbroken stand. */
  endedByPlayerId: PlayerId | null;
};

/**
 * Runs/balls per stand, derived from `fallOfWickets` deltas. The two batters
 * in a *completed* stand aren't reconstructable from `InningsState` alone
 * (that needs the full ball-by-ball log); this reports what the aggregated
 * state can honestly answer — how much each stand was worth, and who ended it.
 */
export function buildPartnerships(innings: InningsState): PartnershipEntry[] {
  const entries: PartnershipEntry[] = [];
  let prevRuns = 0;
  let prevBalls = 0;

  for (const fow of innings.fallOfWickets) {
    entries.push({
      wicketNumber: fow.wicketNumber,
      runs: fow.runs - prevRuns,
      legalBalls: fow.legalBalls - prevBalls,
      endedByPlayerId: fow.playerId,
    });
    prevRuns = fow.runs;
    prevBalls = fow.legalBalls;
  }

  if (innings.status === 'in_progress') {
    entries.push({
      wicketNumber: innings.wickets + 1,
      runs: innings.runs - prevRuns,
      legalBalls: innings.legalBalls - prevBalls,
      endedByPlayerId: null,
    });
  }

  return entries;
}
