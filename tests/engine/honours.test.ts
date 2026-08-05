import { describe, expect, it } from 'vitest';
import { buildHonours, playerOfTheMatch, winningSidePlayers } from '@/engine/honours';
import type { InningsState } from '@/engine/types';

/**
 * The figures the celebration screen names.
 *
 * In the engine rather than in a component because "the best innings of the
 * match" is a question about the delivery log, and the scorer's phone and
 * every spectator's screen have to answer it identically. A match where the
 * pad and the public link credit different players is worse than one that
 * credits nobody.
 */
function innings(over: Partial<InningsState>): InningsState {
  return {
    inningsNo: 1,
    battingTeamId: 'A',
    bowlingTeamId: 'B',
    isSuperOver: false,
    status: 'completed',
    runs: 0,
    wickets: 0,
    legalBalls: 120,
    batters: {},
    bowlers: {},
    yetToBat: [],
    ...(over as object),
  } as unknown as InningsState;
}

const bat = (runs: number, position: number, out = true) =>
  ({ runs, position, balls: runs, status: out ? 'out' : 'not_out' }) as unknown as never;
const bowl = (wickets: number, runsConceded: number) =>
  ({ wickets, runsConceded, legalBalls: 24 }) as unknown as never;
/** A batter with a stated balls-faced, for the tempo comparisons. */
const fast = (runs: number, balls: number) =>
  ({ runs, balls, position: 1, status: 'not_out' }) as unknown as never;

describe('buildHonours', () => {
  it('finds the top score and marks it not out', () => {
    const h = buildHonours([
      innings({ batters: { p1: bat(64, 1, false), p2: bat(31, 2) } as never }),
    ]);
    expect(h.topScore).toEqual({ playerId: 'p1', figures: '64*' });
  });

  it('breaks a bowling tie on runs conceded, not on order', () => {
    const h = buildHonours([
      innings({ bowlers: { b1: bowl(3, 34), b2: bowl(3, 21) } as never }),
    ]);
    expect(h.bestBowling).toEqual({ playerId: 'b2', figures: '3-21' });
  });

  it('ignores a bowler who took nothing, however cheap', () => {
    const h = buildHonours([innings({ bowlers: { b1: bowl(0, 4) } as never })]);
    expect(h.bestBowling).toBeNull();
  });

  it('ignores super overs — 11 off 4 balls is not the innings of the match', () => {
    const h = buildHonours([
      innings({ batters: { p1: bat(38, 1) } as never }),
      innings({ inningsNo: 3, isSuperOver: true, batters: { p9: bat(45, 1) } as never }),
    ]);
    expect(h.topScore?.playerId).toBe('p1');
  });

  it('returns nothing at all for a match where nobody scored or took a wicket', () => {
    expect(buildHonours([innings({})])).toEqual({ topScore: null, bestBowling: null });
  });
});

describe('winningSidePlayers', () => {
  it('lists the batting order, then whoever is still to bat', () => {
    const list = winningSidePlayers(
      [
        innings({
          battingTeamId: 'A',
          batters: { p2: bat(10, 2), p1: bat(40, 1) } as never,
          yetToBat: ['p3', 'p4'],
        }),
      ],
      'A'
    );
    expect(list).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('picks up a bowler who never batted — they still won the match', () => {
    const list = winningSidePlayers(
      [
        innings({ battingTeamId: 'B', bowlingTeamId: 'A', bowlers: { a9: bowl(2, 12) } as never }),
        innings({ inningsNo: 2, battingTeamId: 'A', batters: { a1: bat(20, 1) } as never }),
      ],
      'A'
    );
    expect(list).toContain('a9');
    expect(list).toContain('a1');
  });

  it('never repeats a player who both batted and bowled', () => {
    const list = winningSidePlayers(
      [
        innings({ battingTeamId: 'B', bowlingTeamId: 'A', bowlers: { a1: bowl(1, 9) } as never }),
        innings({ inningsNo: 2, battingTeamId: 'A', batters: { a1: bat(20, 1) } as never }),
      ],
      'A'
    );
    expect(list.filter((id) => id === 'a1')).toHaveLength(1);
  });
});

/**
 * Player of the match.
 *
 * **There is no ICC rule.** Checked on 2026-08-05: neither the Laws nor the
 * playing conditions define the award — internationally it is decided
 * subjectively by a panel after the game, with no points system and no
 * requirement that the winner be on the winning side. So these tests pin
 * *CricLife's* arithmetic, and the screens that show it say as much.
 */
describe('playerOfTheMatch', () => {
  it('prefers a match-winning innings over a modest one', () => {
    const pom = playerOfTheMatch(
      [
        innings({
          runs: 100,
          legalBalls: 120,
          batters: { p1: bat(80, 1, false), p2: bat(10, 2) } as never,
        }),
      ],
      'A'
    );
    expect(pom?.playerId).toBe('p1');
    expect(pom?.summary).toContain('80*');
  });

  it('rates the same runs higher when they came faster', () => {
    const quick = playerOfTheMatch(
      [innings({ runs: 60, legalBalls: 120, batters: { p1: fast(30, 15) } as never })],
      'A'
    );
    const slow = playerOfTheMatch(
      [innings({ runs: 60, legalBalls: 120, batters: { p1: fast(30, 50) } as never })],
      'A'
    );
    expect(quick!.points).toBeGreaterThan(slow!.points);
  });

  it('can pick a bowler over a batter — wickets carry real weight', () => {
    const pom = playerOfTheMatch(
      [
        innings({
          runs: 90,
          legalBalls: 120,
          batters: { p1: bat(28, 1) } as never,
          bowlers: { b1: bowl(4, 12) } as never,
        }),
      ],
      'A'
    );
    expect(pom?.playerId).toBe('b1');
    expect(pom?.summary).toContain('4-12');
  });

  it('ignores super overs, like every other honour here', () => {
    const pom = playerOfTheMatch(
      [
        innings({ runs: 60, legalBalls: 120, batters: { p1: bat(50, 1) } as never }),
        innings({
          inningsNo: 3,
          isSuperOver: true,
          runs: 25,
          legalBalls: 6,
          batters: { p9: bat(25, 1) } as never,
        }),
      ],
      'A'
    );
    expect(pom?.playerId).toBe('p1');
  });

  it('returns nothing when no ball has been bowled', () => {
    expect(playerOfTheMatch([innings({ legalBalls: 0 })], null)).toBeNull();
  });
});
