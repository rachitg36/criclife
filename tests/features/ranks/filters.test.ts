import { describe, expect, it } from 'vitest';
import {
  buildBoard,
  filterFromSearchParams,
  filterToSearchParams,
  qualificationProgress,
  qualifies,
} from '@/features/ranks/filters';
import { DEFAULT_FILTER, type Board, type RankPlayer } from '@/features/ranks/types';

/**
 * docs/12's Phase 8 acceptance bar, in words: "filtering by two teams
 * renumbers correctly while preserving global ranks as ghost numbers".
 */

function player(overrides: Partial<RankPlayer> & { playerId: string }): RankPlayer {
  return {
    displayName: overrides.playerId,
    photoUrl: null,
    role: null,
    teamIds: [],
    // Comfortably qualified on every board unless a test says otherwise.
    matches: 20,
    inningsBatted: 20,
    inningsBowled: 20,
    ballsFaced: 500,
    ballsBowled: 500,
    ratings: { overall: 0, batting: 0, bowling: 0, allrounder: 0, fielding: 0 },
    ...overrides,
  };
}

function rated(id: string, overall: number, teamIds: string[] = []): RankPlayer {
  return player({
    playerId: id,
    teamIds,
    ratings: { overall, batting: overall, bowling: overall, allrounder: overall, fielding: overall },
  });
}

const filter = (over: Partial<typeof DEFAULT_FILTER> = {}) => ({ ...DEFAULT_FILTER, ...over });

describe('buildBoard — ranking and filtering', () => {
  const squad = [
    rated('a', 900, ['mum']),
    rated('b', 800, ['che']),
    rated('c', 700, ['mum']),
    rated('d', 600, ['rcb']),
    rated('e', 500, ['che']),
  ];

  it('ranks by rating, highest first', () => {
    const { ranked } = buildBoard(squad, filter());
    expect(ranked.map((r) => r.player.playerId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('opens unfiltered — every player of every team', () => {
    expect(buildBoard(squad, filter()).ranked).toHaveLength(5);
  });

  it('renumbers from 1 within a filtered set', () => {
    const { ranked } = buildBoard(squad, filter({ teamIds: ['che'] }));
    expect(ranked.map((r) => r.player.playerId)).toEqual(['b', 'e']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('preserves the global rank as a ghost number when filtered', () => {
    const { ranked } = buildBoard(squad, filter({ teamIds: ['che'] }));
    expect(ranked.map((r) => r.globalRank)).toEqual([2, 5]);
  });

  it('does not change any rating when filtered — the population narrows, the numbers do not', () => {
    const unfiltered = buildBoard(squad, filter());
    const filtered = buildBoard(squad, filter({ teamIds: ['che'] }));
    for (const row of filtered.ranked) {
      const same = unfiltered.ranked.find((r) => r.player.playerId === row.player.playerId);
      expect(row.rating).toBe(same!.rating);
    }
  });

  it('filters by two teams as a union', () => {
    const { ranked } = buildBoard(squad, filter({ teamIds: ['mum', 'che'] }));
    expect(ranked.map((r) => r.player.playerId)).toEqual(['a', 'b', 'c', 'e']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(ranked.map((r) => r.globalRank)).toEqual([1, 2, 3, 5]);
  });

  it('switches to intersection when "match all teams" is on', () => {
    const both = [...squad, rated('f', 650, ['mum', 'che'])];
    const union = buildBoard(both, filter({ teamIds: ['mum', 'che'] }));
    const inter = buildBoard(both, filter({ teamIds: ['mum', 'che'], matchAllTeams: true }));
    expect(union.ranked).toHaveLength(5);
    expect(inter.ranked.map((r) => r.player.playerId)).toEqual(['f']);
  });

  it('leaves out players with no rating on this board rather than ranking them at zero', () => {
    const noBowling = player({
      playerId: 'keeper',
      ratings: { overall: 950, batting: 950, bowling: null, allrounder: null, fielding: 950 },
    });
    const board = buildBoard([...squad, noBowling], filter({ board: 'bowling' }));
    expect(board.ranked.map((r) => r.player.playerId)).not.toContain('keeper');
    expect(buildBoard([...squad, noBowling], filter()).ranked[0]!.player.playerId).toBe('keeper');
  });

  it('is empty, not broken, with no players at all', () => {
    expect(buildBoard([], filter())).toEqual({ ranked: [], emerging: [] });
  });
});

describe('qualification', () => {
  it('separates emerging players from the ranked board', () => {
    const newcomer = player({
      playerId: 'new',
      matches: 2,
      ratings: { overall: 999, batting: 999, bowling: 999, allrounder: 999, fielding: 999 },
    });
    const board = buildBoard([rated('a', 500), newcomer], filter());
    expect(board.ranked.map((r) => r.player.playerId)).toEqual(['a']);
    expect(board.emerging.map((r) => r.player.playerId)).toEqual(['new']);
  });

  it('gives an emerging player no global rank — there is no position to ghost', () => {
    const newcomer = player({ playerId: 'new', matches: 2 });
    const board = buildBoard([rated('a', 500), newcomer], filter());
    expect(board.emerging[0]!.globalRank).toBeNull();
  });

  it('requires both batting and bowling for the all-rounder board', () => {
    const batOnly = player({ playerId: 'bat', inningsBowled: 0, ballsBowled: 0 });
    expect(qualifies(batOnly, 'batting')).toBe(true);
    expect(qualifies(batOnly, 'bowling')).toBe(false);
    expect(qualifies(batOnly, 'allrounder')).toBe(false);
  });

  it('reports progress against the binding requirement, not the easiest one', () => {
    // Plenty of innings, almost no balls faced: the balls are what is missing.
    const p = player({ playerId: 'p', inningsBatted: 20, ballsFaced: 6 });
    expect(qualificationProgress(p, 'batting')).toBeCloseTo(6 / 60);
  });

  it('caps progress at 1', () => {
    expect(qualificationProgress(player({ playerId: 'p' }), 'overall')).toBe(1);
  });
});

describe('confidence', () => {
  it('reaches full confidence at 15 matches and scales below it', () => {
    const board = buildBoard([rated('a', 500), player({ playerId: 'b', matches: 5 })], filter());
    const all = [...board.ranked, ...board.emerging];
    expect(all.find((r) => r.player.playerId === 'a')!.confidence).toBe(1);
    expect(all.find((r) => r.player.playerId === 'b')!.confidence).toBeCloseTo(5 / 15);
  });
});

describe('movement', () => {
  it('attaches movement per board, not per player', () => {
    const movement = new Map([
      ['overall:a', 3],
      ['batting:a', -1],
    ]);
    expect(buildBoard([rated('a', 500)], filter(), movement).ranked[0]!.movement).toBe(3);
    expect(
      buildBoard([rated('a', 500)], filter({ board: 'batting' }), movement).ranked[0]!.movement
    ).toBe(-1);
  });

  it('is null when there is nothing to compare against', () => {
    expect(buildBoard([rated('a', 500)], filter()).ranked[0]!.movement).toBeNull();
  });
});

describe('URL encoding', () => {
  it('omits everything at its default so a clean board has a clean URL', () => {
    expect(filterToSearchParams(DEFAULT_FILTER).toString()).toBe('');
  });

  it('round-trips a filtered board', () => {
    const original = filter({
      board: 'bowling' as Board,
      teamIds: ['mum', 'che'],
      matchAllTeams: true,
      role: 'bowler',
      minMatches: 3,
      includeShadowPlayers: false,
    });
    expect(filterFromSearchParams(filterToSearchParams(original))).toEqual(original);
  });

  it('falls back to the default board when the URL names one that does not exist', () => {
    expect(filterFromSearchParams(new URLSearchParams('board=nonsense')).board).toBe('overall');
  });

  it('ignores a non-numeric min-matches rather than filtering everyone out', () => {
    expect(filterFromSearchParams(new URLSearchParams('min=abc')).minMatches).toBeNull();
  });
});
