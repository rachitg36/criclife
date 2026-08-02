/**
 * Test harness for the rules engine.
 *
 * Scoring a match ball by ball in a test is unreadable if every call has to
 * re-supply the crease, the bowler and a uuid. This wrapper fills in the
 * boilerplate — sending in the next batter, rotating the bowler so nobody
 * bowls consecutive overs — and leaves the test to say only what the ball was.
 *
 * Deterministic throughout: ids are counters, never uuids or timestamps.
 */

import {
  applyDelivery,
  createInnings,
  createMatch,
  makeConfig,
  type CreateInningsParams,
  sendInNextBatter,
  setBowler,
  type Delivery,
  type DeliveryInput,
  type EngineEvent,
  type EngineResult,
  type MatchConfig,
  type MatchState,
  type PlayerId,
} from '@/engine';

export const HOME = 'team-home';
export const AWAY = 'team-away';

/** `bat-1 … bat-n`, in batting order. */
export function battingOrder(n = 11, prefix = 'bat'): PlayerId[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);
}

/** `bowl-1 … bowl-n`. */
export function bowlingAttack(n = 5, prefix = 'bowl'): PlayerId[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);
}

export type BallSpec = Partial<Omit<DeliveryInput, 'clientDeliveryId'>>;

export type Harness = {
  state: MatchState;
  deliveries: Delivery[];
  events: EngineEvent[];
  /** Applies a ball, throwing if the engine rejects it. */
  ball(spec?: BallSpec): EngineEvent[];
  /** Applies a ball expecting rejection, returning the failed result. */
  expectReject(spec?: BallSpec): Extract<EngineResult, { ok: false }>;
  /** Raw result, no throwing either way. */
  tryBall(spec?: BallSpec): EngineResult;
  /** Overrides who is on strike (e.g. to test a non-striker run out). */
  setStrike(strikerId: PlayerId): void;
  /** Forces a specific bowler for the next over. */
  useBowler(bowlerId: PlayerId): void;
  /**
   * Swaps the bowler part-way through an over — docs/04 § 8, the injured-bowler
   * case. Both bowlers get partial over credit.
   */
  changeBowlerMidOver(bowlerId: PlayerId): void;
  /**
   * Who will face the next ball, with the crease refilled first.
   *
   * Reading `innings(state).strikerId` directly is a trap: immediately after
   * a wicket that end is null until the next ball's `prepare()` runs, so a
   * test that grabs the striker before calling `ball()` gets null and the
   * engine then rejects the delivery with UNKNOWN_PLAYER.
   */
  striker(): PlayerId;
  /** The non-striker, with the crease refilled first. May be null. */
  nonStriker(): PlayerId | null;
  /**
   * Starts the next innings and makes it current. The target defaults to the
   * previous innings' score plus one, which is what a real chase gets.
   */
  startNextInnings(params: {
    battingOrder: PlayerId[];
    bowlers: PlayerId[];
    target?: number | null;
  }): void;
  /** A fresh match in the same starting position — the baseline for replay. */
  initialState(): MatchState;
};

export type HarnessOptions = {
  config?: Partial<MatchConfig>;
  batting?: PlayerId[];
  bowlers?: PlayerId[];
  target?: number | null;
  inningsNo?: number;
  isSuperOver?: boolean;
};

export function harness(options: HarnessOptions = {}): Harness {
  const config = makeConfig(options.config ?? {});
  const batting = options.batting ?? battingOrder(config.playersPerSide);
  const attackInitial =
    options.bowlers ?? bowlingAttack(Math.max(2, Math.ceil(config.oversPerInnings / 2)));
  let attack = attackInitial;

  /**
   * Every innings' creation parameters, so `initialState()` can rebuild the
   * whole match scaffold. A delivery log alone cannot do this — it carries no
   * batting order, target or team ids for an innings that has not started, and
   * in production those live in the `innings` table alongside `deliveries`.
   */
  const inningsSpecs: CreateInningsParams[] = [
    {
      inningsNo: options.inningsNo ?? 1,
      battingTeamId: HOME,
      bowlingTeamId: AWAY,
      battingOrder: batting,
      bowlerId: attackInitial[0] ?? 'bowl-1',
      target: options.target ?? null,
      isSuperOver: options.isSuperOver ?? false,
    },
  ];

  let state = createMatch({
    matchId: 'match-test',
    config,
    innings: inningsSpecs.map(createInnings),
  });
  const deliveries: Delivery[] = [];
  const allEvents: EngineEvent[] = [];
  let counter = 0;
  let bowlerCursor = 0;
  let forcedBowler: PlayerId | null = null;

  /** Fills any empty crease slot and assigns a bowler if the over just ended. */
  function prepare(): void {
    const current = state.innings[state.currentInningsIndex];
    if (!current || current.status !== 'in_progress') return;

    while (
      (current.strikerId === null || current.nonStrikerId === null) &&
      current.yetToBat.length > 0
    ) {
      const nextBatter = current.yetToBat[0];
      if (nextBatter === undefined) break;
      sendInNextBatter(current, nextBatter);
    }

    if (current.bowlerId === null) {
      if (forcedBowler !== null) {
        setBowler(current, forcedBowler);
        forcedBowler = null;
      } else {
        // Rotate, skipping whoever bowled the previous over.
        for (let i = 0; i < attack.length; i++) {
          bowlerCursor = (bowlerCursor + 1) % attack.length;
          const candidate = attack[bowlerCursor];
          if (candidate !== undefined && candidate !== current.previousBowlerId) {
            setBowler(current, candidate);
            break;
          }
        }
      }
    }
  }

  function build(spec: BallSpec): DeliveryInput {
    counter += 1;
    return {
      clientDeliveryId: `d-${counter}`,
      runsOffBat: spec.runsOffBat ?? 0,
      extraType: spec.extraType ?? null,
      extraRuns: spec.extraRuns ?? 0,
      isBoundary: spec.isBoundary ?? false,
      wicket: spec.wicket ?? null,
      ...(spec.penaltyRuns !== undefined ? { penaltyRuns: spec.penaltyRuns } : {}),
      ...(spec.shot !== undefined ? { shot: spec.shot } : {}),
      ...(spec.pitch !== undefined ? { pitch: spec.pitch } : {}),
      ...(spec.commentaryOverride !== undefined
        ? { commentaryOverride: spec.commentaryOverride }
        : {}),
    };
  }

  const api: Harness = {
    get state() {
      return state;
    },
    get deliveries() {
      return deliveries;
    },
    get events() {
      return allEvents;
    },
    tryBall(spec = {}) {
      prepare();
      return applyDelivery(state, build(spec));
    },
    ball(spec = {}) {
      const result = api.tryBall(spec);
      if (!result.ok) {
        throw new Error(`Engine rejected the ball: ${result.error} — ${result.message}`);
      }
      state = result.state;
      deliveries.push(result.delivery);
      allEvents.push(...result.events);
      return result.events;
    },
    expectReject(spec = {}) {
      const result = api.tryBall(spec);
      if (result.ok) {
        throw new Error('Expected the engine to reject this ball, but it was accepted.');
      }
      return result;
    },
    striker() {
      prepare();
      const current = state.innings[state.currentInningsIndex];
      const id = current?.strikerId;
      if (id === null || id === undefined) throw new Error('No striker available');
      return id;
    },
    nonStriker() {
      prepare();
      return state.innings[state.currentInningsIndex]?.nonStrikerId ?? null;
    },
    setStrike(strikerId) {
      const current = state.innings[state.currentInningsIndex];
      if (!current) return;
      if (current.nonStrikerId === strikerId) {
        const s = current.strikerId;
        current.strikerId = strikerId;
        current.nonStrikerId = s;
      }
    },
    useBowler(bowlerId) {
      const current = state.innings[state.currentInningsIndex];
      if (current && current.bowlerId === null) {
        setBowler(current, bowlerId);
      } else {
        forcedBowler = bowlerId;
      }
    },
    changeBowlerMidOver(bowlerId) {
      const current = state.innings[state.currentInningsIndex];
      if (current) setBowler(current, bowlerId);
    },
    startNextInnings(params) {
      const previous = state.innings[state.currentInningsIndex];
      const target =
        params.target !== undefined ? params.target : previous ? previous.runs + 1 : null;

      const spec: CreateInningsParams = {
        inningsNo: state.innings.length + 1,
        battingTeamId: previous?.bowlingTeamId ?? AWAY,
        bowlingTeamId: previous?.battingTeamId ?? HOME,
        battingOrder: params.battingOrder,
        bowlerId: params.bowlers[0] ?? 'bowl-1',
        target,
      };
      inningsSpecs.push(spec);

      state = {
        ...state,
        innings: [...state.innings, createInnings(spec)],
        currentInningsIndex: state.innings.length,
      };
      attack = params.bowlers;
      bowlerCursor = 0;
    },
    initialState() {
      return createMatch({
        matchId: 'match-test',
        config,
        innings: inningsSpecs.map(createInnings),
      });
    },
  };

  return api;
}

/** The innings currently being scored. */
export function innings(state: MatchState) {
  const i = state.innings[state.currentInningsIndex];
  if (!i) throw new Error('No current innings');
  return i;
}

/** Convenience: the striker's card. */
export function batter(state: MatchState, id: PlayerId) {
  const b = innings(state).batters[id];
  if (!b) throw new Error(`No batter ${id}`);
  return b;
}

export function bowlerCard(state: MatchState, id: PlayerId) {
  const b = innings(state).bowlers[id];
  if (!b) throw new Error(`No bowler ${id}`);
  return b;
}
