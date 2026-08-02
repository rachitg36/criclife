import { applyDelivery, setBowler, setNewBatter } from '../../../src/engine/applyDelivery';
import { createInitialMatchState } from '../../../src/engine/replay';
import type {
  Delivery,
  DeliveryInput,
  MatchConfig,
  MatchState,
  PlayerId,
  WicketType,
} from '../../../src/engine/types';

/**
 * Deterministic PRNG (mulberry32) — fixed seed, reproducible every run. This
 * is test-only generator code, not engine code, so it's exempt from the
 * engine's no-`Math.random` purity rule.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WICKET_TYPES: WicketType[] = ['bowled', 'caught', 'lbw', 'caught', 'bowled'];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  const item = arr[Math.floor(rng() * arr.length)];
  if (item === undefined) throw new Error('generate: empty array');
  return item;
}

function rosterFor(teamPrefix: string, n: number): PlayerId[] {
  return Array.from({ length: n }, (_, i) => `${teamPrefix}${i + 1}`);
}

/** Plays a single innings to completion (all out or overs complete), deterministically. */
function playInnings(
  state: MatchState,
  rng: () => number,
  battingRoster: PlayerId[],
  bowlingRoster: PlayerId[]
): { state: MatchState; deliveries: Delivery[] } {
  const deliveries: Delivery[] = [];
  let batterIndex = 2;
  let clientId = 0;

  for (;;) {
    let innings = state.innings[state.currentInningsIndex];
    if (!innings || innings.status !== 'in_progress') break;

    if (innings.strikerId === null || innings.nonStrikerId === null) {
      if (batterIndex >= battingRoster.length) break;
      state = setNewBatter(state, battingRoster[batterIndex]!);
      batterIndex += 1;
      innings = state.innings[state.currentInningsIndex]!;
    }
    if (innings.bowlerId === null) {
      const eligible = bowlingRoster.filter((b) => b !== innings!.previousBowlerId);
      state = setBowler(state, pick(rng, eligible));
      innings = state.innings[state.currentInningsIndex]!;
    }

    clientId += 1;
    const roll = rng();
    let input: DeliveryInput;

    if (roll < 0.03) {
      input = {
        clientDeliveryId: `gen-${clientId}`,
        runsOffBat: 0,
        extraType: 'wide',
        extraRuns: pick(rng, [0, 0, 0, 1]),
        isBoundary: false,
        wicket: null,
      };
    } else if (roll < 0.06) {
      const runsOffBat = pick(rng, [0, 1, 4] as const);
      input = {
        clientDeliveryId: `gen-${clientId}`,
        runsOffBat,
        extraType: 'no_ball',
        extraRuns: 0,
        isBoundary: runsOffBat === 4,
        wicket: null,
      };
    } else if (roll < 0.08) {
      input = {
        clientDeliveryId: `gen-${clientId}`,
        runsOffBat: 0,
        extraType: 'leg_bye',
        extraRuns: pick(rng, [1, 1, 2, 4]),
        isBoundary: false,
        wicket: null,
      };
    } else if (roll < 0.11 && !innings.isFreeHit) {
      input = {
        clientDeliveryId: `gen-${clientId}`,
        runsOffBat: 0,
        extraType: null,
        extraRuns: 0,
        isBoundary: false,
        wicket: { type: pick(rng, WICKET_TYPES), dismissedPlayerId: innings.strikerId! },
      };
    } else {
      const runsOffBat = pick(rng, [0, 0, 0, 1, 1, 1, 2, 4, 6] as const);
      input = {
        clientDeliveryId: `gen-${clientId}`,
        runsOffBat,
        extraType: null,
        extraRuns: 0,
        isBoundary: runsOffBat === 4 || runsOffBat === 6,
        wicket: null,
      };
    }

    const result = applyDelivery(state, input);
    if (!result.ok) continue; // bowler-limit collisions etc — just try a different ball
    state = result.state;
    deliveries.push(result.delivery);
  }

  return { state, deliveries };
}

export type GeneratedMatch = {
  state: MatchState;
  deliveries: Delivery[];
  seeds: { inningsNo: number; battingTeamId: string; bowlingTeamId: string }[];
};

/** Generates a full, two-innings deterministic match for the given config. */
export function generateMatch(
  matchId: string,
  config: MatchConfig,
  rngSeed: number,
  playersPerSide = config.playersPerSide
): GeneratedMatch {
  const rng = mulberry32(rngSeed);
  const teamA = rosterFor('a', playersPerSide);
  const teamB = rosterFor('b', playersPerSide);

  let state = createInitialMatchState(matchId, config);
  state = {
    ...state,
    innings: [
      {
        inningsNo: 1,
        battingTeamId: 'teamA',
        bowlingTeamId: 'teamB',
        isSuperOver: false,
        runs: 0,
        wickets: 0,
        legalBalls: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        strikerId: null,
        nonStrikerId: null,
        bowlerId: null,
        previousBowlerId: null,
        isFreeHit: false,
        target: null,
        revisedTarget: null,
        revisedOvers: null,
        batters: {},
        bowlers: {},
        fallOfWickets: [],
        yetToBat: [],
        status: 'in_progress',
        endReason: null,
        currentOver: { bowlerIds: [], runs: 0 },
      },
    ],
    currentInningsIndex: 0,
  };
  state = setNewBatter(state, teamA[0]!);
  state = setNewBatter(state, teamA[1]!);
  state = setBowler(state, pick(rng, teamB));

  const first = playInnings(state, rng, teamA, teamB);
  state = first.state;
  const deliveries = [...first.deliveries];

  const innings1 = state.innings[0]!;
  state = {
    ...state,
    innings: [
      ...state.innings,
      {
        inningsNo: 2,
        battingTeamId: 'teamB',
        bowlingTeamId: 'teamA',
        isSuperOver: false,
        runs: 0,
        wickets: 0,
        legalBalls: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        strikerId: null,
        nonStrikerId: null,
        bowlerId: null,
        previousBowlerId: null,
        isFreeHit: false,
        target: innings1.runs + 1,
        revisedTarget: null,
        revisedOvers: null,
        batters: {},
        bowlers: {},
        fallOfWickets: [],
        yetToBat: [],
        status: 'in_progress',
        endReason: null,
        currentOver: { bowlerIds: [], runs: 0 },
      },
    ],
    currentInningsIndex: 1,
  };
  state = setNewBatter(state, teamB[0]!);
  state = setNewBatter(state, teamB[1]!);
  state = setBowler(state, pick(rng, teamA));

  const second = playInnings(state, rng, teamB, teamA);
  state = second.state;
  deliveries.push(...second.deliveries);

  return {
    state,
    deliveries,
    seeds: [
      { inningsNo: 1, battingTeamId: 'teamA', bowlingTeamId: 'teamB' },
      { inningsNo: 2, battingTeamId: 'teamB', bowlingTeamId: 'teamA' },
    ],
  };
}
