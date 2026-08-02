import { describe, expect, it } from 'vitest';
import { isWicketAllowed } from '../../src/engine/dismissals';
import type { WicketType } from '../../src/engine/types';

/** docs/04-RULES-ENGINE.md §5.2 — one row per wicket type the table covers. */
const TABLE: Array<{
  type: WicketType;
  normal: boolean;
  wide: boolean;
  noBall: boolean;
  freeHit: boolean;
}> = [
  { type: 'bowled', normal: true, wide: false, noBall: false, freeHit: false },
  { type: 'caught', normal: true, wide: false, noBall: false, freeHit: false },
  { type: 'lbw', normal: true, wide: false, noBall: false, freeHit: false },
  { type: 'stumped', normal: true, wide: true, noBall: false, freeHit: false },
  { type: 'hit_wicket', normal: true, wide: false, noBall: false, freeHit: false },
  { type: 'run_out', normal: true, wide: true, noBall: true, freeHit: true },
  { type: 'obstructing_the_field', normal: true, wide: true, noBall: true, freeHit: true },
  { type: 'hit_ball_twice', normal: true, wide: false, noBall: true, freeHit: true },
  { type: 'timed_out', normal: true, wide: false, noBall: false, freeHit: false },
];

describe('legality table — docs/04-RULES-ENGINE.md §5.2', () => {
  for (const row of TABLE) {
    describe(row.type, () => {
      it('normal ball', () => {
        expect(isWicketAllowed(row.type, null, false)).toBe(row.normal);
      });
      it('wide', () => {
        expect(isWicketAllowed(row.type, 'wide', false)).toBe(row.wide);
      });
      it('no-ball', () => {
        expect(isWicketAllowed(row.type, 'no_ball', false)).toBe(row.noBall);
      });
      it('free hit', () => {
        expect(isWicketAllowed(row.type, null, true)).toBe(row.freeHit);
      });
    });
  }

  it('the free-hit rule everyone gets wrong: only run out, obstructing, hit-ball-twice survive', () => {
    const survivors: WicketType[] = ['run_out', 'obstructing_the_field', 'hit_ball_twice'];
    for (const type of TABLE.map((r) => r.type)) {
      expect(isWicketAllowed(type, null, true)).toBe(survivors.includes(type));
    }
  });
});
