import type { PlayerId } from '@/engine/types';

/**
 * Who is on strike, who is at the other end, and who is bowling — remembered
 * across a reload, for the one window in which nothing else remembers.
 *
 * The crease is normally implied by the log: every delivery carries
 * `striker_id`, `non_striker_id` and `bowler_id`, so `replay()` reconstructs
 * it exactly. But between `start_innings` and the *first ball* there is no
 * delivery to imply anything, and the `innings` table has no columns for it.
 * So picking the openers and the bowler, navigating away, and coming back put
 * the pad straight back to "Who is on strike?" — reported on 2026-08-04 as
 * "again it is asking me for who is the striker".
 *
 * This is deliberately **local, not a migration**. The authoritative record of
 * who faced a ball is the ball; this only answers "which pickers did I already
 * fill in on this device", which is a UI resumption concern. Adding three
 * columns to `innings` would make a second source of truth for something the
 * delivery log already owns the moment it is non-empty.
 *
 * Restored under one condition only — see `restorableCrease`. Getting that
 * condition wrong would put a dismissed batter back at the crease, which is
 * far worse than asking the question again.
 */
export type CreaseMemo = {
  strikerId: PlayerId | null;
  nonStrikerId: PlayerId | null;
  bowlerId: PlayerId | null;
};

const PREFIX = 'criclife.crease.';

function key(matchId: string, inningsNo: number): string {
  return `${PREFIX}${matchId}:${inningsNo}`;
}

export function rememberCrease(matchId: string, inningsNo: number, memo: CreaseMemo): void {
  try {
    localStorage.setItem(key(matchId, inningsNo), JSON.stringify(memo));
  } catch {
    // Private mode, quota, a browser with storage off — all fine. The cost of
    // failing here is one extra tap, so it must never be the cost of a crash.
  }
}

function readCrease(matchId: string, inningsNo: number): CreaseMemo | null {
  try {
    const raw = localStorage.getItem(key(matchId, inningsNo));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const m = parsed as Record<string, unknown>;
    const id = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
    return {
      strikerId: id(m.strikerId),
      nonStrikerId: id(m.nonStrikerId),
      bowlerId: id(m.bowlerId),
    };
  } catch {
    return null;
  }
}

/**
 * What of a remembered crease may safely be put back.
 *
 * Two guards, and both matter:
 *
 * - **Only before the first ball of the innings.** Once a delivery exists the
 *   log is authoritative, and a null striker then means a *wicket has fallen* —
 *   restoring the memo there would walk the dismissed batter back out to bat.
 * - **Only players still eligible.** The squad can be re-picked between the
 *   memo being written and read. A batter must still be yet to bat; a bowler
 *   must still be in the fielding side.
 *
 * Returns only the fields that pass, so a stale bowler does not cost you the
 * openers as well.
 */
export function restorableCrease(
  memo: CreaseMemo | null,
  opts: {
    hasDeliveries: boolean;
    strikerId: PlayerId | null;
    nonStrikerId: PlayerId | null;
    bowlerId: PlayerId | null;
    yetToBat: readonly PlayerId[];
    bowlingSquad: readonly PlayerId[];
  }
): CreaseMemo {
  const nothing: CreaseMemo = { strikerId: null, nonStrikerId: null, bowlerId: null };
  if (!memo || opts.hasDeliveries) return nothing;

  const batters = new Set(opts.yetToBat);
  const bowlers = new Set(opts.bowlingSquad);

  // Both ends or neither: one restored opener and one prompt is a worse
  // screen than two prompts, because it looks like the app half-remembered
  // and invites the scorer to trust it.
  const pairOk =
    opts.strikerId === null &&
    opts.nonStrikerId === null &&
    memo.strikerId !== null &&
    memo.nonStrikerId !== null &&
    memo.strikerId !== memo.nonStrikerId &&
    batters.has(memo.strikerId) &&
    batters.has(memo.nonStrikerId);

  const bowlerOk = opts.bowlerId === null && memo.bowlerId !== null && bowlers.has(memo.bowlerId);

  return {
    strikerId: pairOk ? memo.strikerId : null,
    nonStrikerId: pairOk ? memo.nonStrikerId : null,
    bowlerId: bowlerOk ? memo.bowlerId : null,
  };
}

/** Convenience for the store: read and filter in one step. */
export function loadRestorableCrease(
  matchId: string,
  inningsNo: number,
  opts: Parameters<typeof restorableCrease>[1]
): CreaseMemo {
  return restorableCrease(readCrease(matchId, inningsNo), opts);
}
