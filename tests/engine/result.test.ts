import { describe, expect, it } from 'vitest';
import {
  MAX_SUPER_OVERS,
  boundaryCountback,
  computeResult,
  configForInnings,
  createInnings,
  createMatch,
  makeConfig,
  needsSuperOver,
  superOverConfig,
  superOverCount,
  type InningsState,
} from '@/engine';
import { AWAY, HOME, harness, innings } from './harness';

/** A finished innings with the given score, for result arithmetic. */
function finished(
  runs: number,
  wickets: number,
  opts: { battingTeamId?: string; target?: number | null; isSuperOver?: boolean } = {}
): InningsState {
  const i = createInnings({
    inningsNo: 1,
    battingTeamId: opts.battingTeamId ?? HOME,
    bowlingTeamId: opts.battingTeamId === AWAY ? HOME : AWAY,
    battingOrder: ['x1', 'x2', 'x3'],
    target: opts.target ?? null,
    isSuperOver: opts.isSuperOver ?? false,
  });
  i.runs = runs;
  i.wickets = wickets;
  i.status = 'completed';
  return i;
}

describe('§ 7.2 match result', () => {
  const config = makeConfig({ playersPerSide: 11 });

  it('gives the chasing side a win by wickets', () => {
    const first = finished(150, 8);
    const second = finished(151, 4, { battingTeamId: AWAY, target: 151 });

    const result = computeResult(first, second, config);
    expect(result).toEqual({
      kind: 'win',
      winnerTeamId: AWAY,
      margin: { by: 'wickets', value: 6 },
      viaSuperOver: false,
      text: 'won by 6 wickets',
    });
  });

  it('uses the singular for a one-wicket win', () => {
    const first = finished(100, 10);
    const second = finished(101, 9, { battingTeamId: AWAY, target: 101 });
    expect(computeResult(first, second, config).text).toBe('won by 1 wicket');
  });

  it('declares a tie when the chase finishes exactly one short', () => {
    const first = finished(150, 8);
    const second = finished(150, 10, { battingTeamId: AWAY, target: 151 });

    const result = computeResult(first, second, config);
    expect(result.kind).toBe('tie');
    expect(result.winnerTeamId).toBeNull();
    expect(result.margin).toBeNull();
    expect(result.text).toBe('match tied');
  });

  it('gives the defending side a win by runs', () => {
    const first = finished(150, 8);
    const second = finished(138, 10, { battingTeamId: AWAY, target: 151 });

    const result = computeResult(first, second, config);
    expect(result).toEqual({
      kind: 'win',
      winnerTeamId: HOME,
      margin: { by: 'runs', value: 12 },
      viaSuperOver: false,
      text: 'won by 12 runs',
    });
  });

  it('uses the singular for a one-run win', () => {
    const first = finished(150, 8);
    const second = finished(149, 10, { battingTeamId: AWAY, target: 151 });
    expect(computeResult(first, second, config).text).toBe('won by 1 run');
  });

  it('derives the target from the first innings when none was set', () => {
    const first = finished(80, 10);
    const second = finished(80, 10, { battingTeamId: AWAY, target: null });
    // 80 chasing an implied 81 is a tie.
    expect(computeResult(first, second, config).kind).toBe('tie');
  });

  it('honours a rain-revised target over the original', () => {
    const first = finished(200, 6);
    const second = finished(150, 4, { battingTeamId: AWAY, target: 201 });
    second.revisedTarget = 150;
    expect(computeResult(first, second, config).kind).toBe('win');
    expect(computeResult(first, second, config).winnerTeamId).toBe(AWAY);
  });

  it('marks a result reached in a super over', () => {
    const first = finished(15, 1, { isSuperOver: true });
    const second = finished(16, 0, { battingTeamId: AWAY, target: 16, isSuperOver: true });
    const result = computeResult(first, second, makeConfig({ playersPerSide: 3 }), true);
    expect(result.viaSuperOver).toBe(true);
    // 3 a side → all out at 2, so a 0-wicket chase wins by 2.
    expect(result.margin).toEqual({ by: 'wickets', value: 2 });
  });
});

describe('super overs', () => {
  it('reduces to one over, three batters and a two-wicket innings', () => {
    const base = makeConfig({ oversPerInnings: 20, playersPerSide: 11, lastManStanding: true });
    const so = superOverConfig(base);
    expect(so.oversPerInnings).toBe(1);
    expect(so.playersPerSide).toBe(3);
    expect(so.maxOversPerBowler).toBe(1);
    expect(so.powerplays).toEqual([]);
    expect(so.lastManStanding).toBe(false);
  });

  it('is required only on a tie, and only when configured', () => {
    const tie = {
      kind: 'tie' as const,
      winnerTeamId: null,
      margin: null,
      viaSuperOver: false,
      text: 'match tied',
    };
    const win = {
      kind: 'win' as const,
      winnerTeamId: HOME,
      margin: { by: 'runs' as const, value: 5 },
      viaSuperOver: false,
      text: 'won by 5 runs',
    };

    expect(needsSuperOver(tie, makeConfig({ superOverOnTie: true }))).toBe(true);
    expect(needsSuperOver(tie, makeConfig({ superOverOnTie: false }))).toBe(false);
    expect(needsSuperOver(win, makeConfig({ superOverOnTie: true }))).toBe(false);
  });

  it('caps repeats at three attempts', () => {
    expect(MAX_SUPER_OVERS).toBe(3);
  });

  it('counts super overs in pairs of innings', () => {
    const config = makeConfig();
    const state = createMatch({
      matchId: 'm',
      config,
      innings: [
        finished(150, 8),
        finished(150, 9, { battingTeamId: AWAY }),
        finished(15, 1, { isSuperOver: true }),
        finished(15, 1, { battingTeamId: AWAY, isSuperOver: true }),
      ],
    });
    expect(superOverCount(state)).toBe(1);
  });

  it('applies super-over rules only to super-over innings', () => {
    const config = makeConfig({ oversPerInnings: 20 });
    const state = createMatch({
      matchId: 'm',
      config,
      innings: [finished(150, 8), finished(15, 1, { isSuperOver: true })],
    });

    expect(configForInnings(state, 0).oversPerInnings).toBe(20);
    expect(configForInnings(state, 1).oversPerInnings).toBe(1);
    // Out of range falls back to the match config rather than throwing.
    expect(configForInnings(state, 99).oversPerInnings).toBe(20);
  });
});

describe('boundary countback', () => {
  it('totals fours and sixes across every innings a side batted', () => {
    const h = harness({ config: { oversPerInnings: 5 } });
    h.ball({ runsOffBat: 4, isBoundary: true });
    h.ball({ runsOffBat: 6, isBoundary: true });
    h.ball({ runsOffBat: 4, isBoundary: true });

    const i = innings(h.state);
    expect(boundaryCountback(h.state, i.battingTeamId)).toBe(3);
    // The bowling side has not batted, so they have none.
    expect(boundaryCountback(h.state, i.bowlingTeamId)).toBe(0);
  });
});

describe('end-to-end tie detection', () => {
  it('reports a tie when the chase falls exactly one short', () => {
    const h = harness({
      config: { oversPerInnings: 1, playersPerSide: 3 },
      batting: ['h1', 'h2', 'h3'],
      bowlers: ['a1', 'a2'],
    });

    // HOME: six singles = 6.
    for (let i = 0; i < 6; i++) h.ball({ runsOffBat: 1 });
    expect(innings(h.state).runs).toBe(6);

    h.startNextInnings({ battingOrder: ['a1', 'a2', 'a3'], bowlers: ['h1', 'h2'] });
    // AWAY chases 7 and makes exactly 6.
    for (let i = 0; i < 6; i++) h.ball({ runsOffBat: 1 });

    expect(h.state.result?.kind).toBe('tie');
    expect(h.state.result?.text).toBe('match tied');
    expect(needsSuperOver(h.state.result!, h.state.config)).toBe(true);
  });
});
