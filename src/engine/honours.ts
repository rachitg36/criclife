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
 * `playerOfTheMatch` below is the same idea taken further, and carries its own
 * warning: unlike the figures here, it is a judgement, and the rule behind it
 * is ours rather than anybody's official one.
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

/* ── Player of the match ─────────────────────────────────────────────────
 *
 * **There is no ICC rule to follow, and this is not one.** Checked against the
 * playing conditions and the Laws on 2026-08-05: neither defines the award. In
 * international cricket it is decided *subjectively* after the game by a panel
 * — typically the match referee, the two on-field umpires and the broadcast
 * commentators — with no points system, no algorithm, and no requirement that
 * the winner come from the winning side. Players on losing teams win it
 * regularly.
 *
 * So this is CricLife's own arithmetic, and every screen that shows it must
 * say so. A club that disagrees with the pick is not finding a bug; they are
 * disagreeing with weights, which is a conversation worth being able to have
 * honestly rather than hiding behind "the ICC says".
 *
 * The weights below are deliberately plain and few. A more elaborate model
 * would not be more correct — it would only be harder to argue with.
 */

/** A wicket is worth roughly this many runs of impact. Twenty is the usual
    rule-of-thumb "cost" of a wicket in a limited-overs innings. */
const RUNS_PER_WICKET = 20;
/** Runs saved or leaked against the match's own scoring rate, per over. */
const ECONOMY_WEIGHT = 1;
/** A catch or a run-out. Modest on purpose: fielding decides fewer matches
    than the other two, and over-weighting it produces odd winners. */
const CATCH_VALUE = 8;
const STUMPING_VALUE = 10;

export type ImpactScore = {
  playerId: PlayerId;
  /** CricLife's own number. Not an official statistic. */
  points: number;
  /** Plain-language reason, so the pick can be argued with rather than
      simply disbelieved. */
  summary: string;
};

/**
 * The player whose match this was, by CricLife's arithmetic.
 *
 * Batting is scored on runs, adjusted for whether they came faster or slower
 * than the match was scoring generally — 30 off 15 in a low-scoring game is
 * worth more than 30 off 40. Bowling is scored on wickets plus runs saved
 * against that same match rate. Fielding adds a little.
 *
 * Ties break towards the winning side. That matches what human adjudicators
 * do overwhelmingly often, and unlike the rest of this it is a convention
 * rather than a measurement.
 */
export function playerOfTheMatch(
  innings: readonly InningsState[],
  winnerTeamId: string | null
): ImpactScore | null {
  const main = innings.filter((i) => !i.isSuperOver);
  if (main.length === 0) return null;

  const totalRuns = main.reduce((sum, i) => sum + i.runs, 0);
  const totalBalls = main.reduce((sum, i) => sum + i.legalBalls, 0);
  if (totalBalls === 0) return null;
  const matchRunsPerBall = totalRuns / totalBalls;

  const points = new Map<PlayerId, number>();
  const parts = new Map<PlayerId, string[]>();
  const side = new Map<PlayerId, string>();
  const add = (id: PlayerId, n: number, note: string | null, teamId: string) => {
    points.set(id, (points.get(id) ?? 0) + n);
    if (note) parts.set(id, [...(parts.get(id) ?? []), note]);
    side.set(id, teamId);
  };

  for (const i of main) {
    for (const [id, b] of Object.entries(i.batters)) {
      if (b.balls === 0 && b.runs === 0) continue;
      // Runs, plus credit for the tempo they came at. A batter who scored at
      // the match's own rate gets exactly their runs and nothing more.
      const tempo = b.runs - matchRunsPerBall * b.balls;
      add(id, b.runs + tempo, `${b.runs}${b.status === 'out' ? '' : '*'}`, i.battingTeamId);
    }

    for (const [id, b] of Object.entries(i.bowlers)) {
      if (b.legalBalls === 0) continue;
      const expected = matchRunsPerBall * b.legalBalls;
      const saved = (expected - b.runsConceded) * ECONOMY_WEIGHT;
      const value = b.wickets * RUNS_PER_WICKET + saved;
      add(id, value, b.wickets > 0 ? `${b.wickets}-${b.runsConceded}` : null, i.bowlingTeamId);
    }

    // Fielding, read off the dismissals themselves — the engine has no
    // separate fielding tally and does not need one.
    for (const b of Object.values(i.batters)) {
      const d = b.dismissal;
      if (!d?.fielderId) continue;
      if (d.type === 'caught') add(d.fielderId, CATCH_VALUE, null, i.bowlingTeamId);
      else if (d.type === 'stumped') add(d.fielderId, STUMPING_VALUE, null, i.bowlingTeamId);
      else if (d.type === 'run_out') add(d.fielderId, CATCH_VALUE, null, i.bowlingTeamId);
    }
  }

  let best: ImpactScore | null = null;
  let bestOnWinner = false;
  for (const [playerId, raw] of points) {
    const onWinner = winnerTeamId !== null && side.get(playerId) === winnerTeamId;
    const better =
      !best ||
      raw > best.points + 0.001 ||
      // Within a whisker: the winning side takes it. A convention, not a
      // measurement, and the one place this deliberately is not arithmetic.
      (Math.abs(raw - best.points) <= 0.001 && onWinner && !bestOnWinner);
    if (better) {
      const notes = parts.get(playerId) ?? [];
      best = {
        playerId,
        points: Math.round(raw * 10) / 10,
        summary: notes.join(' · ') || 'in the field',
      };
      bestOnWinner = onWinner;
    }
  }
  return best;
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
