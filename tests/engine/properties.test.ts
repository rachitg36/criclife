import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allOutWickets,
  replay,
  scorecard,
  undoLastDelivery,
  type Delivery,
  type MatchState,
} from '@/engine';
import { harness, innings, type BallSpec } from './harness';

/**
 * docs/04-RULES-ENGINE.md § 12 — property tests for the engine's invariants.
 *
 * These run over randomly generated but *valid* delivery logs. The generator
 * below is the interesting part: it produces balls a real scorer could enter,
 * because feeding the engine nonsense would only prove that it rejects
 * nonsense.
 */

/**
 * A generated ball. `wicketBall` is a marker rather than a real `BallSpec`,
 * because the batter to dismiss is not known until the ball is scored — it
 * depends on who is at the crease at that point in the innings.
 */
type GeneratedBall = BallSpec | { wicketBall: true };

const isWicketMarker = (b: GeneratedBall): b is { wicketBall: true } =>
  'wicketBall' in b && b.wicketBall === true;

/** A single plausible ball. Wickets are rare, as in a real innings. */
const arbBall: fc.Arbitrary<GeneratedBall> = fc.oneof(
  { weight: 60, arbitrary: fc.record({ runsOffBat: fc.constantFrom(0, 1, 2, 3) }) },
  {
    weight: 12,
    arbitrary: fc.record({
      runsOffBat: fc.constantFrom(4, 6),
      isBoundary: fc.constant(true),
    }),
  },
  {
    weight: 8,
    arbitrary: fc.record({
      extraType: fc.constant<'wide'>('wide'),
      extraRuns: fc.constantFrom(0, 1, 2),
    }),
  },
  {
    weight: 6,
    arbitrary: fc.record({
      extraType: fc.constant<'no_ball'>('no_ball'),
      runsOffBat: fc.constantFrom(0, 1, 4),
    }),
  },
  {
    weight: 6,
    arbitrary: fc.record({
      extraType: fc.constantFrom<'bye' | 'leg_bye'>('bye', 'leg_bye'),
      extraRuns: fc.constantFrom(1, 2, 4),
    }),
  },
  { weight: 8, arbitrary: fc.constant<GeneratedBall>({ wicketBall: true }) }
);

const arbLog = fc.array(arbBall, { minLength: 1, maxLength: 90 });

/**
 * Scores a generated log against a fresh innings, skipping any ball the engine
 * legitimately refuses (innings over, bowler capped). Returns the final state
 * plus the deliveries actually applied.
 */
function scoreLog(specs: GeneratedBall[], config = {}) {
  const h = harness({ config: { oversPerInnings: 20, ...config } });

  for (const spec of specs) {
    if (innings(h.state).status !== 'in_progress') break;

    const realSpec: BallSpec = isWicketMarker(spec)
      ? { wicket: { type: 'bowled', dismissedPlayerId: h.striker() } }
      : spec;

    // Skip anything the engine legitimately refuses (bowler capped, etc.)
    // rather than aborting the whole log.
    if (h.tryBall(realSpec).ok) h.ball(realSpec);
  }

  return h;
}

/**
 * A property suite that never generates the interesting case proves nothing.
 * This asserts the generator actually reaches wickets, extras and boundaries
 * before the invariants below claim anything about them.
 */
describe('generator sanity', () => {
  it('produces logs containing wickets, extras and boundaries', () => {
    let sawWicket = false;
    let sawWide = false;
    let sawNoBall = false;
    let sawBye = false;
    let sawBoundary = false;
    let totalBalls = 0;

    fc.assert(
      fc.property(arbLog, (specs) => {
        const h = scoreLog(specs);
        totalBalls += h.deliveries.length;
        for (const d of h.deliveries) {
          if (d.isWicket) sawWicket = true;
          if (d.extraType === 'wide') sawWide = true;
          if (d.extraType === 'no_ball') sawNoBall = true;
          if (d.extraType === 'bye' || d.extraType === 'leg_bye') sawBye = true;
          if (d.isBoundaryFour || d.isBoundarySix) sawBoundary = true;
        }
      }),
      { numRuns: 40 }
    );

    expect(totalBalls).toBeGreaterThan(200);
    expect(sawWicket).toBe(true);
    expect(sawWide).toBe(true);
    expect(sawNoBall).toBe(true);
    expect(sawBye).toBe(true);
    expect(sawBoundary).toBe(true);
  });
});

describe('§ 12 invariants', () => {
  it('sum(delivery.runsTotal) === innings.runs', () => {
    fc.assert(
      fc.property(arbLog, (specs) => {
        const h = scoreLog(specs);
        const summed = h.deliveries.reduce((total, d) => total + d.runsTotal, 0);
        expect(innings(h.state).runs).toBe(summed);
      }),
      { numRuns: 120 }
    );
  });

  it('count(isLegal) === innings.legalBalls', () => {
    fc.assert(
      fc.property(arbLog, (specs) => {
        const h = scoreLog(specs);
        const legal = h.deliveries.filter((d) => d.isLegal).length;
        expect(innings(h.state).legalBalls).toBe(legal);
      }),
      { numRuns: 120 }
    );
  });

  it('innings.wickets never exceeds the all-out threshold', () => {
    fc.assert(
      fc.property(arbLog, (specs) => {
        const h = scoreLog(specs);
        const i = innings(h.state);
        expect(i.wickets).toBeLessThanOrEqual(allOutWickets(h.state.config));
      }),
      { numRuns: 120 }
    );
  });

  it('the batting card always reconciles with the innings total', () => {
    fc.assert(
      fc.property(arbLog, (specs) => {
        const h = scoreLog(specs);
        const i = innings(h.state);
        const batterRuns = Object.values(i.batters).reduce((sum, b) => sum + b.runs, 0);
        const extras =
          i.extras.wides + i.extras.noBalls + i.extras.byes + i.extras.legByes + i.extras.penalty;
        expect(batterRuns + extras).toBe(i.runs);
      }),
      { numRuns: 120 }
    );
  });

  it('never leaves more legal balls bowled than the format allows', () => {
    fc.assert(
      fc.property(arbLog, (specs) => {
        const h = scoreLog(specs);
        const i = innings(h.state);
        expect(i.legalBalls).toBeLessThanOrEqual(
          h.state.config.oversPerInnings * h.state.config.ballsPerOver
        );
      }),
      { numRuns: 120 }
    );
  });
});

describe('§ 12 — determinism and replay', () => {
  /** Rebuilds the same starting position the harness began from. */
  function freshInitial(state: MatchState): MatchState {
    const h = harness({ config: state.config });
    return h.state;
  }

  it('replaying a log always produces identical state', () => {
    fc.assert(
      fc.property(arbLog, (specs) => {
        const h = scoreLog(specs);
        const initial = freshInitial(h.state);

        const first = replay(initial, h.deliveries);
        const second = replay(initial, h.deliveries);

        expect(first.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(first.state).toEqual(second.state);
      }),
      { numRuns: 60 }
    );
  });

  it('a replayed log reproduces the state that produced it', () => {
    fc.assert(
      fc.property(arbLog, (specs) => {
        const h = scoreLog(specs);
        const initial = freshInitial(h.state);

        const result = replay(initial, h.deliveries);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // The scorecard is the contract — compare the projection, which is
        // what every screen actually renders.
        expect(scorecard(result.state)).toEqual(scorecard(h.state));
      }),
      { numRuns: 60 }
    );
  });

  it('undo-then-redo returns to the identical state', () => {
    fc.assert(
      fc.property(fc.array(arbBall, { minLength: 2, maxLength: 40 }), (specs) => {
        const h = scoreLog(specs);
        if (h.deliveries.length < 2) return;

        const initial = freshInitial(h.state);
        const full: Delivery[] = h.deliveries.map((d) => ({ ...d }));

        const before = replay(initial, full);
        expect(before.ok).toBe(true);
        if (!before.ok) return;

        // Undo the last ball, then put it back.
        const undone = undoLastDelivery(full);
        const afterUndo = replay(initial, undone);
        expect(afterUndo.ok).toBe(true);
        if (!afterUndo.ok) return;
        expect(afterUndo.applied).toBe(before.applied - 1);

        const redone = undone.map((d) => ({ ...d, isDeleted: false }));
        const afterRedo = replay(initial, redone);
        expect(afterRedo.ok).toBe(true);
        if (!afterRedo.ok) return;

        expect(afterRedo.state).toEqual(before.state);
      }),
      { numRuns: 60 }
    );
  });

  it('undo is a soft delete — the log never shrinks', () => {
    fc.assert(
      fc.property(fc.array(arbBall, { minLength: 1, maxLength: 20 }), (specs) => {
        const h = scoreLog(specs);
        if (h.deliveries.length === 0) return;
        const undone = undoLastDelivery(h.deliveries);
        expect(undone).toHaveLength(h.deliveries.length);
        expect(undone.filter((d) => d.isDeleted)).toHaveLength(1);
      }),
      { numRuns: 40 }
    );
  });
});
