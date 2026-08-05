import type { PadMode } from './store';

/**
 * Which mode the pad should open in, given who is at the crease.
 *
 * Pure and separate from `init` because `init` is four Supabase queries deep
 * and this is the part that was wrong: it asked
 * `strikerId === null || nonStrikerId === null` and called that
 * AWAITING_OPENERS. That condition is true at the start of an innings *and*
 * after every dismissal, so reloading the pad mid-innings asked for both
 * openers again and offered the not-out batter as a candidate.
 *
 * Both ends empty is the start of an innings. One end empty is a wicket.
 */
export function padModeForInnings(innings: {
  status: string;
  strikerId: string | null;
  nonStrikerId: string | null;
  bowlerId: string | null;
}): PadMode {
  if (innings.status === 'completed') return 'INNINGS_BREAK';
  if (innings.strikerId === null && innings.nonStrikerId === null) return 'AWAITING_OPENERS';
  if (innings.strikerId === null || innings.nonStrikerId === null) return 'AWAITING_BATTER';
  if (innings.bowlerId === null) return 'AWAITING_BOWLER';
  return 'READY';
}
