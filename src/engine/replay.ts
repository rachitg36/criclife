import { applyDelivery, setBowler, setNewBatter } from './applyDelivery';
import type {
  Delivery,
  DeliveryInput,
  EngineResult,
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

/**
 * Appends the innings a seed describes and makes it current. Shared by
 * `replay`'s up-front pass and `ensureInningsStarted`'s per-delivery one so
 * the two can never build an innings differently.
 */
function startSeededInnings(state: MatchState, seed: InningsSeed): MatchState {
  const existingIndex = state.innings.findIndex((i) => i.inningsNo === seed.inningsNo);
  if (existingIndex !== -1) {
    return existingIndex === state.currentInningsIndex
      ? state
      : { ...state, currentInningsIndex: existingIndex };
  }

  const innings = state.innings.concat(emptyInnings(seed, targetFor(seed, state.innings)));
  return {
    ...state,
    innings,
    currentInningsIndex: innings.length - 1,
    status: seed.isSuperOver ? 'super_over' : 'live',
  };
}

function ensureInningsStarted(
  state: MatchState,
  delivery: Delivery,
  seeds: InningsSeed[]
): MatchState {
  const seed = seeds.find((s) => s.inningsNo === delivery.inningsNo);
  if (!seed) throw new Error(`REPLAY: no innings seed for innings ${delivery.inningsNo}`);
  return startSeededInnings(state, seed);
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
 * One step of a replay: brings the innings, the crease and the bowler up to
 * what this persisted row implies, then applies it.
 *
 * `replay` is a fold over this. It is exported separately because a consumer
 * that receives the log one row at a time — the audience view, which gets
 * balls over Realtime — must not re-fold the whole innings on every delivery
 * just to add one ball, and must be able to see the `EngineEvent[]` the ball
 * produced (milestones, over completion, the result) rather than only the
 * resulting state.
 */
export function applyLoggedDelivery(
  state: MatchState,
  delivery: Delivery,
  seeds: InningsSeed[]
): EngineResult {
  let next = ensureInningsStarted(state, delivery, seeds);
  next = ensureCrease(next, delivery);
  next = ensureBowler(next, delivery);
  return applyDelivery(next, deliveryToInput(next.config, delivery));
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
    const result = applyLoggedDelivery(state, delivery, seeds);
    if (!result.ok) {
      throw new Error(
        `REPLAY: applyDelivery failed at innings ${delivery.inningsNo} over ${delivery.overNo}.${delivery.ballInOver}: ${result.error}`
      );
    }
    state = result.state;
  }

  // Any innings that exists in the database but has no deliveries yet.
  //
  // Creation used to be entirely lazy, inside `ensureInningsStarted`, which
  // only runs per delivery — so an innings started but not yet bowled at came
  // back as `innings: []`. That is not an edge case, it is *every match*
  // between `start_innings` and the first ball. The scorer pad reads
  // `innings[currentInningsIndex]` to decide what to show, found nothing, and
  // reported the innings as not started; pressing "Start the innings" again
  // inserted nothing new and changed nothing. A brand-new match could not be
  // scored at all.
  //
  // It happens *after* the fold, not before, and the fixtures are what said
  // so: `targetFor` reads the previous innings' runs, which are zero until its
  // deliveries have been applied. Seeding innings 2 up front gave it a target
  // of 1, so it ended on the first scoring shot.
  for (const seed of [...seeds].sort((a, b) => a.inningsNo - b.inningsNo)) {
    if (!state.innings.some((i) => i.inningsNo === seed.inningsNo)) {
      state = startSeededInnings(state, seed);
    }
  }

  return state;
}
