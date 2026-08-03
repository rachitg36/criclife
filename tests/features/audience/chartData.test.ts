import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../src/engine/config';
import {
  buildManhattan,
  buildPartnershipBars,
  buildRunRate,
  buildWagonWheel,
  buildWorm,
} from '../../../src/features/audience/chartData';
import { logged, overOf } from './helpers';

const battingTeamOf = (no: number) => (no === 1 ? 'teamA' : 'teamB');

describe('buildWorm', () => {
  it('is empty for an empty log', () => {
    expect(buildWorm([], DEFAULT_CONFIG, battingTeamOf)).toEqual([]);
  });

  it('starts every series at the origin so two innings overlay honestly', () => {
    const [series] = buildWorm(
      [logged({ runsBatter: 4, isBoundaryFour: true })],
      DEFAULT_CONFIG,
      battingTeamOf
    );
    expect(series!.points[0]).toEqual({ overs: 0, runs: 0 });
  });

  it('accumulates runs against overs faced', () => {
    const [series] = buildWorm(
      [logged({ runsBatter: 1 }), logged({ ballInOver: 2, runsBatter: 3 })],
      DEFAULT_CONFIG,
      battingTeamOf
    );
    expect(series!.points.map((p) => p.runs)).toEqual([0, 1, 4]);
    expect(series!.points[2]!.overs).toBeCloseTo(2 / 6);
  });

  it('does not advance overs on an illegal delivery', () => {
    const [series] = buildWorm(
      [logged({ extraType: 'wide', isLegal: false, runsExtras: 1 })],
      DEFAULT_CONFIG,
      battingTeamOf
    );
    expect(series!.points[1]).toEqual({ overs: 0, runs: 1 });
  });

  it('records wickets as their own points', () => {
    const [series] = buildWorm(
      [logged({ isWicket: true, wicketType: 'bowled', dismissedPlayerId: 's1' })],
      DEFAULT_CONFIG,
      battingTeamOf
    );
    expect(series!.wickets).toHaveLength(1);
    expect(series!.wickets[0]!.playerId).toBe('s1');
  });

  it('splits by innings', () => {
    const series = buildWorm(
      [logged({ runsBatter: 1 }), logged({ inningsNo: 2, runsBatter: 5 })],
      DEFAULT_CONFIG,
      battingTeamOf
    );
    expect(series.map((s) => s.inningsNo)).toEqual([1, 2]);
    expect(series[1]!.battingTeamId).toBe('teamB');
  });
});

describe('buildManhattan', () => {
  it('buckets runs by over, 1-indexed for display', () => {
    const bars = buildManhattan(
      [
        logged({ overNo: 0, runsBatter: 4 }),
        logged({ overNo: 0, ballInOver: 2, runsBatter: 2 }),
        logged({ overNo: 1, runsBatter: 1 }),
      ],
      battingTeamOf
    );
    expect(bars[0]!.bars).toEqual([
      { overNumber: 1, runs: 6, wickets: 0 },
      { overNumber: 2, runs: 1, wickets: 0 },
    ]);
  });

  it('counts wickets per over but not a retired hurt', () => {
    const bars = buildManhattan(
      [
        logged({ overNo: 0, isWicket: true, wicketType: 'lbw', dismissedPlayerId: 's1' }),
        logged({ overNo: 0, isWicket: true, wicketType: 'retired_hurt', dismissedPlayerId: 'ns1' }),
      ],
      battingTeamOf
    );
    expect(bars[0]!.bars[0]!.wickets).toBe(1);
  });
});

describe('buildRunRate', () => {
  const oversOf = () => 20;

  it('only plots completed overs', () => {
    const partial = buildRunRate(overOf(3, 0), DEFAULT_CONFIG, battingTeamOf, () => null, oversOf);
    expect(partial[0]!.points).toEqual([]);

    const complete = buildRunRate(
      overOf(6, 0, { runsBatter: 1 }),
      DEFAULT_CONFIG,
      battingTeamOf,
      () => null,
      oversOf
    );
    expect(complete[0]!.points).toHaveLength(1);
    expect(complete[0]!.points[0]).toMatchObject({ overNumber: 1, crr: 6, rrr: null });
  });

  it('carries no required rate in an innings with no target', () => {
    const series = buildRunRate(
      overOf(6, 0, { runsBatter: 1 }),
      DEFAULT_CONFIG,
      battingTeamOf,
      () => null,
      oversOf
    );
    expect(series[0]!.points.every((p) => p.rrr === null)).toBe(true);
  });

  it('computes a required rate when chasing', () => {
    const series = buildRunRate(
      overOf(6, 0, { inningsNo: 2, runsBatter: 1 }),
      DEFAULT_CONFIG,
      battingTeamOf,
      () => 121,
      oversOf
    );
    // 6 scored, 115 needed off 114 balls = 19 overs.
    expect(series[0]!.points[0]!.rrr).toBeCloseTo(115 / 19);
  });

  it('drops the required rate once the target is passed rather than going negative', () => {
    const series = buildRunRate(
      overOf(6, 0, { inningsNo: 2, runsBatter: 4 }),
      DEFAULT_CONFIG,
      battingTeamOf,
      () => 10,
      oversOf
    );
    expect(series[0]!.points[0]!.rrr).toBeNull();
  });
});

describe('buildPartnershipBars', () => {
  it('splits a stand by who actually scored the runs', () => {
    const bars = buildPartnershipBars(
      [
        logged({ strikerId: 's1', runsBatter: 4 }),
        logged({ strikerId: 'ns1', nonStrikerId: 's1', ballInOver: 2, runsBatter: 2 }),
      ],
      1
    );
    expect(bars).toHaveLength(1);
    expect(bars[0]!.runs).toBe(6);
    expect(bars[0]!.batters).toEqual([
      { playerId: 's1', runs: 4, balls: 1 },
      { playerId: 'ns1', runs: 2, balls: 1 },
    ]);
    expect(bars[0]!.unbroken).toBe(true);
  });

  it('credits extras to the stand but to neither batter', () => {
    const bars = buildPartnershipBars(
      [logged({ extraType: 'leg_bye', runsExtras: 4, isLegal: true })],
      1
    );
    expect(bars[0]!.runs).toBe(4);
    expect(bars[0]!.batters.every((b) => b.runs === 0)).toBe(true);
  });

  it('does not count a wide as a ball faced', () => {
    const bars = buildPartnershipBars(
      [logged({ extraType: 'wide', isLegal: false, runsExtras: 1 })],
      1
    );
    expect(bars[0]!.batters.find((b) => b.playerId === 's1')!.balls).toBe(0);
  });

  it('closes a stand on a wicket and opens the next', () => {
    const bars = buildPartnershipBars(
      [
        logged({ runsBatter: 10 }),
        logged({ ballInOver: 2, isWicket: true, wicketType: 'bowled', dismissedPlayerId: 's1' }),
        logged({ ballInOver: 3, strikerId: 's2', runsBatter: 3 }),
      ],
      1
    );
    expect(bars).toHaveLength(2);
    expect(bars[0]!).toMatchObject({ wicketNumber: 1, runs: 10, unbroken: false });
    expect(bars[1]!).toMatchObject({ wicketNumber: 2, runs: 3, unbroken: true });
  });

  it('ignores other innings', () => {
    expect(buildPartnershipBars([logged({ inningsNo: 2, runsBatter: 4 })], 1)).toEqual([]);
  });
});

describe('buildWagonWheel', () => {
  it('is empty when the scorer never used Advanced Mode', () => {
    expect(buildWagonWheel([logged({ runsBatter: 4 })], 1)).toEqual([]);
  });

  it('returns only scoring shots with coordinates', () => {
    const shots = buildWagonWheel(
      [
        logged({ runsBatter: 4, shot: { x: 0.4, y: -0.7 } }),
        logged({ ballInOver: 2, runsBatter: 0, shot: { x: 0.1, y: 0.1 } }),
        logged({ ballInOver: 3, runsBatter: 2 }),
      ],
      1
    );
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ runs: 4, x: 0.4, y: -0.7, playerId: 's1' });
  });

  it('filters to one batter when asked', () => {
    const log = [
      logged({ runsBatter: 4, shot: { x: 0.4, y: -0.7 } }),
      logged({ ballInOver: 2, strikerId: 'ns1', runsBatter: 6, shot: { x: -0.2, y: -0.9 } }),
    ];
    expect(buildWagonWheel(log, 1, 'ns1')).toHaveLength(1);
    expect(buildWagonWheel(log, 1)).toHaveLength(2);
  });
});
