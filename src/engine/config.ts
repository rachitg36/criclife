import type { MatchConfig } from './types';

/** `docs/04-RULES-ENGINE.md` §1 — defaults for a from-scratch custom match. */
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

/** `maxOversPerBowler: 'auto'` resolves to this — docs/04 §1. */
export function resolveMaxOversPerBowler(config: MatchConfig): number {
  return config.maxOversPerBowler === 'auto'
    ? Math.ceil(config.oversPerInnings / 5)
    : config.maxOversPerBowler;
}

/**
 * The six built-in rules profiles from docs/04-RULES-ENGINE.md §1's table.
 * Fielding-restriction counts for ODI/T10 powerplays aren't specced in that
 * table (only T20's "2 out" is); these use the standard real-world playing
 * conditions rather than an invented number.
 */
export const RULES_PROFILES = {
  t20: {
    ...DEFAULT_CONFIG,
    rulesProfileName: 'T20 Standard',
    oversPerInnings: 20,
    ballsPerOver: 6,
    maxOversPerBowler: 4,
    powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 6, fieldersOutside: 2 }],
  },
  odi: {
    ...DEFAULT_CONFIG,
    rulesProfileName: 'ODI Standard',
    oversPerInnings: 50,
    ballsPerOver: 6,
    maxOversPerBowler: 10,
    powerplays: [
      { name: 'PP1', fromOver: 1, toOver: 10, fieldersOutside: 2 },
      { name: 'PP2', fromOver: 11, toOver: 40, fieldersOutside: 4 },
      { name: 'PP3', fromOver: 41, toOver: 50, fieldersOutside: 5 },
    ],
  },
  t10: {
    ...DEFAULT_CONFIG,
    rulesProfileName: 'T10',
    oversPerInnings: 10,
    ballsPerOver: 6,
    maxOversPerBowler: 2,
    powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 3, fieldersOutside: 2 }],
  },
  theHundred: {
    ...DEFAULT_CONFIG,
    rulesProfileName: 'The Hundred',
    // 100 balls at 5 per over = 20 "overs"; a bowler's 20-ball limit is 4 overs.
    oversPerInnings: 20,
    ballsPerOver: 5,
    maxOversPerBowler: 4,
    powerplays: [{ name: 'Powerplay', fromOver: 1, toOver: 5, fieldersOutside: 2 }],
  },
  gully8: {
    ...DEFAULT_CONFIG,
    rulesProfileName: 'Gully 8',
    oversPerInnings: 8,
    ballsPerOver: 6,
    maxOversPerBowler: 2,
    powerplays: [],
  },
} satisfies Record<string, MatchConfig>;

/** The sixth profile — a user-defined config seeded from the defaults. */
export function createCustomConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return { ...CUSTOM_DEFAULTS, rulesProfileName: 'Custom', ...overrides };
}

/**
 * What "Custom" starts from.
 *
 * Not `DEFAULT_CONFIG`. That is a twenty-over eleven-a-side game — the right
 * default for the *app*, and the wrong one for this button, which in practice
 * is reached by someone setting up a short game in a garden or a hall.
 * Requested directly on 2026-08-04, and these are the numbers asked for.
 *
 * Every one of them is still editable on the same screen; this only decides
 * which numbers you have to change fewest of.
 */
export const CUSTOM_DEFAULTS: MatchConfig = {
  ...DEFAULT_CONFIG,
  oversPerInnings: 2,
  ballsPerOver: 6,
  playersPerSide: 3,
  maxOversPerBowler: 3,
  freeHitAfterNoBall: true,
  superOverOnTie: true,
};
