import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyDelivery, setBowler, setNewBatter } from '../../src/engine/applyDelivery';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createInitialMatchState, replay } from '../../src/engine/replay';
import type { Delivery, DeliveryInput, MatchConfig, MatchState } from '../../src/engine/types';

type BallPlan =
  | { kind: 'runs'; n: 0 | 1 | 2 | 3 | 4 | 6 }
  | { kind: 'wide'; extra: 0 | 1 | 2 }
  | { kind: 'no_ball'; runsOffBat: 0 | 1 | 2 | 4 | 6 }
  | { kind: 'bye'; n: 1 | 2 | 4 }
  | { kind: 'leg_bye'; n: 1 | 2 | 4 }
  | { kind: 'wicket' };

const ballPlanArb: fc.Arbitrary<BallPlan> = fc.oneof(
  fc.constantFrom(0, 1, 2, 3, 4, 6).map((n): BallPlan => ({ kind: 'runs', n })),
  fc.constantFrom(0, 1, 2).map((extra): BallPlan => ({ kind: 'wide', extra })),
  fc.constantFrom(0, 1, 2, 4, 6).map((runsOffBat): BallPlan => ({ kind: 'no_ball', runsOffBat })),
  fc.constantFrom(1, 2, 4).map((n): BallPlan => ({ kind: 'bye', n })),
  fc.constantFrom(1, 2, 4).map((n): BallPlan => ({ kind: 'leg_bye', n })),
  fc.constant<BallPlan>({ kind: 'wicket' })
);

const PLAYER_POOL = Array.from({ length: 24 }, (_, i) => `p${i + 1}`);

function planToInput(plan: BallPlan, isFreeHit: boolean, dismissedId: string): DeliveryInput {
  const base = { clientDeliveryId: crypto.randomUUID(), isBoundary: false, wicket: null };
  switch (plan.kind) {
    case 'runs':
      return {
        ...base,
        runsOffBat: plan.n,
        extraType: null,
        extraRuns: 0,
        isBoundary: plan.n === 4 || plan.n === 6,
      };
    case 'wide':
      return { ...base, runsOffBat: 0, extraType: 'wide', extraRuns: plan.extra };
    case 'no_ball':
      return {
        ...base,
        runsOffBat: plan.runsOffBat,
        extraType: 'no_ball',
        extraRuns: 0,
        isBoundary: plan.runsOffBat === 4 || plan.runsOffBat === 6,
      };
    case 'bye':
      return { ...base, runsOffBat: 0, extraType: 'bye', extraRuns: plan.n };
    case 'leg_bye':
      return { ...base, runsOffBat: 0, extraType: 'leg_bye', extraRuns: plan.n };
    case 'wicket':
      // Bowled is illegal on a free hit — fall back to a harmless dot ball
      // rather than feeding applyDelivery an intentionally-rejected input.
      if (isFreeHit) return { ...base, runsOffBat: 0, extraType: null, extraRuns: 0 };
      return {
        ...base,
        runsOffBat: 0,
        extraType: null,
        extraRuns: 0,
        wicket: { type: 'bowled', dismissedPlayerId: dismissedId },
      };
  }
}

/** Plays `plans` ball by ball via `applyDelivery`, auto-filling batters/bowlers as needed. */
function simulate(config: MatchConfig, plans: BallPlan[]) {
  let state: MatchState = createInitialMatchState('prop-match', config);
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
        // Matches replay.ts's own seeding convention (empty — it learns the
        // roster from the log as it goes); the simulation below picks the
        // next batter straight from `PLAYER_POOL`, not from this list.
        yetToBat: [],
        status: 'in_progress',
        endReason: null,
        currentOver: { bowlerIds: [], runs: 0 },
      },
    ],
    currentInningsIndex: 0,
  };
  state = setNewBatter(state, PLAYER_POOL[0]!);
  state = setNewBatter(state, PLAYER_POOL[1]!);
  state = setBowler(state, 'bowlerA');

  const deliveries: Delivery[] = [];
  let poolIndex = 2;

  for (const plan of plans) {
    // Prep *before* processing, not after — so if the sequence ends here,
    // `state` reflects exactly what `deliveries` recorded, nothing more.
    let innings = state.innings[state.currentInningsIndex];
    if (!innings || innings.status !== 'in_progress') break;

    if (innings.strikerId === null || innings.nonStrikerId === null) {
      if (poolIndex >= PLAYER_POOL.length) break; // pool exhausted — stop, don't error
      state = setNewBatter(state, PLAYER_POOL[poolIndex]!);
      poolIndex += 1;
      innings = state.innings[state.currentInningsIndex]!;
    }
    if (innings.bowlerId === null) {
      const nextBowler = innings.previousBowlerId === 'bowlerA' ? 'bowlerB' : 'bowlerA';
      state = setBowler(state, nextBowler);
      innings = state.innings[state.currentInningsIndex]!;
    }

    const dismissedId = innings.strikerId!;
    const input = planToInput(plan, innings.isFreeHit, dismissedId);
    const result = applyDelivery(state, input);
    if (!result.ok) continue; // an occasional bowler-overs-exhausted etc is fine to skip
    state = result.state;
    deliveries.push(result.delivery);
  }

  return { state, deliveries };
}

describe('engine invariants — docs/04-RULES-ENGINE.md §12', () => {
  it('sum(delivery.runsTotal) === innings.runs for any random valid log', () => {
    fc.assert(
      fc.property(fc.array(ballPlanArb, { minLength: 1, maxLength: 60 }), (plans) => {
        const { state, deliveries } = simulate(DEFAULT_CONFIG, plans);
        const innings = state.innings[state.currentInningsIndex]!;
        const sum = deliveries
          .filter((d) => d.inningsNo === innings.inningsNo)
          .reduce((acc, d) => acc + d.runsTotal, 0);
        expect(sum).toBe(innings.runs);
      }),
      { numRuns: 200 }
    );
  });

  it('count(is_legal) === innings.legalBalls', () => {
    fc.assert(
      fc.property(fc.array(ballPlanArb, { minLength: 1, maxLength: 60 }), (plans) => {
        const { state, deliveries } = simulate(DEFAULT_CONFIG, plans);
        const innings = state.innings[state.currentInningsIndex]!;
        const legalCount = deliveries.filter(
          (d) => d.inningsNo === innings.inningsNo && d.isLegal
        ).length;
        expect(legalCount).toBe(innings.legalBalls);
      }),
      { numRuns: 200 }
    );
  });

  it('innings.wickets never exceeds playersPerSide - 1', () => {
    fc.assert(
      fc.property(fc.array(ballPlanArb, { minLength: 1, maxLength: 80 }), (plans) => {
        const { state } = simulate(DEFAULT_CONFIG, plans);
        const innings = state.innings[state.currentInningsIndex]!;
        expect(innings.wickets).toBeLessThanOrEqual(DEFAULT_CONFIG.playersPerSide - 1);
      }),
      { numRuns: 200 }
    );
  });

  it('replaying the recorded delivery log reproduces byte-identical state (determinism)', () => {
    fc.assert(
      fc.property(fc.array(ballPlanArb, { minLength: 1, maxLength: 60 }), (plans) => {
        const { state, deliveries } = simulate(DEFAULT_CONFIG, plans);
        const replayed = replay('prop-match', DEFAULT_CONFIG, deliveries, [
          { inningsNo: 1, battingTeamId: 'teamA', bowlingTeamId: 'teamB' },
        ]);
        expect(replayed).toEqual(state);
      }),
      { numRuns: 100 }
    );
  });

  it('undo (drop the last ball) then redo (replay it back) returns to the identical state', () => {
    fc.assert(
      fc.property(fc.array(ballPlanArb, { minLength: 2, maxLength: 60 }), (plans) => {
        const { deliveries } = simulate(DEFAULT_CONFIG, plans);
        fc.pre(deliveries.length >= 2);

        const seeds = [{ inningsNo: 1, battingTeamId: 'teamA', bowlingTeamId: 'teamB' }];
        const full = replay('prop-match', DEFAULT_CONFIG, deliveries, seeds);

        const withoutLast = deliveries.slice(0, -1);
        const undone = replay('prop-match', DEFAULT_CONFIG, withoutLast, seeds);
        expect(undone).not.toEqual(full);

        const redone = replay('prop-match', DEFAULT_CONFIG, deliveries, seeds);
        expect(redone).toEqual(full);
      }),
      { numRuns: 100 }
    );
  });
});
