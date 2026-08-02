import { applyDelivery, setBowler, setNewBatter } from './applyDelivery';
import type {
  Delivery,
  DeliveryInput,
  InningsState,
  MatchConfig,
  MatchState,
  TeamId,
} from './types';

export type InningsSeed = {
  inningsNo: number;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  isSuperOver?: boolean;
};

function emptyInnings(seed: InningsSeed, target: number | null): InningsState {
  return {
    inningsNo: seed.inningsNo,
    battingTeamId: seed.battingTeamId,
    bowlingTeamId: seed.bowlingTeamId,
    isSuperOver: seed.isSuperOver ?? false,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
    strikerId: null,
    nonStrikerId: null,
    bowlerId: null,
    previousBowlerId: null,
    isFreeHit: false,
    target,
    revisedTarget: null,
    revisedOvers: null,
    batters: {},
    bowlers: {},
    fallOfWickets: [],
    yetToBat: [],
    status: 'in_progress',
    endReason: null,
    currentOver: { bowlerIds: [], runs: 0 },
  };
}

export function createInitialMatchState(matchId: string, config: MatchConfig): MatchState {
  return {
    matchId,
    config,
    status: 'live',
    toss: null,
    innings: [],
    currentInningsIndex: -1,
    result: null,
  };
}

function targetFor(seed: InningsSeed, priorInnings: InningsState[]): number | null {
  // Innings 2 chases innings 1; innings 4 (super over) chases innings 3.
  const previousNo = seed.inningsNo % 2 === 0 ? seed.inningsNo - 1 : null;
  if (previousNo === null) return null;
  const previous = priorInnings.find((i) => i.inningsNo === previousNo);
  return previous ? previous.runs + 1 : null;
}

function ensureInningsStarted(
  state: MatchState,
  delivery: Delivery,
  seeds: InningsSeed[]
): MatchState {
  const existingIndex = state.innings.findIndex((i) => i.inningsNo === delivery.inningsNo);
  if (existingIndex !== -1) {
    if (existingIndex !== state.currentInningsIndex) {
      return { ...state, currentInningsIndex: existingIndex };
    }
    return state;
  }

  const seed = seeds.find((s) => s.inningsNo === delivery.inningsNo);
  if (!seed) throw new Error(`REPLAY: no innings seed for innings ${delivery.inningsNo}`);

  const innings = emptyInnings(seed, targetFor(seed, state.innings));
  const innings2 = state.innings.concat(innings);
  return {
    ...state,
    innings: innings2,
    currentInningsIndex: innings2.length - 1,
    status: seed.isSuperOver ? 'super_over' : 'live',
  };
}

function ensureCrease(state: MatchState, delivery: Delivery): MatchState {
  let next = state;
  const innings = next.innings[next.currentInningsIndex];
  /* v8 ignore next -- unreachable: replay() always calls ensureInningsStarted first */
  if (!innings) throw new Error('REPLAY: no current innings');
  if (innings.strikerId === null) next = setNewBatter(next, delivery.strikerId);
  const inningsAfterStriker = next.innings[next.currentInningsIndex];
  if (inningsAfterStriker && inningsAfterStriker.nonStrikerId === null) {
    next = setNewBatter(next, delivery.nonStrikerId);
  }
  return next;
}

function ensureBowler(state: MatchState, delivery: Delivery): MatchState {
  const innings = state.innings[state.currentInningsIndex];
  /* v8 ignore next -- unreachable: replay() always calls ensureInningsStarted first */
  if (!innings) throw new Error('REPLAY: no current innings');
  if (innings.bowlerId === null) return setBowler(state, delivery.bowlerId);
  return state;
}

function autoExtraFor(config: MatchConfig, delivery: Delivery): number {
  if (delivery.extraType === 'wide') return config.wideRuns;
  if (delivery.extraType === 'no_ball') return config.noBallRuns;
  return 0;
}

/** Reconstructs the `DeliveryInput` that must have produced this persisted row. */
export function deliveryToInput(config: MatchConfig, delivery: Delivery): DeliveryInput {
  const isPenalty = delivery.extraType === 'penalty';
  const auto = autoExtraFor(config, delivery);
  const extraRuns = isPenalty
    ? 0
    : delivery.extraType === 'wide' || delivery.extraType === 'no_ball'
      ? delivery.runsExtras - auto
      : delivery.runsExtras;

  return {
    clientDeliveryId: delivery.clientDeliveryId,
    runsOffBat: delivery.runsBatter,
    extraType: delivery.extraType,
    extraRuns,
    isBoundary: delivery.isBoundaryFour || delivery.isBoundarySix,
    wicket: delivery.isWicket
      ? {
          type: delivery.wicketType!,
          dismissedPlayerId: delivery.dismissedPlayerId!,
          ...(delivery.fielderId ? { fielderId: delivery.fielderId } : {}),
          ...(delivery.assistFielderId ? { assistFielderId: delivery.assistFielderId } : {}),
          ...(delivery.crossedBeforeDismissal !== null
            ? { crossedBeforeDismissal: delivery.crossedBeforeDismissal }
            : {}),
        }
      : null,
    ...(isPenalty ? { penaltyRuns: delivery.runsExtras } : {}),
    commentaryOverride: delivery.commentary,
  };
}

/**
 * Folds an ordered delivery log back into a `MatchState` — the same
 * `applyDelivery` reducer used for live scoring, ball by ball. This is the
 * safety net docs/04-RULES-ENGINE.md §10 describes: undo and edit both work
 * by replaying, never by "reversing" a delivery.
 */
export function replay(
  matchId: string,
  config: MatchConfig,
  deliveries: Delivery[],
  seeds: InningsSeed[]
): MatchState {
  let state = createInitialMatchState(matchId, config);

  for (const delivery of deliveries) {
    state = ensureInningsStarted(state, delivery, seeds);
    state = ensureCrease(state, delivery);
    state = ensureBowler(state, delivery);

    const input = deliveryToInput(config, delivery);
    const result = applyDelivery(state, input);
    if (!result.ok) {
      throw new Error(
        `REPLAY: applyDelivery failed at innings ${delivery.inningsNo} over ${delivery.overNo}.${delivery.ballInOver}: ${result.error}`
      );
    }
    state = result.state;
  }

  return state;
}
