import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import {
  ballsRemaining,
  buildPartnerships,
  currentRunRate,
  oversDisplay,
  projectedScore,
  requiredRunRate,
  requiredRuns,
} from '../../src/engine/projections';
import { emptyInnings } from './helpers';

describe('oversDisplay', () => {
  it('formats whole and partial overs', () => {
    expect(oversDisplay(0, 6)).toBe('0.0');
    expect(oversDisplay(6, 6)).toBe('1.0');
    expect(oversDisplay(8, 6)).toBe('1.2');
    expect(oversDisplay(23, 5)).toBe('4.3'); // The Hundred's 5-ball over
  });
});

describe('currentRunRate', () => {
  it('is 0 before any legal ball has been bowled', () => {
    const innings = emptyInnings({ runs: 0, legalBalls: 0 });
    expect(currentRunRate(innings, DEFAULT_CONFIG)).toBe(0);
  });

  it('is runs per over so far', () => {
    const innings = emptyInnings({ runs: 30, legalBalls: 30 });
    expect(currentRunRate(innings, DEFAULT_CONFIG)).toBe(6);
  });
});

describe('requiredRuns / ballsRemaining / requiredRunRate / projectedScore', () => {
  it('requiredRuns is null when there is no target (first innings)', () => {
    const innings = emptyInnings({ runs: 50, target: null });
    expect(requiredRuns(innings)).toBeNull();
    expect(requiredRunRate(innings, DEFAULT_CONFIG)).toBeNull();
  });

  it('requiredRuns/requiredRunRate for a normal chase', () => {
    const innings = emptyInnings({ runs: 50, legalBalls: 60, target: 151 });
    expect(requiredRuns(innings)).toBe(101);
    // 101 needed off (120-60)=60 balls = 10 overs → 10.1/over
    expect(requiredRunRate(innings, DEFAULT_CONFIG)).toBeCloseTo(10.1, 5);
  });

  it('requiredRunRate is 0 once the target is already reached', () => {
    const innings = emptyInnings({ runs: 151, legalBalls: 100, target: 151 });
    expect(requiredRunRate(innings, DEFAULT_CONFIG)).toBe(0);
  });

  it('requiredRunRate is Infinity when balls have run out short of the target', () => {
    const innings = emptyInnings({ runs: 100, legalBalls: 120, target: 151 });
    expect(ballsRemaining(innings, DEFAULT_CONFIG)).toBe(0);
    expect(requiredRunRate(innings, DEFAULT_CONFIG)).toBe(Infinity);
  });

  it('ballsRemaining respects a rain-revised overs count', () => {
    const innings = emptyInnings({ legalBalls: 30, revisedOvers: 10 });
    expect(ballsRemaining(innings, DEFAULT_CONFIG)).toBe(30);
  });

  it('ballsRemaining never goes negative', () => {
    const innings = emptyInnings({ legalBalls: 130 });
    expect(ballsRemaining(innings, DEFAULT_CONFIG)).toBe(0);
  });

  it('projectedScore extrapolates the current run rate across the remaining overs', () => {
    const innings = emptyInnings({ runs: 60, legalBalls: 60 }); // CRR = 6
    // 60 balls remain = 10 overs; projected = 60 + 6*10 = 120
    expect(projectedScore(innings, DEFAULT_CONFIG)).toBe(120);
  });
});

describe('buildPartnerships', () => {
  it('derives runs/balls per stand from fallOfWickets deltas, plus the unbroken current stand', () => {
    const innings = emptyInnings({
      runs: 87,
      legalBalls: 70,
      wickets: 2,
      fallOfWickets: [
        { wicketNumber: 1, runs: 30, legalBalls: 24, playerId: 'p1' },
        { wicketNumber: 2, runs: 60, legalBalls: 48, playerId: 'p2' },
      ],
      status: 'in_progress',
    });
    const partnerships = buildPartnerships(innings);
    expect(partnerships).toEqual([
      { wicketNumber: 1, runs: 30, legalBalls: 24, endedByPlayerId: 'p1' },
      { wicketNumber: 2, runs: 30, legalBalls: 24, endedByPlayerId: 'p2' },
      { wicketNumber: 3, runs: 27, legalBalls: 22, endedByPlayerId: null },
    ]);
  });

  it('omits the trailing unbroken stand once the innings has completed', () => {
    const innings = emptyInnings({
      runs: 60,
      legalBalls: 48,
      wickets: 2,
      fallOfWickets: [
        { wicketNumber: 1, runs: 30, legalBalls: 24, playerId: 'p1' },
        { wicketNumber: 2, runs: 60, legalBalls: 48, playerId: 'p2' },
      ],
      status: 'completed',
      endReason: 'all_out',
    });
    const partnerships = buildPartnerships(innings);
    expect(partnerships).toHaveLength(2);
    expect(partnerships.every((p) => p.endedByPlayerId !== null)).toBe(true);
  });

  it('a fresh innings with no wickets yet is a single unbroken stand of 0', () => {
    const innings = emptyInnings({ runs: 0, legalBalls: 0, wickets: 0, fallOfWickets: [] });
    expect(buildPartnerships(innings)).toEqual([
      { wicketNumber: 1, runs: 0, legalBalls: 0, endedByPlayerId: null },
    ]);
  });
});
