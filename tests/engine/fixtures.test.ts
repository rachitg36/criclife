import { describe, expect, it } from 'vitest';
import { replay, scorecard } from '@/engine';
import { batter, bowlerCard, harness, innings } from './harness';

/**
 * docs/04-RULES-ENGINE.md § 12 — "three full real-match fixtures replayed to a
 * byte-identical scorecard". Do not ship without these passing.
 *
 * Every expected number below was worked out by hand from the ball-by-ball
 * comments, NOT captured from engine output. A snapshot of whatever the code
 * happened to produce would pass even if the code were wrong, which is the
 * opposite of the point.
 *
 * Each fixture asserts twice:
 *   1. the scorecard matches the hand-computed figures;
 *   2. replaying the delivery log reproduces that scorecard exactly.
 */

describe('Fixture 1 — gully 8s, 8 a side, 4 overs bowled', () => {
  /**
   * Exercises: a small side, byes, a wide, a no-ball creating a free hit that
   * is then hit for four, a bowler reaching a 2-over cap, and a run out of the
   * NON-striker where the batters had crossed.
   *
   * Over 1 (gb1)  1 · 4 · 0 · 2 · 0 · 1              →  8
   * Over 2 (gb2)  W(b) · 0 · 1 · wd · 0 · 2 · 0      →  4, 1 wkt
   * Over 3 (gb1)  6 · 0 · nb · FH:4 · 1 · 0 · 0      → 12
   * Over 4 (gb3)  0 · b2 · 1 · W(run out, crossed) · 0 · 3 →  6, 1 wkt
   *                                              total  30/2 in 4.0
   */
  function play() {
    const h = harness({
      config: { oversPerInnings: 8, playersPerSide: 8, maxOversPerBowler: 2 },
      batting: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8'],
      bowlers: ['gb1', 'gb2', 'gb3', 'gb4'],
    });

    // ── Over 1, gb1 ──
    h.ball({ runsOffBat: 1 }); // g1 keeps 1, strike to g2
    h.ball({ runsOffBat: 4, isBoundary: true });
    h.ball();
    h.ball({ runsOffBat: 2 });
    h.ball();
    h.ball({ runsOffBat: 1 }); // odd, then over-end swap → g2 still on strike

    // ── Over 2, gb2 ──
    h.ball({ wicket: { type: 'bowled', dismissedPlayerId: h.striker() } }); // g2 out for 7
    h.ball();
    h.ball({ runsOffBat: 1 });
    h.ball({ extraType: 'wide' });
    h.ball();
    h.ball({ runsOffBat: 2 });
    h.ball();

    // ── Over 3, gb1 ──
    h.useBowler('gb1');
    h.ball({ runsOffBat: 6, isBoundary: true });
    h.ball();
    h.ball({ extraType: 'no_ball' }); // free hit next
    h.ball({ runsOffBat: 4, isBoundary: true }); // the free hit
    h.ball({ runsOffBat: 1 });
    h.ball();
    h.ball();

    // ── Over 4, gb3 ──
    h.useBowler('gb3');
    h.ball();
    h.ball({ extraType: 'bye', extraRuns: 2 });
    h.ball({ runsOffBat: 1 }); // strike to g1; g3 now at the far end
    h.ball({
      wicket: {
        type: 'run_out',
        dismissedPlayerId: h.nonStriker()!,
        fielderId: 'gf1',
        crossedBeforeDismissal: true,
      },
    });
    h.ball();
    h.ball({ runsOffBat: 3 });

    return h;
  }

  it('produces the hand-computed scorecard', () => {
    const h = play();
    const i = innings(h.state);

    // 8 + 4 + 12 + 6 = 30
    expect(i.runs).toBe(30);
    expect(i.wickets).toBe(2);
    expect(i.legalBalls).toBe(24);
    expect(i.extras).toEqual({ wides: 1, noBalls: 1, byes: 2, legByes: 0, penalty: 0 });

    // Batting card
    expect(batter(h.state, 'g1').runs).toBe(3);
    expect(batter(h.state, 'g1').balls).toBe(7);
    expect(batter(h.state, 'g2').runs).toBe(7);
    expect(batter(h.state, 'g2').balls).toBe(6);
    expect(batter(h.state, 'g2').status).toBe('out');
    expect(batter(h.state, 'g3').runs).toBe(13);
    expect(batter(h.state, 'g3').balls).toBe(10);
    expect(batter(h.state, 'g3').fours).toBe(1);
    expect(batter(h.state, 'g3').sixes).toBe(1);
    expect(batter(h.state, 'g4').runs).toBe(3);

    // Runs must reconcile: batters + extras = team total.
    const batterRuns = Object.values(i.batters).reduce((s, b) => s + b.runs, 0);
    expect(batterRuns).toBe(26);
    expect(batterRuns + 4).toBe(i.runs);

    // Bowling card. Byes are not charged to gb3.
    expect(bowlerCard(h.state, 'gb1').legalBalls).toBe(12);
    expect(bowlerCard(h.state, 'gb1').runsConceded).toBe(20);
    expect(bowlerCard(h.state, 'gb1').noBalls).toBe(1);
    expect(bowlerCard(h.state, 'gb2').runsConceded).toBe(4);
    expect(bowlerCard(h.state, 'gb2').wickets).toBe(1);
    expect(bowlerCard(h.state, 'gb2').wides).toBe(1);
    expect(bowlerCard(h.state, 'gb3').runsConceded).toBe(4);

    // Bowler runs + byes = team total.
    const conceded =
      bowlerCard(h.state, 'gb1').runsConceded +
      bowlerCard(h.state, 'gb2').runsConceded +
      bowlerCard(h.state, 'gb3').runsConceded;
    expect(conceded + i.extras.byes).toBe(i.runs);

    // The run out removed the non-striker, so g1 survives at the far end.
    expect(i.fallOfWickets).toHaveLength(2);
    expect(i.fallOfWickets[1]?.batterId).toBe('g3');
  });

  it('replays to a byte-identical scorecard', () => {
    const h = play();
    const result = replay(h.initialState(), h.deliveries);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toBe(h.deliveries.length);
    expect(scorecard(result.state)).toEqual(scorecard(h.state));
  });
});

describe('Fixture 2 — complete match, 4 a side, 2 overs each, chased down', () => {
  /**
   * A whole match end to end, so the result computation is exercised.
   *
   * HOME  ov1 (a1) 1 · 0 · 4 · 2 · 0 · 1   →  8
   *       ov2 (a2) 0 · 6 · 0 · W(b) · 1 · 0 →  7, 1 wkt      = 15/1 (2.0)
   * AWAY  target 16
   *       ov1 (h1) 4 · 4 · 4 · 1 · 0 · 0   → 13
   *       ov2 (h2) 1 · 2                    →  3             = 16/0 (1.2)
   * AWAY win by 3 wickets.
   */
  function play() {
    const h = harness({
      config: { oversPerInnings: 2, playersPerSide: 4, maxOversPerBowler: 1 },
      batting: ['h1', 'h2', 'h3', 'h4'],
      bowlers: ['a1', 'a2'],
    });

    // ── HOME innings ──
    h.ball({ runsOffBat: 1 });
    h.ball();
    h.ball({ runsOffBat: 4, isBoundary: true });
    h.ball({ runsOffBat: 2 });
    h.ball();
    h.ball({ runsOffBat: 1 });

    h.ball();
    h.ball({ runsOffBat: 6, isBoundary: true });
    h.ball();
    h.ball({ wicket: { type: 'bowled', dismissedPlayerId: h.striker() } });
    h.ball({ runsOffBat: 1 });
    h.ball();

    // ── AWAY innings, chasing 16 ──
    h.startNextInnings({ battingOrder: ['a1', 'a2', 'a3', 'a4'], bowlers: ['h1', 'h2'] });

    h.ball({ runsOffBat: 4, isBoundary: true });
    h.ball({ runsOffBat: 4, isBoundary: true });
    h.ball({ runsOffBat: 4, isBoundary: true });
    h.ball({ runsOffBat: 1 });
    h.ball();
    h.ball();

    h.ball({ runsOffBat: 1 });
    h.ball({ runsOffBat: 2 }); // 16 — target reached

    return h;
  }

  it('produces the hand-computed scorecard and result', () => {
    const h = play();
    const first = h.state.innings[0]!;
    const second = h.state.innings[1]!;

    expect(first.runs).toBe(15);
    expect(first.wickets).toBe(1);
    expect(first.legalBalls).toBe(12);
    expect(first.endReason).toBe('overs_complete');
    expect(second.target).toBe(16);

    expect(second.runs).toBe(16);
    expect(second.wickets).toBe(0);
    expect(second.legalBalls).toBe(8);
    expect(second.endReason).toBe('target_reached');

    // h4 never came in.
    expect(first.yetToBat).toEqual(['h4']);

    expect(h.state.status).toBe('completed');
    expect(h.state.result).toEqual({
      kind: 'win',
      winnerTeamId: second.battingTeamId,
      margin: { by: 'wickets', value: 3 },
      viaSuperOver: false,
      text: 'won by 3 wickets',
    });
  });

  it('replays to a byte-identical scorecard', () => {
    const h = play();
    const result = replay(h.initialState(), h.deliveries);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(scorecard(result.state).innings[0]).toEqual(scorecard(h.state).innings[0]);
  });
});

describe('Fixture 3 — The Hundred, five-ball overs', () => {
  /**
   * Verifies the over completes at five balls, not six, and that the derived
   * overs display uses ballsPerOver rather than assuming 6.
   *
   * ov1 (b1) 1 · 1 · 1 · 1 · 1        →  5, strike rotating every ball
   * ov2 (b2) wd · 0 · 6 · 0 · 0 · 0   →  7
   *                             total   12/0 in 2.0 (10 legal balls)
   */
  function play() {
    const h = harness({
      config: { oversPerInnings: 4, ballsPerOver: 5, playersPerSide: 6, maxOversPerBowler: 2 },
      batting: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      bowlers: ['hb1', 'hb2'],
    });

    for (let i = 0; i < 5; i++) h.ball({ runsOffBat: 1 });

    h.ball({ extraType: 'wide' });
    h.ball();
    h.ball({ runsOffBat: 6, isBoundary: true });
    h.ball();
    h.ball();
    h.ball();

    return h;
  }

  it('completes overs at five balls and totals correctly', () => {
    const h = play();
    const i = innings(h.state);
    const card = scorecard(h.state).innings[0]!;

    expect(i.runs).toBe(12);
    expect(i.legalBalls).toBe(10);
    expect(card.overs).toBe('2.0');
    expect(i.extras.wides).toBe(1);

    // Five singles rotate the strike every ball: p1 faced balls 1, 3 and 5
    // (3 runs), p2 faced 2 and 4 (2 runs). The over-end swap then brings p1
    // back on strike for over 2, where the six is his — so p1 finishes on
    // 3 + 6 = 9 and p2 stays on 2.
    expect(batter(h.state, 'p2').runs).toBe(2);
    expect(batter(h.state, 'p1').runs).toBe(9);
    expect(batter(h.state, 'p1').sixes).toBe(1);

    expect(bowlerCard(h.state, 'hb1').legalBalls).toBe(5);
    expect(bowlerCard(h.state, 'hb2').legalBalls).toBe(5);
    expect(bowlerCard(h.state, 'hb1').maidens).toBe(0);

    const batterRuns = Object.values(i.batters).reduce((s, b) => s + b.runs, 0);
    expect(batterRuns + 1).toBe(i.runs);
  });

  it('replays to a byte-identical scorecard', () => {
    const h = play();
    const result = replay(h.initialState(), h.deliveries);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(scorecard(result.state)).toEqual(scorecard(h.state));
  });
});
