import { describe, expect, it } from 'vitest';
import { applyDelivery } from '@/engine/applyDelivery';
import { DEFAULT_CONFIG } from '@/engine/config';
import { checkInningsEnd } from '@/engine/inningsEnd';
import type { MatchConfig } from '@/engine/types';
import { ball, createTestMatch, currentInnings, emptyInnings } from './helpers';

/**
 * Eleven a side is a default, not a rule. `playersPerSide` is a per-match
 * setting and real games are played 2, 3 or 6 a side — the "New match" screen
 * used to refuse anything under 5, which is what prompted this file.
 *
 * Nothing in the engine hard-codes eleven; these tests exist so nothing
 * starts to. All-out is `playersPerSide - 1`, which at the smallest legal
 * size is a single wicket.
 */

describe('a side can be any size from two up', () => {
  it('bowls out a 2-a-side team on one wicket', () => {
    const config: MatchConfig = { ...DEFAULT_CONFIG, playersPerSide: 2, oversPerInnings: 5 };
    // Two players, so nobody is waiting to bat once both are at the crease.
    const state = createTestMatch(config, { yetToBat: [] });

    const result = applyDelivery(
      state,
      ball({ wicket: { type: 'bowled', dismissedPlayerId: 's1' } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);

    expect(innings.wickets).toBe(1);
    // One down out of two is all out. With eleven hard-coded anywhere, this
    // innings would sit open waiting for nine batters who do not exist.
    expect(checkInningsEnd(innings, config)).toBe('all_out');
  });

  it('does not end a 6-a-side innings until five are down', () => {
    const config: MatchConfig = { ...DEFAULT_CONFIG, playersPerSide: 6 };
    expect(checkInningsEnd(emptyInnings({ wickets: 4 }), config)).toBeNull();
    expect(checkInningsEnd(emptyInnings({ wickets: 5 }), config)).toBe('all_out');
  });

  it('gives a last-man-standing 2-a-side team its full complement', () => {
    // lastManStanding raises all-out from playersPerSide - 1 to playersPerSide,
    // which at two a side is the difference between one wicket and two.
    const config: MatchConfig = { ...DEFAULT_CONFIG, playersPerSide: 2, lastManStanding: true };
    expect(checkInningsEnd(emptyInnings({ wickets: 1 }), config)).toBeNull();
    expect(checkInningsEnd(emptyInnings({ wickets: 2 }), config)).toBe('all_out');
  });

  it('keeps eleven working, since that is still what most games are', () => {
    expect(DEFAULT_CONFIG.playersPerSide).toBe(11);
    expect(checkInningsEnd(emptyInnings({ wickets: 9 }), DEFAULT_CONFIG)).toBeNull();
    expect(checkInningsEnd(emptyInnings({ wickets: 10 }), DEFAULT_CONFIG)).toBe('all_out');
  });
});
