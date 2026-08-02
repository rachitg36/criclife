import type { ExtraType, PlayerId, WicketType } from './types';

/** docs/04-RULES-ENGINE.md §5.1 */
export type CreditRule = {
  bowlerCredited: boolean;
  fielderRole: 'catch' | 'run_out' | 'stumping' | null;
  ballsCounted: boolean;
  /** `retired_hurt` is the one type that doesn't increment `innings.wickets`. */
  countsAsWicket: boolean;
};

export const CREDIT_TABLE: Record<WicketType, CreditRule> = {
  bowled: { bowlerCredited: true, fielderRole: null, ballsCounted: true, countsAsWicket: true },
  caught: { bowlerCredited: true, fielderRole: 'catch', ballsCounted: true, countsAsWicket: true },
  lbw: { bowlerCredited: true, fielderRole: null, ballsCounted: true, countsAsWicket: true },
  stumped: {
    bowlerCredited: true,
    fielderRole: 'stumping',
    ballsCounted: true,
    countsAsWicket: true,
  },
  hit_wicket: { bowlerCredited: true, fielderRole: null, ballsCounted: true, countsAsWicket: true },
  run_out: {
    bowlerCredited: false,
    fielderRole: 'run_out',
    ballsCounted: true,
    countsAsWicket: true,
  },
  obstructing_the_field: {
    bowlerCredited: false,
    fielderRole: null,
    ballsCounted: true,
    countsAsWicket: true,
  },
  hit_ball_twice: {
    bowlerCredited: false,
    fielderRole: null,
    ballsCounted: true,
    countsAsWicket: true,
  },
  timed_out: {
    bowlerCredited: false,
    fielderRole: null,
    ballsCounted: false,
    countsAsWicket: true,
  },
  retired_out: {
    bowlerCredited: false,
    fielderRole: null,
    ballsCounted: true,
    countsAsWicket: true,
  },
  retired_hurt: {
    bowlerCredited: false,
    fielderRole: null,
    ballsCounted: true,
    countsAsWicket: false,
  },
  // Merged into obstructing the field under current Laws; kept for legacy imports.
  handled_the_ball: {
    bowlerCredited: false,
    fielderRole: null,
    ballsCounted: true,
    countsAsWicket: true,
  },
};

type LegalityRow = { normal: boolean; wide: boolean; noBall: boolean; freeHit: boolean };

/** docs/04-RULES-ENGINE.md §5.2. Bye/leg-bye/penalty/no-extra balls all use `normal`. */
const LEGALITY_TABLE: Record<WicketType, LegalityRow> = {
  bowled: { normal: true, wide: false, noBall: false, freeHit: false },
  caught: { normal: true, wide: false, noBall: false, freeHit: false },
  lbw: { normal: true, wide: false, noBall: false, freeHit: false },
  stumped: { normal: true, wide: true, noBall: false, freeHit: false },
  hit_wicket: { normal: true, wide: false, noBall: false, freeHit: false },
  run_out: { normal: true, wide: true, noBall: true, freeHit: true },
  obstructing_the_field: { normal: true, wide: true, noBall: true, freeHit: true },
  hit_ball_twice: { normal: true, wide: false, noBall: true, freeHit: true },
  timed_out: { normal: true, wide: false, noBall: false, freeHit: false },
  retired_out: { normal: true, wide: true, noBall: true, freeHit: true },
  retired_hurt: { normal: true, wide: true, noBall: true, freeHit: true },
  handled_the_ball: { normal: true, wide: true, noBall: true, freeHit: true },
};

export function isWicketAllowed(
  type: WicketType,
  extraType: ExtraType | null,
  wasFreeHit: boolean
): boolean {
  const row = LEGALITY_TABLE[type];
  if (wasFreeHit) return row.freeHit;
  if (extraType === 'wide') return row.wide;
  if (extraType === 'no_ball') return row.noBall;
  return row.normal;
}

/**
 * Player-id-only dismissal text — e.g. `c f1 b b1`. The engine has no player
 * name dictionary (that's a data-layer concern); the UI substitutes real
 * names for these ids when rendering.
 */
export function buildDismissalText(
  type: WicketType,
  bowlerId: PlayerId | null,
  fielderId: PlayerId | null
): string {
  switch (type) {
    case 'bowled':
      return `b ${bowlerId}`;
    case 'caught':
      return fielderId ? `c ${fielderId} b ${bowlerId}` : `c & b ${bowlerId}`;
    case 'lbw':
      return `lbw b ${bowlerId}`;
    case 'stumped':
      return `st ${fielderId} b ${bowlerId}`;
    case 'hit_wicket':
      return `hit wicket b ${bowlerId}`;
    case 'run_out':
      return fielderId ? `run out (${fielderId})` : 'run out';
    case 'obstructing_the_field':
      return 'obstructing the field';
    case 'hit_ball_twice':
      return 'hit the ball twice';
    case 'timed_out':
      return 'timed out';
    case 'retired_out':
      return 'retired out';
    case 'retired_hurt':
      return 'retired hurt';
    case 'handled_the_ball':
      return 'obstructing the field';
    /* v8 ignore next 4 -- unreachable: exhaustiveness-checked by the compiler */
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}
