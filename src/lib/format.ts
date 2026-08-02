/**
 * Cricket display formatting. Pure functions, no framework.
 * Stat definitions: docs/07-STATS-AND-RANKINGS.md § 1
 */

/** 87 legal balls at 6/over → "14.3" */
export function formatOvers(legalBalls: number, ballsPerOver = 6): string {
  const completed = Math.floor(legalBalls / ballsPerOver);
  const remainder = legalBalls % ballsPerOver;
  return `${completed}.${remainder}`;
}

/** "147-4" — the scoreboard convention used across the app. */
export function formatScore(runs: number, wickets: number): string {
  return `${runs}-${wickets}`;
}

/** "3.3-0-28-2" */
export function formatBowlingFigures(
  legalBalls: number,
  maidens: number,
  runs: number,
  wickets: number,
  ballsPerOver = 6
): string {
  return `${formatOvers(legalBalls, ballsPerOver)}-${maidens}-${runs}-${wickets}`;
}

/** "62*" when not out, "62" when out. */
export function formatBattingScore(runs: number, isOut: boolean): string {
  return isOut ? String(runs) : `${runs}*`;
}

/** Batting average. Never divided by zero — a never-out player shows "–". */
export function battingAverage(runs: number, innings: number, notOuts: number): number | null {
  const dismissals = innings - notOuts;
  return dismissals > 0 ? runs / dismissals : null;
}

export function strikeRate(runs: number, ballsFaced: number): number | null {
  return ballsFaced > 0 ? (runs / ballsFaced) * 100 : null;
}

export function economyRate(
  runsConceded: number,
  legalBalls: number,
  ballsPerOver = 6
): number | null {
  if (legalBalls === 0) return null;
  return runsConceded / (legalBalls / ballsPerOver);
}

export function bowlingAverage(runsConceded: number, wickets: number): number | null {
  return wickets > 0 ? runsConceded / wickets : null;
}

export function currentRunRate(runs: number, legalBalls: number, ballsPerOver = 6): number | null {
  if (legalBalls === 0) return null;
  return runs / (legalBalls / ballsPerOver);
}

export function requiredRunRate(
  target: number,
  runs: number,
  ballsRemaining: number,
  ballsPerOver = 6
): number | null {
  if (ballsRemaining <= 0) return null;
  return (target - runs) / (ballsRemaining / ballsPerOver);
}

/** Renders a nullable stat. Cricket shows "–", not "0.00" or "NaN". */
export function stat(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return value.toFixed(decimals);
}

/** "R Sharma" from "Rohit Sharma" — used wherever space is tight. */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  const initial = parts[0]?.[0] ?? '';
  return `${initial} ${last}`;
}

/** Two-letter monogram for the generated avatar fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

/** Deterministic hue from a string — powers avatar gradients. */
export function hueFromString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

/** "24 runs" / "6 wickets" — pluralisation that reads naturally. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
