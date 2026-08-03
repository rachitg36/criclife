import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/engine/config';
import {
  computeWinProbability,
  parRunRate,
} from '../../../src/features/audience/winProbability';
import { createTestMatch } from '../../engine/helpers';
import type { MatchState } from '../../../src/engine/types';

const config = DEFAULT_CONFIG;

function chasing(overrides: {
  runs: number;
  wickets: number;
  legalBalls: number;
  target: number;
}): MatchState {
  return createTestMatch(
    {},
    {
      inningsNo: 2,
      runs: overrides.runs,
      wickets: overrides.wickets,
      legalBalls: overrides.legalBalls,
      target: overrides.target,
    }
  );
}

describe('parRunRate', () => {
  it('uses the anchor value exactly at an anchor', () => {
    expect(parRunRate(20)).toBeCloseTo(8.0);
    expect(parRunRate(50)).toBeCloseTo(5.8);
  });

  it('interpolates between anchors instead of snapping to the nearest', () => {
    const fifteen = parRunRate(15);
    expect(fifteen).toBeLessThan(parRunRate(10));
    expect(fifteen).toBeGreaterThan(parRunRate(20));
  });

  it('is flat outside the anchor range', () => {
    expect(parRunRate(1)).toBe(parRunRate(5));
    expect(parRunRate(200)).toBe(parRunRate(50));
  });
});

describe('computeWinProbability — the edges that must not be wrong', () => {
  it('is unknown before a ball is bowled', () => {
    const state = createTestMatch();
    expect(computeWinProbability(state, config).mode).toBe('unknown');
  });

  it('reads a first innings as a par comparison, never as a win probability', () => {
    const state = createTestMatch({}, { runs: 60, legalBalls: 36 });
    const wp = computeWinProbability(state, config);
    expect(wp.mode).toBe('par');
    expect(wp.explanation).toMatch(/par innings/);
  });

  it('gives a comfortable chase a high number', () => {
    // 3 needed off 12 with 8 wickets standing.
    const wp = computeWinProbability(
      chasing({ runs: 150, wickets: 2, legalBalls: 108, target: 153 }),
      config
    );
    expect(wp.battingTeamProbability).toBeGreaterThan(0.85);
  });

  it('gives a hopeless chase a low number', () => {
    // 60 needed off 12 with 2 wickets standing.
    const wp = computeWinProbability(
      chasing({ runs: 100, wickets: 8, legalBalls: 108, target: 160 }),
      config
    );
    expect(wp.battingTeamProbability).toBeLessThan(0.15);
  });

  it('never shows a live match as a certainty', () => {
    const runaway = computeWinProbability(
      chasing({ runs: 200, wickets: 0, legalBalls: 6, target: 201 }),
      config
    );
    // The target has not been passed, so this stays an estimate, clamped.
    expect(runaway.battingTeamProbability).toBeLessThanOrEqual(0.98);
    expect(runaway.battingTeamProbability).toBeGreaterThanOrEqual(0.02);
  });

  it('is a flat 1 once the target is passed', () => {
    const wp = computeWinProbability(
      chasing({ runs: 161, wickets: 4, legalBalls: 100, target: 160 }),
      config
    );
    expect(wp.battingTeamProbability).toBe(1);
  });

  it('is a flat 0 with no wickets left', () => {
    const wp = computeWinProbability(
      chasing({ runs: 100, wickets: 10, legalBalls: 60, target: 160 }),
      config
    );
    expect(wp.battingTeamProbability).toBe(0);
    expect(wp.explanation).toMatch(/No wickets left/);
  });

  it('is a flat 0 with no balls left', () => {
    const wp = computeWinProbability(
      chasing({ runs: 100, wickets: 4, legalBalls: 120, target: 160 }),
      config
    );
    expect(wp.battingTeamProbability).toBe(0);
    expect(wp.explanation).toMatch(/No balls left/);
  });

  it('reports the decided match rather than estimating it', () => {
    const base = chasing({ runs: 161, wickets: 4, legalBalls: 100, target: 160 });
    const state: MatchState = {
      ...base,
      result: {
        type: 'win',
        winnerTeamId: 'teamA',
        marginRuns: null,
        marginWickets: 6,
        text: 'teamA won by 6 wickets',
      },
    };
    const wp = computeWinProbability(state, config);
    expect(wp.mode).toBe('settled');
    expect(wp.battingTeamProbability).toBe(1);
    expect(wp.explanation).toBe('teamA won by 6 wickets');
  });

  it('gives a tie an even split', () => {
    const base = chasing({ runs: 160, wickets: 9, legalBalls: 120, target: 161 });
    const wp = computeWinProbability(
      { ...base, result: { type: 'tie', winnerTeamId: null, marginRuns: null, marginWickets: null, text: 'Match tied' } },
      config
    );
    expect(wp.battingTeamProbability).toBe(0.5);
  });

  it('prefers a revised target over the original', () => {
    const base = chasing({ runs: 100, wickets: 2, legalBalls: 60, target: 200 });
    const revised: MatchState = {
      ...base,
      // Already past the revised target of 100, still 100 short of the original.
      innings: base.innings.map((i) => ({ ...i, revisedTarget: 100 })),
    };
    expect(computeWinProbability(base, config).battingTeamProbability).toBeLessThan(0.9);
    expect(computeWinProbability(revised, config).battingTeamProbability).toBe(1);
  });

  it('always explains its inputs', () => {
    const wp = computeWinProbability(
      chasing({ runs: 100, wickets: 3, legalBalls: 60, target: 160 }),
      config
    );
    expect(wp.explanation).toMatch(/Need 60 off 60 balls/);
    expect(wp.explanation).toMatch(/Estimate only/);
  });
});
