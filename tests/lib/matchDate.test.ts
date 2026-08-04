import { describe, expect, it } from 'vitest';
import { formatMatchDateTime, formatMatchDay } from '@/lib/format';

/**
 * A match card showed `04/08/2026, 02:03:00` — `toLocaleString()`'s output.
 * Ambiguous (is that April?), and far more precision than anybody wants on a
 * card. The year is only worth saying in a list that reaches back through
 * past seasons.
 *
 * The suite runs in Asia/Kolkata (vitest.config.ts), so these also prove the
 * formatters read local time rather than UTC.
 */
describe('formatMatchDay', () => {
  it('is "4 Aug" by default — no year, no padding', () => {
    expect(formatMatchDay(new Date(2026, 7, 4))).toBe('4 Aug');
  });

  it('adds the year only when asked', () => {
    expect(formatMatchDay(new Date(2026, 7, 4), true)).toBe('4 Aug 2026');
  });

  it('gets every month right, not just the one it was written in', () => {
    expect(formatMatchDay(new Date(2026, 0, 1))).toBe('1 Jan');
    expect(formatMatchDay(new Date(2026, 3, 8))).toBe('8 Apr');
    expect(formatMatchDay(new Date(2026, 11, 31))).toBe('31 Dec');
  });
});

describe('formatMatchDateTime', () => {
  it('adds a 24-hour clock and drops the seconds', () => {
    expect(formatMatchDateTime(new Date(2026, 7, 4, 2, 3, 45))).toBe('4 Aug, 02:03');
  });

  it('pads the hour and minute', () => {
    expect(formatMatchDateTime(new Date(2026, 7, 4, 9, 5))).toBe('4 Aug, 09:05');
  });

  it('can carry the year too, for the same reason', () => {
    expect(formatMatchDateTime(new Date(2026, 7, 4, 21, 30), true)).toBe('4 Aug 2026, 21:30');
  });
});
