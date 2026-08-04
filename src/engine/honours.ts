import type { InningsState, PlayerId } from './types';

/**
 * Who did what worth remembering.
 *
 * Pure, and in the engine on purpose: "the best innings of the match" is a
 * question about the delivery log, not about a screen, and the answer must be
 * identical on the scorer's phone and every spectator's. Two views computing
 * it separately would eventually disagree, and a match where the pad and the
 * public link name different players is worse than one that names nobody.
 *
 * This is deliberately **not** "player of the match" yet. That needs a rule
 * somebody has agreed to and a column to store it in, so it survives being
 * recomputed by a different client version. These are just the standout
 * figures, which need neither.
 */
export type Honour = {
  playerId: PlayerId;
  /** e.g. `64*` or `3-21`. Already formatted — there is one right way. */
  figures: string;
};

export type MatchHonours = {
  /** Most runs in a single innings across the match. */
  topScore: Honour | null;
  /** Best bowling figures: most wickets, fewest runs breaks the tie. */
  bestBowling: Honour | null;
};

/**
 * Super overs are excluded.
 *
 * A one-over innings sets figures that cannot be compared with a twenty-over
 * one — 11 off 4 balls is a fine super over and a poor innings — and putting
 * them in the same ranking makes the honours meaningless in exactly the
 * matches that were most exciting.
 */
export function buildHonours(innings: readonly InningsState[]): MatchHonours {
  const main = innings.filter((i) => !i.isSuperOver);

  let topScore: (Honour & { runs: number }) | null = null;
  let bestBowling: (Honour & { wickets: number; runs: number }) | null = null;

  for (const i of main) {
    for (const [playerId, b] of Object.entries(i.batters)) {
      // Ties go to whoever got there first, which is the earlier innings and
      // then the earlier position — arbitrary, but stable, and stability is
      // what stops the celebration screen flickering between two names.
      if (b.runs > 0 && (!topScore || b.runs > topScore.runs)) {
        topScore = {
          playerId,
          runs: b.runs,
          figures: `${b.runs}${b.status === 'out' ? '' : '*'}`,
        };
      }
    }

    for (const [playerId, b] of Object.entries(i.bowlers)) {
      if (b.wickets === 0) continue;
      const better =
        !bestBowling ||
        b.wickets > bestBowling.wickets ||
        (b.wickets === bestBowling.wickets && b.runsConceded < bestBowling.runs);
      if (better) {
        bestBowling = {
          playerId,
          wickets: b.wickets,
          runs: b.runsConceded,
          figures: `${b.wickets}-${b.runsConceded}`,
        };
      }
    }
  }

  return {
    topScore: topScore ? { playerId: topScore.playerId, figures: topScore.figures } : null,
    bestBowling: bestBowling
      ? { playerId: bestBowling.playerId, figures: bestBowling.figures }
      : null,
  };
}

/**
 * The winning side's players, in the order they batted.
 *
 * `yetToBat` empties as an innings goes on, so the batting order has to come
 * from the batters who actually appeared plus whoever is left — which is what
 * this reconstructs. Used to list the side on the celebration screen: naming
 * eleven people is the part that makes it feel like *their* win rather than a
 * scoreline.
 */
export function winningSidePlayers(
  innings: readonly InningsState[],
  winnerTeamId: string
): PlayerId[] {
  const out: PlayerId[] = [];
  const seen = new Set<PlayerId>();

  for (const i of innings) {
    if (i.battingTeamId !== winnerTeamId) continue;
    const batted = Object.entries(i.batters)
      .sort((a, b) => a[1].position - b[1].position)
      .map(([id]) => id);
    for (const id of [...batted, ...i.yetToBat]) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }

  // A side can win without batting last, and a bowler who never batted still
  // won the match — pick them up from their bowling innings.
  for (const i of innings) {
    if (i.bowlingTeamId !== winnerTeamId) continue;
    for (const id of Object.keys(i.bowlers)) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }

  return out;
}
