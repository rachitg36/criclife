import type { Delivery } from './types';

/**
 * docs/04-RULES-ENGINE.md §11 — themeable phrase pools. Picked deterministically
 * (a small hash of the ball's own idempotency key) rather than `Math.random`,
 * which the engine may not use: same delivery log always replays to the same
 * commentary.
 */
const FOUR_PHRASES = [
  'finds the gap',
  'races away to the fence',
  'timed beautifully',
  'through the covers',
];

const SIX_PHRASES = [
  'into the stands',
  "that's out of the ground",
  'launched down the ground',
  'maximum',
];

function deterministicPick(pool: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const pick = pool[hash % pool.length];
  /* v8 ignore next 2 -- unreachable: FOUR_PHRASES/SIX_PHRASES are hardcoded non-empty */
  if (pick === undefined) throw new Error('INVARIANT: empty phrase pool');
  return pick;
}

function pluralise(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function wicketCommentary(d: Delivery): string {
  const base = `${d.bowlerId} to ${d.strikerId}`;
  switch (d.wicketType) {
    case 'bowled':
      return `${base}, BOWLED HIM! ${d.dismissedPlayerId} b ${d.bowlerId}`;
    case 'caught':
      return `${base}, CAUGHT! ${d.fielderId ? `c ${d.fielderId} b ${d.bowlerId}` : `c & b ${d.bowlerId}`}`;
    case 'lbw':
      return `${base}, LBW!`;
    case 'hit_wicket':
      return `${base}, HIT WICKET!`;
    case 'run_out':
      return `${base}, RUN OUT! ${d.dismissedPlayerId} run out${d.fielderId ? ` (${d.fielderId})` : ''}`;
    case 'stumped':
      return `${base}, STUMPED! st ${d.fielderId} b ${d.bowlerId}`;
    case 'obstructing_the_field':
    case 'handled_the_ball':
      return `${base}, OBSTRUCTING THE FIELD! ${d.dismissedPlayerId} given out`;
    case 'hit_ball_twice':
      return `${base}, OUT! ${d.dismissedPlayerId} hit the ball twice`;
    case 'timed_out':
      return `${d.dismissedPlayerId} timed out`;
    case 'retired_out':
      return `${d.dismissedPlayerId} retires, out`;
    case 'retired_hurt':
      return `${d.dismissedPlayerId} retires hurt`;
    /* v8 ignore next 2 -- unreachable: the cases above already cover every WicketType */
    default:
      return `${base}, WICKET!`;
  }
}

/**
 * `milestone` is passed in rather than read off `Delivery` because it's a
 * fact about the batter's innings total (computed in `applyDelivery`), not
 * about the ball itself.
 */
export function generateCommentary(d: Delivery, milestone?: 'fifty' | 'hundred'): string {
  let line: string;

  if (d.isWicket && d.wicketType) {
    line = wicketCommentary(d);
  } else if (d.extraType === 'wide') {
    line = `${d.bowlerId} to ${d.strikerId}, wide`;
  } else if (d.extraType === 'no_ball') {
    const runsNote = d.runsBatter > 0 ? `, ${pluralise(d.runsBatter, 'run')}` : '';
    line = `${d.bowlerId} to ${d.strikerId}, NO BALL${runsNote}`;
  } else if (d.extraType === 'bye') {
    line = `${d.bowlerId} to ${d.strikerId}, ${pluralise(d.runsExtras, 'bye')}`;
  } else if (d.extraType === 'leg_bye') {
    line = `${d.bowlerId} to ${d.strikerId}, ${pluralise(d.runsExtras, 'leg bye')}`;
  } else if (d.isBoundarySix) {
    line = `${d.bowlerId} to ${d.strikerId}, SIX! ${deterministicPick(SIX_PHRASES, d.clientDeliveryId)}`;
  } else if (d.isBoundaryFour) {
    line = `${d.bowlerId} to ${d.strikerId}, FOUR! ${deterministicPick(FOUR_PHRASES, d.clientDeliveryId)}`;
  } else if (d.runsBatter === 0) {
    line = `${d.bowlerId} to ${d.strikerId}, no run`;
  } else {
    line = `${d.bowlerId} to ${d.strikerId}, ${pluralise(d.runsBatter, 'run')}`;
  }

  if (milestone === 'fifty') line += ` — that's a fifty for ${d.strikerId}!`;
  if (milestone === 'hundred') line += ` — a hundred for ${d.strikerId}!`;

  return line;
}
