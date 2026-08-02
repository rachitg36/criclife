import { describe, expect, it } from 'vitest';
import { applyDelivery } from '../../src/engine/applyDelivery';
import { RULES_PROFILES } from '../../src/engine/config';
import { replay } from '../../src/engine/replay';
import { buildInningsScorecard } from '../../src/engine/scorecard';
import type { Delivery, InningsState, MatchConfig } from '../../src/engine/types';
import { generateMatch } from './fixtures/generate';

/**
 * These three fixtures are deterministic, engine-generated full matches
 * (mulberry32 PRNG, fixed seed) — not sourced from real historical
 * scorecards, since the engine has no network access to fetch one and
 * fabricating "real" data would be dishonest. In their place: every total is
 * independently recomputed straight from the raw delivery log (not read off
 * the engine's own running tallies) and checked against the engine's output,
 * and the persisted log is replayed through a completely fresh `MatchState`
 * and checked byte-identical to the live-scored one. Both are exactly the
 * properties docs/04-RULES-ENGINE.md §12 asks a fixture replay to prove.
 */

function recomputeFromLog(deliveries: Delivery[], inningsNo: number) {
  const rows = deliveries.filter((d) => d.inningsNo === inningsNo);
  const runs = rows.reduce((sum, d) => sum + d.runsTotal, 0);
  const legalBalls = rows.filter((d) => d.isLegal).length;
  const wickets = rows.filter((d) => d.isWicket).length;
  const extras = rows.reduce(
    (acc, d) => {
      if (d.extraType === 'wide') acc.wides += d.runsExtras;
      if (d.extraType === 'no_ball') acc.noBalls += d.runsExtras;
      if (d.extraType === 'bye') acc.byes += d.runsExtras;
      if (d.extraType === 'leg_bye') acc.legByes += d.runsExtras;
      if (d.extraType === 'penalty') acc.penalty += d.runsExtras;
      return acc;
    },
    { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 }
  );
  const batterRuns = rows.reduce((sum, d) => sum + d.runsBatter, 0);
  return { runs, legalBalls, wickets, extras, batterRuns };
}

function checkInnings(innings: InningsState, deliveries: Delivery[], config: MatchConfig) {
  const recomputed = recomputeFromLog(deliveries, innings.inningsNo);
  expect(innings.runs).toBe(recomputed.runs);
  expect(innings.legalBalls).toBe(recomputed.legalBalls);
  // countsAsWicket is false only for retired_hurt, which this generator never produces.
  expect(innings.wickets).toBe(recomputed.wickets);
  expect(innings.extras).toEqual(recomputed.extras);
  expect(innings.wickets).toBeLessThanOrEqual(config.playersPerSide - 1);

  const card = buildInningsScorecard(innings, config);
  const cardBattingRuns = card.batting.reduce((sum, b) => sum + b.runs, 0);
  expect(cardBattingRuns).toBe(recomputed.batterRuns);
  const cardBowlingRuns = card.bowling.reduce((sum, b) => sum + b.runsConceded, 0);
  expect(cardBowlingRuns).toBe(innings.runs - innings.extras.byes - innings.extras.legByes);
  const cardBowlingWickets = card.bowling.reduce((sum, b) => sum + b.wickets, 0);
  const bowlerCreditedWickets = deliveries.filter(
    (d) => d.inningsNo === innings.inningsNo && d.isWicket && d.wicketType && ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'].includes(d.wicketType)
  ).length;
  expect(cardBowlingWickets).toBe(bowlerCreditedWickets);
}

describe.each([
  { name: 'T20 Standard', config: RULES_PROFILES.t20, seed: 1001 },
  { name: 'ODI Standard', config: RULES_PROFILES.odi, seed: 2002 },
  { name: 'Gully 8', config: RULES_PROFILES.gully8, seed: 3003 },
])('fixture — $name', ({ config, seed, name }) => {
  const generated = generateMatch(`fixture-${name}`, config, seed);

  it('produced a non-trivial full match', () => {
    expect(generated.deliveries.length).toBeGreaterThan(20);
    expect(generated.state.innings.length).toBe(2);
    expect(generated.state.innings[0]!.status).toBe('completed');
    expect(generated.state.innings[1]!.status).toBe('completed');
  });

  it('every total matches an independent recomputation from the raw delivery log', () => {
    checkInnings(generated.state.innings[0]!, generated.deliveries, config);
    checkInnings(generated.state.innings[1]!, generated.deliveries, config);
  });

  it('replaying the persisted log reproduces a byte-identical MatchState', () => {
    const replayed = replay(`fixture-${name}`, config, generated.deliveries, generated.seeds);
    expect(replayed).toEqual(generated.state);
  });

  it('applyDelivery runs in well under 1ms per call', () => {
    // A snapshot from partway through the real fixture — full batter/bowler
    // maps, real history — repeatedly fed a plain dot ball. What's measured
    // is applyDelivery's own cost (clone + validate + bookkeeping), not
    // whether the match progresses realistically.
    const snapshotIndex = Math.floor(generated.deliveries.length / 2);
    const state = replay(
      `fixture-${name}`,
      config,
      generated.deliveries.slice(0, snapshotIndex),
      generated.seeds
    );

    const iterations = 500;
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      applyDelivery(state, {
        clientDeliveryId: `timing-${i}`,
        runsOffBat: 0,
        extraType: null,
        extraRuns: 0,
        isBoundary: false,
        wicket: null,
      });
    }
    const elapsedMs = performance.now() - start;
    expect(elapsedMs / iterations).toBeLessThan(1);
  });
});
