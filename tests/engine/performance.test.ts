import { describe, expect, it } from 'vitest';
import { applyDelivery, replay, scorecard } from '@/engine';
import { harness, innings } from './harness';

/**
 * docs/12-ROADMAP.md Phase 1 — "`applyDelivery` runs in under 1ms".
 *
 * Timed with `performance.now()` inside the test rather than `Date.now()` in
 * the engine — the engine itself must stay free of ambient time.
 *
 * A wall-clock assertion is inherently a little flaky on shared CI, so this
 * measures the MEDIAN of many calls rather than a single one, and leaves
 * generous headroom. It is a smoke alarm for an accidental O(n²), not a
 * benchmark.
 */

/**
 * V8 coverage instrumentation slows the engine by roughly an order of
 * magnitude, so timing it under coverage measures the profiler, not the code.
 * The budget is enforced on the uninstrumented run (`npm run test`), and
 * relaxed to a loose ceiling under `--coverage` so CI does not flake.
 */
const UNDER_COVERAGE = process.env['VITEST_COVERAGE'] === '1';
const PER_BALL_BUDGET_MS = UNDER_COVERAGE ? 20 : 1;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

describe('performance', () => {
  it('applyDelivery runs well under 1ms', () => {
    const h = harness({ config: { oversPerInnings: 50, playersPerSide: 11 } });

    // Warm up so we are not measuring first-call JIT.
    for (let i = 0; i < 50; i++) h.ball({ runsOffBat: 1 });

    const timings: number[] = [];
    for (let i = 0; i < 200; i++) {
      const state = h.state;
      const input = {
        clientDeliveryId: `perf-${i}`,
        runsOffBat: 1,
        extraType: null,
        extraRuns: 0,
        isBoundary: false,
        wicket: null,
      };
      const start = performance.now();
      applyDelivery(state, input);
      timings.push(performance.now() - start);
    }

    const med = median(timings);
    expect(med).toBeLessThan(PER_BALL_BUDGET_MS);
  });

  it('replays a full 50-over innings quickly', () => {
    const h = harness({ config: { oversPerInnings: 50, playersPerSide: 11 } });

    // ~300 balls, the length of an ODI innings.
    while (innings(h.state).status === 'in_progress' && h.deliveries.length < 300) {
      h.ball({ runsOffBat: h.deliveries.length % 4 === 0 ? 1 : 0 });
    }
    expect(h.deliveries.length).toBeGreaterThan(200);

    const initial = h.initialState();
    const start = performance.now();
    const result = replay(initial, h.deliveries);
    const elapsed = performance.now() - start;

    expect(result.ok).toBe(true);
    // docs/04 § 10 claims ~15ms for a 130-row innings; this is twice the rows.
    // A loose ceiling that still catches quadratic behaviour.
    expect(elapsed).toBeLessThan(UNDER_COVERAGE ? 5000 : 250);
  });

  it('projects a scorecard without mutating state', () => {
    const h = harness();
    for (let i = 0; i < 12; i++) h.ball({ runsOffBat: 1 });
    const before = JSON.stringify(h.state);
    scorecard(h.state);
    expect(JSON.stringify(h.state)).toBe(before);
  });
});
