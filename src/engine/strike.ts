import type { ExtraType, MatchConfig, PlayerId } from './types';

export type StrikeDeliveryFacts = {
  extraType: ExtraType | null;
  runsBatter: number;
  runsExtras: number;
  isBoundaryFour: boolean;
  isBoundarySix: boolean;
  wicketType: 'run_out' | null;
};

/**
 * docs/04-RULES-ENGINE.md §6. Runs out how many times the batters actually
 * crossed — a bye/leg-bye is run just like a batted run, a wide's automatic
 * run never sends anyone anywhere (only runs *beyond* the auto wide-run do).
 */
function runsThatCrossed(d: StrikeDeliveryFacts, cfg: MatchConfig): number {
  if (d.extraType === 'wide') return Math.max(0, d.runsExtras - cfg.wideRuns);
  if (d.extraType === 'bye' || d.extraType === 'leg_bye') return d.runsExtras;
  return d.runsBatter;
}

export function shouldSwapOnRuns(d: StrikeDeliveryFacts, cfg: MatchConfig): boolean {
  if (d.isBoundaryFour || d.isBoundarySix) return false;
  return runsThatCrossed(d, cfg) % 2 === 1;
}

/**
 * A run out leaves one end vacant for a new batter. Model each batter as
 * running back and forth between "end A" (the striker's end going into this
 * ball) and "end B": every completed run swaps who's where, and if the fatal
 * run had the batters cross before the stumps broke, that half-completed run
 * counts as one more swap too. Whichever original batter (by that reckoning)
 * ends up at the dismissed player's end is who's gone — the other end is
 * simply left `null`, for `setNewBatter` to fill in later (step 11).
 */
export function resolveRunOutEnds(
  strikerId: PlayerId,
  nonStrikerId: PlayerId,
  dismissedPlayerId: PlayerId,
  completedRuns: number,
  crossedBeforeDismissal: boolean
): { strikerId: PlayerId | null; nonStrikerId: PlayerId | null } {
  const parity = (completedRuns + (crossedBeforeDismissal ? 1 : 0)) % 2;
  let endA: PlayerId | null = parity === 0 ? strikerId : nonStrikerId;
  let endB: PlayerId | null = parity === 0 ? nonStrikerId : strikerId;

  if (endA === dismissedPlayerId) {
    endA = null;
  } else {
    endB = null;
  }

  return { strikerId: endA, nonStrikerId: endB };
}
