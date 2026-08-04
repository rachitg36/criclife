import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import {
  computeMatchResult,
  DEFAULT_MAX_SUPER_OVER_ATTEMPTS,
  resolveTiedSuperOvers,
  superOverConfig,
} from '../../src/engine/result';
import { emptyInnings } from './helpers';

describe('computeMatchResult — docs/04-RULES-ENGINE.md §7.2', () => {
  it('chasing team reaching the target wins by wickets in hand', () => {
    const innings1 = emptyInnings({ inningsNo: 1, battingTeamId: 'A', runs: 150 });
    const innings2 = emptyInnings({
      inningsNo: 2,
      battingTeamId: 'B',
      runs: 151,
      wickets: 3,
      target: 151,
    });
    const result = computeMatchResult(innings1, innings2, DEFAULT_CONFIG);
    expect(result).toEqual({
      type: 'win',
      winnerTeamId: 'B',
      marginRuns: null,
      marginWickets: 7,
      text: 'B won by 7 wickets',
    });
  });

  it('singular "1 wicket" when only one wicket separates the sides', () => {
    const innings1 = emptyInnings({ inningsNo: 1, battingTeamId: 'A', runs: 150 });
    const innings2 = emptyInnings({
      inningsNo: 2,
      battingTeamId: 'B',
      runs: 151,
      wickets: 9,
      target: 151,
    });
    const result = computeMatchResult(innings1, innings2, DEFAULT_CONFIG);
    expect(result.marginWickets).toBe(1);
    expect(result.text).toBe('B won by 1 wicket');
  });

  it('finishing exactly one short of the target is a tie', () => {
    const innings1 = emptyInnings({ inningsNo: 1, battingTeamId: 'A', runs: 150 });
    const innings2 = emptyInnings({
      inningsNo: 2,
      battingTeamId: 'B',
      runs: 150,
      wickets: 10,
      target: 151,
    });
    const result = computeMatchResult(innings1, innings2, DEFAULT_CONFIG);
    expect(result).toEqual({
      type: 'tie',
      winnerTeamId: null,
      marginRuns: null,
      marginWickets: null,
      text: 'Match tied',
    });
  });

  it('defending team wins by the runs margin when the chase falls short', () => {
    const innings1 = emptyInnings({ inningsNo: 1, battingTeamId: 'A', runs: 150 });
    const innings2 = emptyInnings({
      inningsNo: 2,
      battingTeamId: 'B',
      runs: 120,
      wickets: 10,
      target: 151,
    });
    const result = computeMatchResult(innings1, innings2, DEFAULT_CONFIG);
    expect(result).toEqual({
      type: 'win',
      winnerTeamId: 'A',
      marginRuns: 30,
      marginWickets: null,
      text: 'A won by 30 runs',
    });
  });

  it('singular "1 run" when the margin is exactly one', () => {
    const innings1 = emptyInnings({ inningsNo: 1, battingTeamId: 'A', runs: 150 });
    const innings2 = emptyInnings({
      inningsNo: 2,
      battingTeamId: 'B',
      runs: 149,
      wickets: 10,
      target: 151,
    });
    const result = computeMatchResult(innings1, innings2, DEFAULT_CONFIG);
    expect(result.marginRuns).toBe(1);
    expect(result.text).toBe('A won by 1 run');
  });

  it('in last-man-standing, wickets in hand is out of playersPerSide (not playersPerSide - 1)', () => {
    const config = { ...DEFAULT_CONFIG, playersPerSide: 8, lastManStanding: true };
    const innings1 = emptyInnings({ inningsNo: 1, battingTeamId: 'A', runs: 100 });
    const innings2 = emptyInnings({
      inningsNo: 2,
      battingTeamId: 'B',
      runs: 101,
      wickets: 6,
      target: 101,
    });
    const result = computeMatchResult(innings1, innings2, config);
    // 8 (playersPerSide, not 7) - 6 wickets lost = 2 in hand.
    expect(result.marginWickets).toBe(2);
  });

  it('falls back to innings1.runs + 1 when innings2.target is unset', () => {
    const innings1 = emptyInnings({ inningsNo: 1, battingTeamId: 'A', runs: 150 });
    const innings2 = emptyInnings({ inningsNo: 2, battingTeamId: 'B', runs: 100, target: null });
    const result = computeMatchResult(innings1, innings2, DEFAULT_CONFIG);
    expect(result.type).toBe('win');
    expect(result.winnerTeamId).toBe('A');
    expect(result.marginRuns).toBe(50);
  });
});

describe('superOverConfig', () => {
  it('is 1 over, 3 a side, no powerplays, never last-man-standing', () => {
    const base = {
      ...DEFAULT_CONFIG,
      lastManStanding: true,
      powerplays: [{ name: 'PP1', fromOver: 1, toOver: 6, fieldersOutside: 2 }],
    };
    const config = superOverConfig(base);
    expect(config.oversPerInnings).toBe(1);
    expect(config.playersPerSide).toBe(3);
    expect(config.maxOversPerBowler).toBe(1);
    expect(config.powerplays).toEqual([]);
    expect(config.lastManStanding).toBe(false);
    // Everything else is inherited from the base match config.
    expect(config.wideRuns).toBe(base.wideRuns);
  });
});

describe('resolveTiedSuperOvers', () => {
  it('another tied super over (attempts not exhausted) just says tied', () => {
    const result = resolveTiedSuperOvers([], 'A', 'B', false);
    expect(result.type).toBe('tie');
    expect(result.text).toBe('Super over tied');
  });

  it('exhausted attempts: more boundaries wins on countback', () => {
    const innings1 = emptyInnings({
      inningsNo: 1,
      battingTeamId: 'A',
      batters: {
        p1: {
          playerId: 'p1',
          position: 1,
          runs: 20,
          balls: 10,
          fours: 3,
          sixes: 1,
          status: 'not_out',
          dismissal: null,
        },
      },
    });
    const innings2 = emptyInnings({
      inningsNo: 2,
      battingTeamId: 'B',
      batters: {
        p2: {
          playerId: 'p2',
          position: 1,
          runs: 20,
          balls: 10,
          fours: 1,
          sixes: 0,
          status: 'not_out',
          dismissal: null,
        },
      },
    });
    const result = resolveTiedSuperOvers([innings1, innings2], 'A', 'B', true);
    expect(result.type).toBe('super_over_win');
    expect(result.winnerTeamId).toBe('A');
    expect(result.text).toContain('boundary countback');
  });

  it('exhausted attempts: equal boundaries too is a declared tie', () => {
    const innings1 = emptyInnings({
      inningsNo: 1,
      battingTeamId: 'A',
      batters: {
        p1: {
          playerId: 'p1',
          position: 1,
          runs: 10,
          balls: 10,
          fours: 1,
          sixes: 0,
          status: 'not_out',
          dismissal: null,
        },
      },
    });
    const innings2 = emptyInnings({
      inningsNo: 2,
      battingTeamId: 'B',
      batters: {
        p2: {
          playerId: 'p2',
          position: 1,
          runs: 10,
          balls: 10,
          fours: 1,
          sixes: 0,
          status: 'not_out',
          dismissal: null,
        },
      },
    });
    const result = resolveTiedSuperOvers([innings1, innings2], 'A', 'B', true);
    expect(result.type).toBe('tie');
    expect(result.text).toBe('Match tied — boundary countback also level');
  });

  it('exhausted attempts: the other team wins on countback when they hit more boundaries', () => {
    const innings1 = emptyInnings({
      inningsNo: 1,
      battingTeamId: 'A',
      batters: {
        p1: {
          playerId: 'p1',
          position: 1,
          runs: 10,
          balls: 10,
          fours: 1,
          sixes: 0,
          status: 'not_out',
          dismissal: null,
        },
      },
    });
    const innings2 = emptyInnings({
      inningsNo: 2,
      battingTeamId: 'B',
      batters: {
        p2: {
          playerId: 'p2',
          position: 1,
          runs: 10,
          balls: 10,
          fours: 3,
          sixes: 1,
          status: 'not_out',
          dismissal: null,
        },
      },
    });
    const result = resolveTiedSuperOvers([innings1, innings2], 'A', 'B', true);
    expect(result.type).toBe('super_over_win');
    expect(result.winnerTeamId).toBe('B');
  });

  it("a team's own boundaries only count from innings where they actually batted", () => {
    // innings1 batted by A; teamBoundaryCount for B against innings1 must be 0.
    const innings1 = emptyInnings({
      inningsNo: 1,
      battingTeamId: 'A',
      batters: {
        p1: {
          playerId: 'p1',
          position: 1,
          runs: 10,
          balls: 10,
          fours: 2,
          sixes: 0,
          status: 'not_out',
          dismissal: null,
        },
      },
    });
    const result = resolveTiedSuperOvers([innings1], 'A', 'B', true);
    expect(result.winnerTeamId).toBe('A');
  });

  it('DEFAULT_MAX_SUPER_OVER_ATTEMPTS is 3', () => {
    expect(DEFAULT_MAX_SUPER_OVER_ATTEMPTS).toBe(3);
  });
});
