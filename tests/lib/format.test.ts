import { describe, expect, it } from 'vitest';
import {
  battingAverage,
  currentRunRate,
  economyRate,
  formatBattingScore,
  formatBowlingFigures,
  formatOvers,
  formatScore,
  initials,
  pluralise,
  requiredRunRate,
  shortName,
  stat,
  strikeRate,
} from '@/lib/format';

describe('formatOvers', () => {
  it('renders whole and partial overs', () => {
    expect(formatOvers(0)).toBe('0.0');
    expect(formatOvers(5)).toBe('0.5');
    expect(formatOvers(6)).toBe('1.0');
    expect(formatOvers(87)).toBe('14.3');
    expect(formatOvers(120)).toBe('20.0');
  });

  it('honours a non-standard balls-per-over (The Hundred is 5)', () => {
    expect(formatOvers(7, 5)).toBe('1.2');
    expect(formatOvers(10, 5)).toBe('2.0');
  });
});

describe('score formatting', () => {
  it('formats a team score', () => {
    expect(formatScore(147, 4)).toBe('147-4');
  });

  it('marks a not-out batter with an asterisk', () => {
    expect(formatBattingScore(62, false)).toBe('62*');
    expect(formatBattingScore(62, true)).toBe('62');
  });

  it('formats bowling figures', () => {
    expect(formatBowlingFigures(21, 0, 28, 2)).toBe('3.3-0-28-2');
  });
});

describe('averages and rates', () => {
  it('computes a batting average from dismissals, not innings', () => {
    expect(battingAverage(300, 10, 2)).toBe(37.5);
  });

  it('returns null for a batter who has never been out', () => {
    expect(battingAverage(50, 3, 3)).toBeNull();
  });

  it('returns null rather than dividing by zero', () => {
    expect(strikeRate(10, 0)).toBeNull();
    expect(economyRate(10, 0)).toBeNull();
    expect(currentRunRate(10, 0)).toBeNull();
    expect(requiredRunRate(100, 50, 0)).toBeNull();
  });

  it('computes economy over partial overs', () => {
    expect(economyRate(28, 21)).toBeCloseTo(8.0, 5);
  });

  it('computes the required rate', () => {
    // 43 needed off 33 balls = 5.5 overs → 7.818
    expect(requiredRunRate(190, 147, 33)).toBeCloseTo(7.8181, 3);
  });
});

describe('stat display', () => {
  it('renders an en dash for missing values, never NaN', () => {
    expect(stat(null)).toBe('–');
    expect(stat(undefined)).toBe('–');
    expect(stat(Number.NaN)).toBe('–');
    expect(stat(Number.POSITIVE_INFINITY)).toBe('–');
    expect(stat(8)).toBe('8.00');
  });
});

describe('names', () => {
  it('abbreviates to initial plus surname', () => {
    expect(shortName('Rohit Sharma')).toBe('R Sharma');
    expect(shortName('Kumar Sangakkara')).toBe('K Sangakkara');
    expect(shortName('Mohammed Siraj Ahmed')).toBe('M Ahmed');
    expect(shortName('Ashwin')).toBe('Ashwin');
  });

  it('builds avatar initials', () => {
    expect(initials('Rohit Sharma')).toBe('RS');
    expect(initials('Ashwin')).toBe('AS');
    expect(initials('')).toBe('?');
  });
});

describe('pluralise', () => {
  it('handles one and many', () => {
    expect(pluralise(1, 'run')).toBe('1 run');
    expect(pluralise(4, 'run')).toBe('4 runs');
    expect(pluralise(0, 'wicket')).toBe('0 wickets');
  });
});
