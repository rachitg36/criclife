import { describe, expect, it } from 'vitest';
import { defaultMatchTitle, toDateTimeLocal } from '@/features/matches/newMatchDefaults';

/**
 * Both fields on the wizard's venue/time step started blank, which is how a
 * match ended up named "1" with no date on it. A match is nearly always being
 * created for the moment it is being created in.
 */
describe('toDateTimeLocal', () => {
  it('formats what <input type="datetime-local"> requires', () => {
    expect(toDateTimeLocal(new Date(2026, 7, 4, 1, 31))).toBe('2026-08-04T01:31');
  });

  it('zero-pads every field', () => {
    expect(toDateTimeLocal(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07');
  });

  it('uses local time, not UTC', () => {
    // The bug this guards: toISOString() would render 18:30 the previous day
    // for a +05:30 clock, prefilling a time nobody's watch agrees with.
    const local = new Date(2026, 7, 4, 0, 30);
    expect(toDateTimeLocal(local)).toBe('2026-08-04T00:30');
    expect(toDateTimeLocal(local)).not.toBe(local.toISOString().slice(0, 16));
  });

  it('handles midnight and the last minute of the year', () => {
    expect(toDateTimeLocal(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01T00:00');
    expect(toDateTimeLocal(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31T23:59');
  });
});

describe('defaultMatchTitle', () => {
  it('names the match after the two sides and the day', () => {
    expect(defaultMatchTitle('TM1', 'TM2', new Date(2026, 7, 4))).toBe('TM1 v TM2 · 4 Aug 2026');
  });

  it('does not zero-pad the day, which reads as a date not a timestamp', () => {
    expect(defaultMatchTitle('A', 'B', new Date(2026, 0, 5))).toBe('A v B · 5 Jan 2026');
  });

  it('returns null rather than "undefined v undefined" when a side is unknown', () => {
    // Reachable: a team picked from the all-teams search is not in `myTeams`.
    expect(defaultMatchTitle(undefined, 'TM2', new Date())).toBeNull();
    expect(defaultMatchTitle('TM1', undefined, new Date())).toBeNull();
    expect(defaultMatchTitle('', '', new Date())).toBeNull();
  });
});
