/**
 * Auto-generated ball-by-ball commentary. docs/04-RULES-ENGINE.md § 11.
 *
 * § 11 asks for a "random" phrase on a four or a six. The engine may not be
 * random — it must replay byte-identically, and ESLint bans `Math.random()`.
 * So the phrase is chosen by hashing the delivery's own `clientDeliveryId`:
 * varied across balls, identical on every replay of the same ball.
 *
 * Player names are passed in rather than looked up — the engine performs no
 * I/O. Unknown ids fall back to the id itself, which is ugly but never throws.
 */

import type { Delivery, PlayerId } from './types';

export type NameLookup = Record<PlayerId, string>;

const FOUR_PHRASES = [
  'threaded through the gap',
  'beautifully timed',
  'races away to the rope',
  'no chance for the fielder',
  'pierced the infield',
  'placed with real care',
] as const;

const SIX_PHRASES = [
  'into the crowd!',
  'that is enormous!',
  'clean out of the middle',
  'never in doubt, all the way',
  'launched over the ropes',
  'a proper hit, that',
] as const;

/** FNV-1a. Small, fast, and — the point here — deterministic. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(pool: readonly T[], seed: string): T {
  // Non-empty pools only; the `!` is safe because the modulo is in range.
  return pool[hash(seed) % pool.length]!;
}

function nameOf(id: PlayerId | null, names: NameLookup): string {
  if (id === null) return 'unknown';
  return names[id] ?? id;
}

/**
 * One line for the audience feed. The scorer can override it, in which case
 * `delivery.commentary` already holds their text and this is not called.
 */
export function generateCommentary(
  delivery: Delivery,
  names: NameLookup = {},
  opts: { batterRuns?: number; batterBalls?: number } = {}
): string {
  const bowler = nameOf(delivery.bowlerId, names);
  const striker = nameOf(delivery.strikerId, names);
  const head = `${bowler} to ${striker}, `;
  const card =
    opts.batterRuns !== undefined && opts.batterBalls !== undefined
      ? ` ${opts.batterRuns}(${opts.batterBalls})`
      : '';

  if (delivery.isWicket && delivery.wicketType !== null) {
    const fielder = nameOf(delivery.fielderId, names);
    const dismissed = nameOf(delivery.dismissedPlayerId, names);

    switch (delivery.wicketType) {
      case 'bowled':
        return `${head}BOWLED HIM! ${striker} b ${bowler}${card}`;
      case 'caught':
        return `${head}CAUGHT! c ${fielder} b ${bowler}${card}`;
      case 'lbw':
        return `${head}LBW!${card}`;
      case 'stumped':
        return `${head}STUMPED! st ${fielder} b ${bowler}`;
      case 'run_out':
        return `${head}RUN OUT! ${dismissed} run out (${fielder})`;
      case 'hit_wicket':
        return `${head}HIT WICKET! ${striker} hit wicket b ${bowler}${card}`;
      case 'retired_hurt':
        return `${dismissed} retires hurt`;
      case 'retired_out':
        return `${dismissed} retires out`;
      case 'timed_out':
        return `${dismissed} is timed out`;
      case 'obstructing_the_field':
      case 'handled_the_ball':
        return `${head}OUT! ${dismissed} obstructing the field`;
      case 'hit_ball_twice':
        return `${head}OUT! ${dismissed} hit the ball twice`;
    }
  }

  switch (delivery.extraType) {
    case 'wide': {
      const extra = delivery.runsExtras > 1 ? `, ${delivery.runsExtras} runs` : '';
      return `${head}wide${extra}`;
    }
    case 'no_ball': {
      const total = delivery.runsTotal;
      return `${head}NO BALL${total > 1 ? `, ${total} runs` : ''}`;
    }
    case 'bye':
      return `${head}${delivery.runsExtras} bye${delivery.runsExtras === 1 ? '' : 's'}`;
    case 'leg_bye':
      return `${head}${delivery.runsExtras} leg bye${delivery.runsExtras === 1 ? '' : 's'}`;
    case 'penalty':
      return `${delivery.runsExtras} penalty run${delivery.runsExtras === 1 ? '' : 's'}`;
    case null:
      break;
  }

  if (delivery.isBoundarySix) {
    return `${head}SIX! ${pick(SIX_PHRASES, delivery.clientDeliveryId)}`;
  }
  if (delivery.isBoundaryFour) {
    return `${head}FOUR! ${pick(FOUR_PHRASES, delivery.clientDeliveryId)}`;
  }
  if (delivery.runsBatter === 0) {
    return `${head}no run`;
  }
  return `${head}${delivery.runsBatter} run${delivery.runsBatter === 1 ? '' : 's'}`;
}

/** Milestone suffixes appended to the feed line. docs/04 § 11. */
export function milestoneText(runs: 50 | 100 | 150 | 200, batter: string): string {
  if (runs === 100) return `That's a hundred for ${batter}!`;
  return `That's a ${runs} for ${batter}!`;
}

export function maidenText(): string {
  return 'MAIDEN over';
}
