/**
 * Dismissal legality and credit. docs/04-RULES-ENGINE.md § 5.
 *
 * The free-hit rule is the one scoring apps get wrong: on a free hit the only
 * ways out are run out, obstructing the field, and hit-the-ball-twice. The pad
 * must physically disable the rest — never rely on the scorer knowing this.
 */

import type { ExtraType, WicketType } from './types';

/** Wicket types legal on a normal (non-free-hit, no-extra) delivery. */
const ON_NORMAL: readonly WicketType[] = [
  'bowled',
  'caught',
  'lbw',
  'stumped',
  'hit_wicket',
  'run_out',
  'obstructing_the_field',
  'handled_the_ball',
  'hit_ball_twice',
  'timed_out',
  'retired_out',
  'retired_hurt',
];

/** § 5.2 "Wide" column. A batter can still be stumped or run out off a wide. */
const ON_WIDE: readonly WicketType[] = [
  'stumped',
  'run_out',
  'obstructing_the_field',
  'handled_the_ball',
  'retired_out',
  'retired_hurt',
];

/** § 5.2 "No-ball" column. Nothing bowler-credited can happen off a no-ball. */
const ON_NO_BALL: readonly WicketType[] = [
  'run_out',
  'obstructing_the_field',
  'handled_the_ball',
  'hit_ball_twice',
  'retired_out',
  'retired_hurt',
];

/** § 5.2 "Free hit" column — the strict one. */
const ON_FREE_HIT: readonly WicketType[] = [
  'run_out',
  'obstructing_the_field',
  'handled_the_ball',
  'hit_ball_twice',
  'retired_out',
  'retired_hurt',
];

/**
 * Byes and leg-byes are legal deliveries — the ball counted, it just missed
 * the bat. Every dismissal available on a normal ball is available here, with
 * the exception of those that require bat contact, which the scorer would not
 * be recording as a bye in the first place.
 */
const ON_BYE: readonly WicketType[] = [
  'bowled',
  'stumped',
  'hit_wicket',
  'run_out',
  'obstructing_the_field',
  'handled_the_ball',
  'timed_out',
  'retired_out',
  'retired_hurt',
];

function allowedForExtra(extraType: ExtraType | null): readonly WicketType[] {
  switch (extraType) {
    case 'wide':
      return ON_WIDE;
    case 'no_ball':
      return ON_NO_BALL;
    case 'bye':
    case 'leg_bye':
      return ON_BYE;
    case 'penalty':
      // A penalty is an award, not a ball. Only administrative exits apply.
      return ['retired_out', 'retired_hurt'];
    case null:
      return ON_NORMAL;
  }
}

/**
 * Both constraints apply. A free hit that is also a wide is bound by *each*
 * column: run out and obstructing survive the intersection, hit-the-ball-twice
 * does not (the wide column excludes it). The docs give the two columns
 * independently and never state a precedence, so the engine takes the
 * conservative reading — the scorer can always record the ball without the
 * wicket, which loses no data.
 */
export function isWicketAllowed(
  type: WicketType,
  extraType: ExtraType | null,
  wasFreeHit: boolean
): boolean {
  if (!allowedForExtra(extraType).includes(type)) return false;
  if (wasFreeHit && !ON_FREE_HIT.includes(type)) return false;
  return true;
}

/** § 5.1 — is the wicket credited to the bowler's figures? */
export function isBowlerCredited(type: WicketType): boolean {
  switch (type) {
    case 'bowled':
    case 'caught':
    case 'lbw':
    case 'stumped':
    case 'hit_wicket':
      return true;
    default:
      return false;
  }
}

/**
 * § 5.1 — `retired_hurt` is not a wicket at all. The batter's card shows
 * `retired_hurt` and, if `config.retiredHurtCanReturn`, they rejoin `yetToBat`.
 */
export function countsAsWicket(type: WicketType): boolean {
  return type !== 'retired_hurt';
}

/** Which fielding credit, if any, this dismissal carries. */
export function fielderCreditFor(type: WicketType): 'catch' | 'run_out' | 'stumping' | null {
  switch (type) {
    case 'caught':
      return 'catch';
    case 'run_out':
      return 'run_out';
    case 'stumped':
      return 'stumping';
    default:
      return null;
  }
}

/** § 5.1 — `timed_out` is the only dismissal that does not consume a ball. */
export function consumesBall(type: WicketType): boolean {
  return type !== 'timed_out';
}

/**
 * A run out may remove the non-striker; every other dismissal removes the
 * batter who faced the ball.
 */
export function canDismissNonStriker(type: WicketType): boolean {
  return (
    type === 'run_out' ||
    type === 'obstructing_the_field' ||
    type === 'retired_hurt' ||
    type === 'retired_out'
  );
}
