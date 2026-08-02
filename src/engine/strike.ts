/**
 * Strike rotation. docs/04-RULES-ENGINE.md § 6.
 *
 * The single most bug-prone rule in cricket scoring, so every branch here is
 * spelled out rather than folded into a clever expression.
 */

import type { ExtraType, MatchConfig, WicketType } from './types';

export type StrikeInput = {
  extraType: ExtraType | null;
  runsBatter: number;
  /** Total extras on the ball, including the automatic wide/no-ball run. */
  runsExtras: number;
  isBoundaryFour: boolean;
  isBoundarySix: boolean;
  wicketType: WicketType | null;
  /** Run out only. */
  crossedBeforeDismissal: boolean | null;
};

/**
 * How many times the batters physically changed ends.
 *
 * NOTE — a deliberate reading of the spec: the § 6 formula uses `runsBatter`
 * for every case except wide / bye / leg-bye, which means runs *run* off a
 * no-ball (byes taken off a no-ball, which § 4 step 3 folds into `runsExtras`)
 * do not register as crossings. That is what the doc says, so that is what
 * this implements — but it is a spec gap worth closing, because two byes run
 * off a no-ball really do put the batters back where they started while one
 * bye does not. Flagged in the Phase 1 report.
 */
export function runsThatCrossed(input: StrikeInput, config: MatchConfig): number {
  switch (input.extraType) {
    case 'wide':
      // The automatic wide run is a penalty, not a completed run.
      return Math.max(0, input.runsExtras - config.wideRuns);
    case 'bye':
    case 'leg_bye':
      return input.runsExtras;
    case 'penalty':
      // Awarded runs — nobody ran anywhere.
      return 0;
    default:
      return input.runsBatter;
  }
}

/**
 * Does the strike change as a result of this ball, before the end-of-over
 * swap (which is applied separately, in step 10)?
 */
export function resolveStrikeSwap(input: StrikeInput, config: MatchConfig): boolean {
  const crossed = runsThatCrossed(input, config);

  // 1. Odd numbers of completed runs change ends.
  let swap = crossed % 2 === 1;

  // 2. Boundaries never change ends. 4 and 6 are even anyway — this is
  //    belt-and-braces for an all-run 4 being mislabelled as a boundary.
  if (input.isBoundaryFour || input.isBoundarySix) swap = false;

  // 3. A run out is decided by whether they crossed, not by parity alone.
  if (input.wicketType === 'run_out') {
    swap = (crossed + (input.crossedBeforeDismissal ? 1 : 0)) % 2 === 1;
    return swap;
  }

  // 4. Any other dismissal: the incoming batter takes the striker's end, so
  //    the ends must not rotate underneath them. docs/04 § 6 note 4, and the
  //    current Laws (the new batter faces regardless of crossing).
  if (input.wicketType !== null && input.wicketType !== 'retired_hurt') {
    return false;
  }

  return swap;
}

/**
 * Last-man-standing (docs/04 § 6): one batter left, batting alone. Odd runs
 * would strand them at the wrong end, so the engine keeps them on strike and
 * suppresses the end-of-over swap.
 */
export function isLoneBatter(
  config: MatchConfig,
  strikerId: string | null,
  nonStrikerId: string | null
): boolean {
  return config.lastManStanding && (strikerId === null || nonStrikerId === null);
}

/** Swaps two ends, preserving nulls (a null is a slot awaiting a new batter). */
export function swapEnds<T>(striker: T, nonStriker: T): [T, T] {
  return [nonStriker, striker];
}
