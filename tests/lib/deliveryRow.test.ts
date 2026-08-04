import { beforeEach, describe, expect, it } from 'vitest';
import { toEngineDelivery, type DeliveryRow } from '@/lib/deliveryRow';
import { isWicketAllowed } from '@/engine/dismissals';
import { resetMonitoring, setErrorSink } from '@/lib/monitoring';

/**
 * `Cannot read properties of undefined (reading 'normal')` — reported on
 * 2026-08-04 from a phone resuming a match and from two laptops opening the
 * public link for it. One self-contradictory row (`is_wicket` with a null
 * `wicket_type`) fed `undefined` into the engine's legality table and blanked
 * the whole match on every screen at once.
 */
function row(over: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    id: 'd1',
    innings_id: 'i1',
    match_id: 'm1',
    seq: 1,
    over_no: 0,
    ball_in_over: 1,
    is_legal: true,
    striker_id: 'p1',
    non_striker_id: 'p2',
    bowler_id: 'b1',
    runs_batter: 4,
    runs_extras: 0,
    extra_type: null,
    runs_total: 4,
    is_wicket: false,
    wicket_type: null,
    dismissed_player_id: null,
    fielder_id: null,
    assist_fielder_id: null,
    is_free_hit: false,
    creates_free_hit: false,
    is_boundary_four: true,
    is_boundary_six: false,
    shot_x: null,
    shot_y: null,
    pitch_x: null,
    pitch_y: null,
    commentary: null,
    scored_by_profile_id: 'u1',
    client_delivery_id: 'c1',
    is_deleted: false,
    created_at: '2026-08-04T00:00:00Z',
    crossed_before_dismissal: null,
    ...over,
  };
}

describe('toEngineDelivery — a wicket with no type', () => {
  beforeEach(() => resetMonitoring());

  it('reads it as not a wicket, matching the repair migration', () => {
    // Migration 20260803191000 already decided what such a row means when it
    // repaired them: `set is_wicket = false`. The client asserted the type was
    // there instead, and threw.
    const d = toEngineDelivery(row({ is_wicket: true, wicket_type: null }));
    expect(d.isWicket).toBe(false);
  });

  it('reports it rather than swallowing it', () => {
    const seen: string[] = [];
    setErrorSink((e) => seen.push(e.message));
    toEngineDelivery(row({ is_wicket: true, wicket_type: null }));
    expect(seen.join(' ')).toContain('DELIVERY_WICKET_WITHOUT_TYPE');
    setErrorSink(null);
  });

  it('leaves a well-formed wicket completely alone', () => {
    const d = toEngineDelivery(
      row({ is_wicket: true, wicket_type: 'bowled', dismissed_player_id: 'p1' })
    );
    expect(d.isWicket).toBe(true);
    expect(d.wicketType).toBe('bowled');
  });

  it('leaves an ordinary ball alone', () => {
    expect(toEngineDelivery(row()).isWicket).toBe(false);
  });
});

describe('isWicketAllowed', () => {
  it('names the bad value instead of throwing a TypeError', () => {
    expect(() =>
      isWicketAllowed(undefined as unknown as 'bowled', null, false)
    ).toThrowError(/UNKNOWN_WICKET_TYPE/);
  });

  it('still answers for every real type', () => {
    expect(isWicketAllowed('bowled', null, false)).toBe(true);
    expect(isWicketAllowed('bowled', 'wide', false)).toBe(false);
    expect(isWicketAllowed('run_out', 'wide', false)).toBe(true);
    expect(isWicketAllowed('caught', null, true)).toBe(false);
  });
});
