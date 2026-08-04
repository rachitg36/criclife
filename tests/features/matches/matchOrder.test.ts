import { describe, expect, it } from 'vitest';
import { groupMatches, matchSortKey } from '@/features/matches/matchGroups';
import type { MatchStatus } from '@/engine/types';

/**
 * "The test4 game is not available at the home screen. This was the most
 * recent game that was played." — 2026-08-04.
 *
 * Ordering was on `scheduled_at` alone, with nulls pushed to the bottom. A
 * match created without a date therefore sorted *below* every older match that
 * had one, so the game finished twenty minutes ago never made Home's top
 * three. The bug hid the single most interesting row on the screen, and it was
 * invisible on any test data where every match happens to carry a date.
 */
function m(over: Partial<Record<string, unknown>>) {
  return {
    id: 'x',
    status: 'completed' as MatchStatus,
    scheduled_at: null,
    completed_at: null,
    created_at: null,
    ...over,
  } as {
    id: string;
    status: MatchStatus;
    scheduled_at: string | null;
    completed_at: string | null;
    created_at: string | null;
  };
}

describe('matchSortKey', () => {
  it('prefers completed_at — for a finished match that is what happened', () => {
    expect(
      matchSortKey({ completed_at: '2026-08-04T12:00:00Z', scheduled_at: '2026-01-01T00:00:00Z' })
    ).toBe('2026-08-04T12:00:00Z');
  });

  it('falls back to scheduled_at when the match has not finished', () => {
    expect(matchSortKey({ completed_at: null, scheduled_at: '2026-08-05T09:00:00Z' })).toBe(
      '2026-08-05T09:00:00Z'
    );
  });

  it('falls back to created_at rather than nothing', () => {
    expect(
      matchSortKey({ completed_at: null, scheduled_at: null, created_at: '2026-08-04T11:00:00Z' })
    ).toBe('2026-08-04T11:00:00Z');
  });
});

describe('groupMatches ordering', () => {
  it('puts a dateless match played today above older dated ones', () => {
    const { finished } = groupMatches([
      m({ id: 'old-dated', scheduled_at: '2026-07-01T10:00:00Z' }),
      m({ id: 'older-dated', scheduled_at: '2026-06-01T10:00:00Z' }),
      // No `scheduled_at` — created and completed today. This is the row that
      // used to sink to the bottom.
      m({ id: 'test4', created_at: '2026-08-04T18:00:00Z', completed_at: '2026-08-04T19:00:00Z' }),
    ]);

    expect(finished.map((x) => x.id)).toEqual(['test4', 'old-dated', 'older-dated']);
  });

  it('still orders by when a match finished, not when it was booked', () => {
    const { finished } = groupMatches([
      m({ id: 'booked-later', scheduled_at: '2026-08-09T10:00:00Z', completed_at: null }),
      m({ id: 'played-today', completed_at: '2026-08-04T19:00:00Z' }),
    ]);
    // A match with a future `scheduled_at` but no completion still sorts on
    // that date — the point is only that a real completion wins over an
    // intention on the *same* row.
    expect(finished[0]!.id).toBe('booked-later');
  });

  it('keeps live matches in their own group regardless of dates', () => {
    const { live, finished } = groupMatches([
      m({ id: 'live-now', status: 'live', created_at: '2026-01-01T00:00:00Z' }),
      m({ id: 'done', completed_at: '2026-08-04T19:00:00Z' }),
    ]);
    expect(live.map((x) => x.id)).toEqual(['live-now']);
    expect(finished.map((x) => x.id)).toEqual(['done']);
  });
});
