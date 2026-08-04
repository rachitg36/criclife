import { describe, expect, it } from 'vitest';
import { restorableCrease, type CreaseMemo } from '@/features/scoring/creaseMemo';

/**
 * Between `start_innings` and the first ball, nothing in the database records
 * who is at the crease — so picking the openers, navigating away and coming
 * back re-asked all three questions. This is the filter that decides what may
 * safely be put back, and its guards matter more than the feature does:
 * getting it wrong walks a dismissed batter back out to bat.
 */
const MEMO: CreaseMemo = { strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'b1' };
const BASE = {
  hasDeliveries: false,
  strikerId: null,
  nonStrikerId: null,
  bowlerId: null,
  yetToBat: ['p1', 'p2', 'p3'],
  bowlingSquad: ['b1', 'b2'],
};

describe('restorableCrease', () => {
  it('restores the pair and the bowler before the first ball', () => {
    expect(restorableCrease(MEMO, BASE)).toEqual(MEMO);
  });

  it('refuses everything once a ball has been bowled', () => {
    // The critical one. After a delivery the log is authoritative, and a null
    // striker means a wicket has just fallen — not "not chosen yet".
    expect(restorableCrease(MEMO, { ...BASE, hasDeliveries: true })).toEqual({
      strikerId: null,
      nonStrikerId: null,
      bowlerId: null,
    });
  });

  it('will not seat a batter who is no longer yet to bat', () => {
    const out = restorableCrease(MEMO, { ...BASE, yetToBat: ['p2', 'p3'] });
    expect(out.strikerId).toBeNull();
    expect(out.nonStrikerId).toBeNull();
  });

  it('drops a stale bowler without losing the openers', () => {
    const out = restorableCrease(MEMO, { ...BASE, bowlingSquad: ['b2'] });
    expect(out.strikerId).toBe('p1');
    expect(out.bowlerId).toBeNull();
  });

  it('restores both ends or neither — a half-filled crease reads as broken', () => {
    const half = { ...MEMO, nonStrikerId: null };
    const out = restorableCrease(half, BASE);
    expect(out.strikerId).toBeNull();
    expect(out.nonStrikerId).toBeNull();
    // The bowler is independent and still comes back.
    expect(out.bowlerId).toBe('b1');
  });

  it('refuses a memo naming the same player at both ends', () => {
    const out = restorableCrease({ ...MEMO, nonStrikerId: 'p1' }, BASE);
    expect(out.strikerId).toBeNull();
  });

  it('leaves an already-seated crease alone', () => {
    const out = restorableCrease(MEMO, { ...BASE, strikerId: 'p3', nonStrikerId: 'p2' });
    expect(out.strikerId).toBeNull();
    expect(out.nonStrikerId).toBeNull();
  });

  it('no memo means no restore', () => {
    expect(restorableCrease(null, BASE)).toEqual({
      strikerId: null,
      nonStrikerId: null,
      bowlerId: null,
    });
  });
});
