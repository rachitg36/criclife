import { describe, expect, it } from 'vitest';
import { decideLastSuperOver, resolveTiedSuperOvers } from '@/engine/result';
import type { InningsState } from '@/engine/types';

/**
 * "At super over, when the first team scores zero and both wickets are out and
 * the next team scores one run, it's not calculating it as a win. It is going
 * into a loop of starts super over." — 2026-08-04.
 *
 * `resolveTiedSuperOvers` only ever handled a *tied* super over, and the store
 * handed it every super over without first asking who won. So a decided super
 * over came back `type: 'tie'`, the store saw a tie with `superOverOnTie` on,
 * and offered another one. Forever.
 *
 * The name was right and the call site was wrong, which is the kind of bug a
 * type checker cannot see.
 */
function innings(over: Partial<InningsState>): InningsState {
  return {
    inningsNo: 3,
    battingTeamId: 'A',
    bowlingTeamId: 'B',
    isSuperOver: true,
    status: 'completed',
    endReason: 'all_out',
    runs: 0,
    wickets: 0,
    legalBalls: 6,
    target: null,
    batters: {},
    bowlers: {},
    yetToBat: [],
    squadSize: 3,
    ...(over as object),
  } as unknown as InningsState;
}

describe('decideLastSuperOver', () => {
  it('gives it to the side that scored more — the exact reported case', () => {
    const result = decideLastSuperOver([
      innings({ inningsNo: 3, battingTeamId: 'A', runs: 0, wickets: 2 }),
      innings({ inningsNo: 4, battingTeamId: 'B', runs: 1 }),
    ]);
    expect(result?.type).toBe('super_over_win');
    expect(result?.winnerTeamId).toBe('B');
    expect(result?.marginRuns).toBe(1);
  });

  it('gives it to the side that batted first when they defended', () => {
    const result = decideLastSuperOver([
      innings({ inningsNo: 3, battingTeamId: 'A', runs: 12 }),
      innings({ inningsNo: 4, battingTeamId: 'B', runs: 8 }),
    ]);
    expect(result?.winnerTeamId).toBe('A');
    expect(result?.marginRuns).toBe(4);
  });

  it('returns null on a level super over — that one really does go again', () => {
    expect(
      decideLastSuperOver([
        innings({ inningsNo: 3, battingTeamId: 'A', runs: 7 }),
        innings({ inningsNo: 4, battingTeamId: 'B', runs: 7 }),
      ])
    ).toBeNull();
  });

  it('returns null while the chase is still going', () => {
    // Otherwise the match would be declared over partway through the reply.
    expect(
      decideLastSuperOver([
        innings({ inningsNo: 3, battingTeamId: 'A', runs: 9 }),
        innings({ inningsNo: 4, battingTeamId: 'B', runs: 2, status: 'in_progress' }),
      ])
    ).toBeNull();
  });

  it('returns null after only the first super-over innings', () => {
    expect(decideLastSuperOver([innings({ inningsNo: 3, runs: 9 })])).toBeNull();
  });

  it('reads the latest pair, not the first, across repeated super overs', () => {
    const result = decideLastSuperOver([
      innings({ inningsNo: 3, battingTeamId: 'A', runs: 5 }),
      innings({ inningsNo: 4, battingTeamId: 'B', runs: 5 }),
      innings({ inningsNo: 5, battingTeamId: 'A', runs: 11 }),
      innings({ inningsNo: 6, battingTeamId: 'B', runs: 4 }),
    ]);
    expect(result?.winnerTeamId).toBe('A');
    expect(result?.marginRuns).toBe(7);
  });
});

describe('resolveTiedSuperOvers', () => {
  it('no longer calls a decided super over a tie', () => {
    const result = resolveTiedSuperOvers(
      [
        innings({ inningsNo: 3, battingTeamId: 'A', runs: 0, wickets: 2 }),
        innings({ inningsNo: 4, battingTeamId: 'B', runs: 1 }),
      ],
      'A',
      'B',
      false
    );
    // This returning 'tie' is what looped the match.
    expect(result.type).toBe('super_over_win');
    expect(result.winnerTeamId).toBe('B');
  });

  it('still offers another super over when the pair really is level', () => {
    const result = resolveTiedSuperOvers(
      [
        innings({ inningsNo: 3, battingTeamId: 'A', runs: 7 }),
        innings({ inningsNo: 4, battingTeamId: 'B', runs: 7 }),
      ],
      'A',
      'B',
      false
    );
    expect(result.type).toBe('tie');
  });

  it('falls back to boundary countback once attempts are exhausted', () => {
    const withFours = (id: string, fours: number) =>
      innings({
        battingTeamId: id,
        runs: 7,
        batters: { p1: { fours, sixes: 0 } } as unknown as InningsState['batters'],
      });
    const result = resolveTiedSuperOvers([withFours('A', 3), withFours('B', 1)], 'A', 'B', true);
    expect(result.type).toBe('super_over_win');
    expect(result.winnerTeamId).toBe('A');
  });
});
