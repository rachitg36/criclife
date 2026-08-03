import { ballsRemaining, currentRunRate, requiredRuns } from '@/engine';
import type { MatchConfig, MatchState, TeamId } from '@/engine/types';

/**
 * docs/06-AUDIENCE-VIEW.md § 5 — the win-probability heuristic.
 *
 * Deliberately transparent, not a model. Every number below is invented and
 * untuned (same caveat as the rating constants in docs/07 § 2): they are
 * chosen so the curve behaves sensibly at the edges a spectator will actually
 * notice — 3 needed off 12 with 8 wickets should read as near-certain, 60 off
 * 12 should read as near-lost — not because they were fitted to anything.
 * The UI must always label the output "estimate" and expose `explanation`.
 *
 * Pure: no clock, no randomness, no network. Same state in, same number out.
 */

/** Runs per over a "par" first-innings score works out at, by format length. */
const PAR_RATE_ANCHORS: ReadonlyArray<readonly [overs: number, rate: number]> = [
  [5, 10.5],
  [10, 9.5],
  [20, 8.0],
  [50, 5.8],
];

/**
 * Par scoring rate for a format, linearly interpolated between the anchors
 * and flat outside them. A 16-over game sits between the 10- and 20-over
 * anchors rather than being forced into the nearest one.
 */
export function parRunRate(oversPerInnings: number): number {
  const first = PAR_RATE_ANCHORS[0]!;
  const last = PAR_RATE_ANCHORS[PAR_RATE_ANCHORS.length - 1]!;
  if (oversPerInnings <= first[0]) return first[1];
  if (oversPerInnings >= last[0]) return last[1];

  for (let i = 0; i < PAR_RATE_ANCHORS.length - 1; i += 1) {
    const lo = PAR_RATE_ANCHORS[i]!;
    const hi = PAR_RATE_ANCHORS[i + 1]!;
    if (oversPerInnings >= lo[0] && oversPerInnings <= hi[0]) {
      const t = (oversPerInnings - lo[0]) / (hi[0] - lo[0]);
      return lo[1] + t * (hi[1] - lo[1]);
    }
  }
  /* v8 ignore next 2 -- unreachable: the loop covers the whole clamped range */
  return last[1];
}

/** How much harder a side scores with wickets in hand. 1.0 = exactly par. */
function wicketMultiplier(wicketResource: number): number {
  return 0.55 + 0.75 * wicketResource;
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Weight on the gap between what they can score and what they need, per run/over. */
const K_RATE = 0.55;
/** Weight on how much of the innings (balls × wickets) is still in the bank. */
const K_RESOURCE = 0.6;
/** Weight on the batting side's rate versus par, in an unfinished first innings. */
const K_PAR = 0.42;

export type WinProbabilityMode =
  /** Second innings (or a super over) — a real chase with a target. */
  | 'chase'
  /** First innings — no target exists yet, so this is a par comparison. */
  | 'par'
  /** The match is decided; nothing is being estimated. */
  | 'settled'
  /** Not enough has happened to say anything honest. */
  | 'unknown';

export type WinProbability = {
  mode: WinProbabilityMode;
  /** 0–1, the *batting* side's chance. `null` when mode is `unknown`. */
  battingTeamProbability: number | null;
  battingTeamId: TeamId | null;
  bowlingTeamId: TeamId | null;
  /** Plain-English inputs for the tooltip. docs/06 § 5: "always explains". */
  explanation: string;
};

export const UNKNOWN_WIN_PROBABILITY: WinProbability = {
  mode: 'unknown',
  battingTeamProbability: null,
  battingTeamId: null,
  bowlingTeamId: null,
  explanation: 'Not enough of the match has been played to estimate anything yet.',
};

function fmt(n: number): string {
  return n.toFixed(2);
}

export function computeWinProbability(state: MatchState, config: MatchConfig): WinProbability {
  if (state.result) {
    const winner = state.result.winnerTeamId;
    const innings = state.innings[state.currentInningsIndex];
    const battingTeamId = innings?.battingTeamId ?? null;
    return {
      mode: 'settled',
      battingTeamProbability: winner === null ? 0.5 : winner === battingTeamId ? 1 : 0,
      battingTeamId,
      bowlingTeamId: innings?.bowlingTeamId ?? null,
      explanation: state.result.text,
    };
  }

  const innings = state.innings[state.currentInningsIndex];
  if (!innings) return UNKNOWN_WIN_PROBABILITY;

  const { battingTeamId, bowlingTeamId } = innings;
  const wicketsTotal = Math.max(1, config.playersPerSide - 1);
  const wicketsInHand = Math.max(0, wicketsTotal - innings.wickets);
  const wicketResource = wicketsInHand / wicketsTotal;
  const balls = ballsRemaining(innings, config);
  const totalBalls = (innings.revisedOvers ?? config.oversPerInnings) * config.ballsPerOver;
  const ballResource = totalBalls > 0 ? balls / totalBalls : 0;
  const par = parRunRate(innings.revisedOvers ?? config.oversPerInnings);
  const crr = currentRunRate(innings, config);

  const target = innings.revisedTarget ?? innings.target;
  if (target === null) {
    // First innings: no chase exists, so this is explicitly a par comparison,
    // not a win probability. docs/06 § 5.
    if (innings.legalBalls === 0) return UNKNOWN_WIN_PROBABILITY;
    const x = K_PAR * (crr - par) + K_RESOURCE * (wicketResource - 0.5);
    return {
      mode: 'par',
      battingTeamProbability: clampDisplay(logistic(x)),
      battingTeamId,
      bowlingTeamId,
      explanation:
        `Batting first, so this compares them to a par innings rather than a chase. ` +
        `Scoring at ${fmt(crr)} an over against a par rate of ${fmt(par)}, ` +
        `with ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'} in hand.`,
    };
  }

  // `requiredRuns` reads `innings.target` and knows nothing about
  // `revisedTarget` (the engine has no DLS support — docs/04 § 13 leaves it
  // out of v1). Feeding it the resolved target keeps the arithmetic in the
  // engine rather than restating `target - runs` here.
  const need = Math.max(0, requiredRuns({ ...innings, target }) ?? 0);

  if (need <= 0) {
    return {
      mode: 'chase',
      battingTeamProbability: 1,
      battingTeamId,
      bowlingTeamId,
      explanation: 'The target has been passed.',
    };
  }
  if (balls === 0 || wicketsInHand === 0) {
    return {
      mode: 'chase',
      battingTeamProbability: 0,
      battingTeamId,
      bowlingTeamId,
      explanation:
        balls === 0 ? 'No balls left to score them.' : 'No wickets left — the innings is over.',
    };
  }

  const requiredRate = need / (balls / config.ballsPerOver);
  const expectedRate = par * wicketMultiplier(wicketResource);
  const resource = wicketResource * (0.35 + 0.65 * ballResource);
  const x = K_RATE * (expectedRate - requiredRate) + K_RESOURCE * (resource - 0.5);

  return {
    mode: 'chase',
    battingTeamProbability: clampDisplay(logistic(x)),
    battingTeamId,
    bowlingTeamId,
    explanation:
      `Need ${need} off ${balls} ball${balls === 1 ? '' : 's'} — ${fmt(requiredRate)} an over. ` +
      `With ${wicketsInHand} wicket${wicketsInHand === 1 ? '' : 's'} in hand a side like this ` +
      `is expected to manage about ${fmt(expectedRate)}. Estimate only.`,
  };
}

/**
 * Never shows a live match as a certainty. 0% and 100% are reserved for the
 * genuinely decided cases handled above — a bar pinned at 100 while a ball is
 * still to be bowled reads as a claim the heuristic has no business making.
 */
function clampDisplay(p: number): number {
  return Math.min(0.98, Math.max(0.02, p));
}
