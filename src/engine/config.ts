/**
 * Match configuration defaults and the six built-in rules profiles.
 * docs/04-RULES-ENGINE.md § 1.
 */

import type { MatchConfig, Powerplay } from './types';

export const DEFAULT_CONFIG: MatchConfig = {
  oversPerInnings: 20,
  ballsPerOver: 6,
  playersPerSide: 11,
  maxOversPerBowler: 'auto',
  wideRuns: 1,
  noBallRuns: 1,
  byesEnabled: true,
  legByesEnabled: true,
  freeHitAfterNoBall: true,
  noBallFreeHitOnAllNoBalls: true,
  lastManStanding: false,
  powerplays: [],
  superOverOnTie: true,
  retiredHurtCanReturn: true,
  penaltyRunsEnabled: true,
  declarationsEnabled: false,
  followOnEnabled: false,
  drsEnabled: false,
};

/**
 * `'auto'` = `ceil(oversPerInnings / 5)`.
 *
 * Worth knowing: this formula reproduces every built-in profile's stated
 * limit exactly — T20 → 4, ODI → 10, T10 → 2, Gully 8 → 2, and The Hundred →
 * 4 overs of 5 balls = the 20-ball cap in the § 1 table.
 */
export function resolveMaxOvers(config: MatchConfig): number {
  if (config.maxOversPerBowler === 'auto') {
    return Math.ceil(config.oversPerInnings / 5);
  }
  return config.maxOversPerBowler;
}

/** Legal balls a single bowler may bowl in an innings. */
export function maxBallsPerBowler(config: MatchConfig): number {
  return resolveMaxOvers(config) * config.ballsPerOver;
}

export type ProfileName = 't20' | 'odi' | 't10' | 'hundred' | 'gully8' | 'custom';

const pp = (
  name: string,
  fromOver: number,
  toOver: number,
  fieldersOutside: number
): Powerplay => ({
  name,
  fromOver,
  toOver,
  fieldersOutside,
});

/**
 * The Hundred is expressed as 20 overs of 5 balls = 100 balls, with a 4-over
 * (20-ball) bowler cap. The engine has no concept of "100 balls" as a unit —
 * everything is overs × ballsPerOver — so the profile encodes it that way.
 */
export const PROFILES: Record<Exclude<ProfileName, 'custom'>, MatchConfig> = {
  t20: {
    ...DEFAULT_CONFIG,
    oversPerInnings: 20,
    ballsPerOver: 6,
    maxOversPerBowler: 4,
    powerplays: [pp('PP1', 1, 6, 2)],
  },
  odi: {
    ...DEFAULT_CONFIG,
    oversPerInnings: 50,
    ballsPerOver: 6,
    maxOversPerBowler: 10,
    powerplays: [pp('PP1', 1, 10, 2), pp('PP2', 11, 40, 4), pp('PP3', 41, 50, 5)],
  },
  t10: {
    ...DEFAULT_CONFIG,
    oversPerInnings: 10,
    ballsPerOver: 6,
    maxOversPerBowler: 2,
    powerplays: [pp('PP1', 1, 3, 2)],
  },
  hundred: {
    ...DEFAULT_CONFIG,
    oversPerInnings: 20,
    ballsPerOver: 5,
    maxOversPerBowler: 4,
    // "first 25 balls" = the first 5 overs of 5.
    powerplays: [pp('PP1', 1, 5, 2)],
  },
  gully8: {
    ...DEFAULT_CONFIG,
    oversPerInnings: 8,
    ballsPerOver: 6,
    maxOversPerBowler: 2,
    powerplays: [],
  },
};

export function profile(name: Exclude<ProfileName, 'custom'>): MatchConfig {
  return { ...PROFILES[name], powerplays: PROFILES[name].powerplays.map((p) => ({ ...p })) };
}

/** Builds a config from the defaults plus overrides. */
export function makeConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

/**
 * The powerplay covering the over currently being bowled, if any.
 * `legalBalls` is the count *completed*, so the live over is the next one.
 * docs/04 § 9 — v1 displays this, it does not validate fielder positions.
 */
export function getCurrentPowerplay(config: MatchConfig, legalBalls: number): Powerplay | null {
  const overNumber = Math.floor(legalBalls / config.ballsPerOver) + 1;
  return config.powerplays.find((p) => overNumber >= p.fromOver && overNumber <= p.toOver) ?? null;
}

/** Wickets that end the innings — one fewer than the side, unless last-man-standing. */
export function allOutWickets(config: MatchConfig): number {
  return config.lastManStanding ? config.playersPerSide : config.playersPerSide - 1;
}
