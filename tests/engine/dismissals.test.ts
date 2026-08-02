import { describe, expect, it } from 'vitest';
import { isWicketAllowed, isBowlerCredited, countsAsWicket } from '@/engine';
import type { ExtraType, WicketType } from '@/engine';

/**
 * docs/04-RULES-ENGINE.md § 5.2 — one assertion per cell of the legality
 * table. This is the table the whole free-hit rule hangs off, so it is
 * transcribed literally rather than generated, to keep it diffable against
 * the doc.
 */

type Row = {
  wicket: WicketType;
  normal: boolean;
  wide: boolean;
  noBall: boolean;
  freeHit: boolean;
};

const TABLE: Row[] = [
  { wicket: 'bowled', normal: true, wide: false, noBall: false, freeHit: false },
  { wicket: 'caught', normal: true, wide: false, noBall: false, freeHit: false },
  { wicket: 'lbw', normal: true, wide: false, noBall: false, freeHit: false },
  { wicket: 'stumped', normal: true, wide: true, noBall: false, freeHit: false },
  { wicket: 'hit_wicket', normal: true, wide: false, noBall: false, freeHit: false },
  { wicket: 'run_out', normal: true, wide: true, noBall: true, freeHit: true },
  { wicket: 'obstructing_the_field', normal: true, wide: true, noBall: true, freeHit: true },
  { wicket: 'hit_ball_twice', normal: true, wide: false, noBall: true, freeHit: true },
  { wicket: 'timed_out', normal: true, wide: false, noBall: false, freeHit: false },
];

describe('§ 5.2 dismissal legality table', () => {
  describe.each(TABLE)('$wicket', (row) => {
    it(`is ${row.normal ? 'allowed' : 'rejected'} on a normal ball`, () => {
      expect(isWicketAllowed(row.wicket, null, false)).toBe(row.normal);
    });

    it(`is ${row.wide ? 'allowed' : 'rejected'} on a wide`, () => {
      expect(isWicketAllowed(row.wicket, 'wide', false)).toBe(row.wide);
    });

    it(`is ${row.noBall ? 'allowed' : 'rejected'} on a no-ball`, () => {
      expect(isWicketAllowed(row.wicket, 'no_ball', false)).toBe(row.noBall);
    });

    it(`is ${row.freeHit ? 'allowed' : 'rejected'} on a free hit`, () => {
      expect(isWicketAllowed(row.wicket, null, true)).toBe(row.freeHit);
    });
  });

  it('permits exactly three dismissals on a free hit', () => {
    const allowed = TABLE.filter((r) => isWicketAllowed(r.wicket, null, true)).map((r) => r.wicket);
    expect(allowed).toEqual(['run_out', 'obstructing_the_field', 'hit_ball_twice']);
  });

  it('applies both constraints when a free hit is also a wide', () => {
    // hit_ball_twice survives the free-hit column but not the wide column.
    expect(isWicketAllowed('hit_ball_twice', 'wide', true)).toBe(false);
    // run out survives both.
    expect(isWicketAllowed('run_out', 'wide', true)).toBe(true);
    // stumped survives the wide column but not the free-hit column.
    expect(isWicketAllowed('stumped', 'wide', true)).toBe(false);
  });

  it('allows only administrative exits on a penalty award', () => {
    const extras: ExtraType = 'penalty';
    expect(isWicketAllowed('run_out', extras, false)).toBe(false);
    expect(isWicketAllowed('retired_hurt', extras, false)).toBe(true);
    expect(isWicketAllowed('retired_out', extras, false)).toBe(true);
  });

  it('treats byes and leg-byes as legal deliveries for dismissal purposes', () => {
    expect(isWicketAllowed('run_out', 'bye', false)).toBe(true);
    expect(isWicketAllowed('stumped', 'leg_bye', false)).toBe(true);
    // Nothing off the bat can happen on a delivery the bat never touched.
    expect(isWicketAllowed('caught', 'bye', false)).toBe(false);
    expect(isWicketAllowed('lbw', 'bye', false)).toBe(false);
  });
});

describe('§ 5.1 credit table', () => {
  const bowlerCredited: WicketType[] = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'];
  const notCredited: WicketType[] = [
    'run_out',
    'obstructing_the_field',
    'hit_ball_twice',
    'timed_out',
    'retired_out',
    'retired_hurt',
    'handled_the_ball',
  ];

  it.each(bowlerCredited)('credits the bowler for %s', (type) => {
    expect(isBowlerCredited(type)).toBe(true);
  });

  it.each(notCredited)('does not credit the bowler for %s', (type) => {
    expect(isBowlerCredited(type)).toBe(false);
  });

  it('does not count retired hurt as a wicket at all', () => {
    expect(countsAsWicket('retired_hurt')).toBe(false);
    expect(countsAsWicket('retired_out')).toBe(true);
    expect(countsAsWicket('bowled')).toBe(true);
  });
});
