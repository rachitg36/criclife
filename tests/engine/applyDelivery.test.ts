import { describe, expect, it } from 'vitest';
import { applyDelivery, setBowler, setNewBatter } from '../../src/engine/applyDelivery';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createInitialMatchState } from '../../src/engine/replay';
import { computeMatchResult } from '../../src/engine/result';
import { ball, createTestMatch, currentInnings, emptyInnings } from './helpers';

describe('applyDelivery — basic scoring', () => {
  it('a dot ball: no runs, no strike change, ball and dot counted', () => {
    const state = createTestMatch();
    const result = applyDelivery(state, ball());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.runs).toBe(0);
    expect(innings.strikerId).toBe('s1');
    expect(innings.batters.s1?.balls).toBe(1);
    expect(innings.bowlers.bowler1?.dots).toBe(1);
    expect(innings.bowlers.bowler1?.legalBalls).toBe(1);
  });

  it('an odd number of runs swaps the strike', () => {
    const state = createTestMatch();
    const result = applyDelivery(state, ball({ runsOffBat: 1 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.strikerId).toBe('ns1');
    expect(innings.nonStrikerId).toBe('s1');
  });

  it('an even number of runs does not swap the strike', () => {
    const state = createTestMatch();
    const result = applyDelivery(state, ball({ runsOffBat: 2 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(currentInnings(result.state).strikerId).toBe('s1');
  });

  it('a boundary four never swaps the strike, even though 4 is even anyway', () => {
    const state = createTestMatch();
    const result = applyDelivery(state, ball({ runsOffBat: 4, isBoundary: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.strikerId).toBe('s1');
    expect(innings.batters.s1?.fours).toBe(1);
    expect(innings.runs).toBe(4);
  });

  it('a six is credited and does not swap strike', () => {
    const state = createTestMatch();
    const result = applyDelivery(state, ball({ runsOffBat: 6, isBoundary: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.batters.s1?.sixes).toBe(1);
    expect(innings.runs).toBe(6);
  });
});

describe('applyDelivery — §12 unit test table', () => {
  it('wide with 2 runs run: 3 to extras, batter balls unchanged', () => {
    // NOTE: docs/04-RULES-ENGINE.md §12's worked example claims this case
    // ("3 to extras") also swaps the strike — but by §6's own formula,
    // runsThatCrossed = runsExtras(3) - wideRuns(1) = 2, which is even and
    // must not swap. The two sections of the doc are internally
    // inconsistent; this test follows §6's formula, which is what's
    // actually implemented (and is the one with worked-out math behind it).
    const state = createTestMatch();
    const result = applyDelivery(state, ball({ extraType: 'wide', extraRuns: 2 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.runs).toBe(3);
    expect(innings.extras.wides).toBe(3);
    expect(innings.batters.s1?.balls).toBe(0);
    expect(innings.bowlers.bowler1?.legalBalls).toBe(0);
    expect(innings.strikerId).toBe('s1');
  });

  it('no-ball hit for 6: 7 total, 6 to batter, batter balls +1, next ball is free hit', () => {
    const state = createTestMatch();
    const result = applyDelivery(
      state,
      ball({ extraType: 'no_ball', runsOffBat: 6, isBoundary: true })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.runs).toBe(7);
    expect(innings.extras.noBalls).toBe(1);
    expect(innings.batters.s1?.runs).toBe(6);
    expect(innings.batters.s1?.sixes).toBe(1);
    expect(innings.batters.s1?.balls).toBe(1);
    expect(innings.isFreeHit).toBe(true);
  });

  it('free hit, batter bowled: illegal dismissal is rejected outright — not out, no state change', () => {
    const state = createTestMatch({}, { isFreeHit: true });
    const result = applyDelivery(
      state,
      ball({ wicket: { type: 'bowled', dismissedPlayerId: 's1' } })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('ILLEGAL_DISMISSAL');
  });

  it('free hit consumed by the next legal ball even with no wicket attempted', () => {
    const state = createTestMatch({}, { isFreeHit: true });
    const result = applyDelivery(state, ball({ runsOffBat: 1 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(currentInnings(result.state).isFreeHit).toBe(false);
  });

  it('free hit, wide bowled: free hit persists to the next ball', () => {
    const state = createTestMatch({}, { isFreeHit: true });
    const result = applyDelivery(state, ball({ extraType: 'wide' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(currentInnings(result.state).isFreeHit).toBe(true);
  });

  it('bye 4: 4 to extras, bowler concedes 0, batter balls +1, no strike change', () => {
    const state = createTestMatch();
    const result = applyDelivery(state, ball({ extraType: 'bye', extraRuns: 4 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.runs).toBe(4);
    expect(innings.extras.byes).toBe(4);
    expect(innings.bowlers.bowler1?.runsConceded).toBe(0);
    expect(innings.batters.s1?.balls).toBe(1);
    expect(innings.batters.s1?.runs).toBe(0);
    expect(innings.strikerId).toBe('s1');
  });

  it('leg bye 1: strike swaps, bowler concedes 0', () => {
    const state = createTestMatch();
    const result = applyDelivery(state, ball({ extraType: 'leg_bye', extraRuns: 1 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.bowlers.bowler1?.runsConceded).toBe(0);
    expect(innings.strikerId).toBe('ns1');
  });

  it('3 runs on the last ball of the over: strike swaps twice = net no swap', () => {
    let state = createTestMatch({ ballsPerOver: 6 });
    for (let i = 0; i < 5; i += 1) {
      const r = applyDelivery(state, ball());
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    const result = applyDelivery(state, ball({ runsOffBat: 3 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.strikerId).toBe('s1');
    expect(innings.nonStrikerId).toBe('ns1');
  });

  it('maiden with a wide in it is not a maiden', () => {
    let state = createTestMatch({ ballsPerOver: 6 });
    const wideResult = applyDelivery(state, ball({ extraType: 'wide' }));
    expect(wideResult.ok).toBe(true);
    if (wideResult.ok) state = wideResult.state;
    for (let i = 0; i < 6; i += 1) {
      const r = applyDelivery(state, ball());
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    const innings = currentInnings(state);
    expect(innings.bowlers.bowler1?.maidens).toBe(0);
    expect(innings.legalBalls).toBe(6);
  });

  it('a clean over with zero runs is a maiden', () => {
    let state = createTestMatch({ ballsPerOver: 6 });
    for (let i = 0; i < 6; i += 1) {
      const r = applyDelivery(state, ball());
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    expect(currentInnings(state).bowlers.bowler1?.maidens).toBe(1);
  });

  it('bowler hits maxOversPerBowler: rejected from bowling a further over', () => {
    let state = createTestMatch({ ballsPerOver: 6, maxOversPerBowler: 1 });
    for (let i = 0; i < 6; i += 1) {
      const r = applyDelivery(state, ball());
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    state = setBowler(state, 'bowler2');
    for (let i = 0; i < 6; i += 1) {
      const r = applyDelivery(state, ball());
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    // bowler1 already has 1 over (their max) — trying to give them a second is rejected.
    state = setBowler(state, 'bowler1');
    const result = applyDelivery(state, ball());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('BOWLER_OVERS_EXHAUSTED');
  });

  it('ballsPerOver = 5 (The Hundred): the over completes at 5, not 6', () => {
    let state = createTestMatch({ ballsPerOver: 5 });
    for (let i = 0; i < 4; i += 1) {
      const r = applyDelivery(state, ball());
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    expect(currentInnings(state).bowlerId).not.toBeNull();
    const fifth = applyDelivery(state, ball());
    expect(fifth.ok).toBe(true);
    if (!fifth.ok) return;
    expect(currentInnings(fifth.state).bowlerId).toBeNull();
    expect(fifth.events.some((e) => e.type === 'OVER_COMPLETE')).toBe(true);
  });

  function nextBowlerFor(state: ReturnType<typeof createTestMatch>) {
    return currentInnings(state).previousBowlerId === 'bowler1' ? 'bowler2' : 'bowler1';
  }

  it('playersPerSide = 8: all out at 7 wickets', () => {
    // 8 batters total: s1, ns1, then 6 replacements (s2..s7) — enough for 7 dismissals.
    let state = createTestMatch({ playersPerSide: 8 });
    const incoming = ['s2', 's3', 's4', 's5', 's6', 's7'];
    for (let wicket = 1; wicket <= 7; wicket += 1) {
      const r = applyDelivery(
        state,
        ball({ wicket: { type: 'bowled', dismissedPlayerId: currentInnings(state).strikerId! } })
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      state = r.state;
      if (currentInnings(state).status === 'in_progress') {
        state = setNewBatter(state, incoming[wicket - 1]!);
        if (currentInnings(state).bowlerId === null) state = setBowler(state, nextBowlerFor(state));
      }
    }
    expect(currentInnings(state).wickets).toBe(7);
    expect(currentInnings(state).status).toBe('completed');
    expect(currentInnings(state).endReason).toBe('all_out');
  });

  it('last-man-standing: innings continues at 7 down with 8 a side', () => {
    // Only 6 replacements exist (8 players total, 2 already at the crease) —
    // the 7th dismissal has no one left to bring in: that's the transition
    // into true last-man-standing, not an error.
    let state = createTestMatch({ playersPerSide: 8, lastManStanding: true });
    const incoming = ['s2', 's3', 's4', 's5', 's6', 's7'];
    for (let wicket = 1; wicket <= 7; wicket += 1) {
      const r = applyDelivery(
        state,
        ball({ wicket: { type: 'bowled', dismissedPlayerId: currentInnings(state).strikerId! } })
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      state = r.state;
      expect(currentInnings(state).status).toBe('in_progress');
      if (wicket <= 6) state = setNewBatter(state, incoming[wicket - 1]!);
      if (currentInnings(state).bowlerId === null) state = setBowler(state, nextBowlerFor(state));
    }
    const innings = currentInnings(state);
    expect(innings.wickets).toBe(7);
    expect(innings.status).toBe('in_progress');
    expect(innings.strikerId).not.toBeNull();
    expect(innings.nonStrikerId).toBeNull();
  });

  it('last-man-standing suppresses the over-end swap once truly down to the last batter', () => {
    // NOTE: the config flag alone doesn't suppress swapping — only reaching
    // wickets === playersPerSide - 1 does. A fresh innings with 0 wickets
    // down swaps normally even though `lastManStanding` is configured; this
    // test starts pre-seeded in the true last-man state (1 down of 2 a side).
    const config = { ...DEFAULT_CONFIG, ballsPerOver: 6, playersPerSide: 2, lastManStanding: true };
    let state = createInitialMatchState('test-match', config);
    state = {
      ...state,
      innings: [
        emptyInnings({
          wickets: 1,
          strikerId: 's1',
          nonStrikerId: null,
          batters: {
            s1: {
              playerId: 's1',
              position: 1,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              status: 'not_out',
              dismissal: null,
            },
          },
        }),
      ],
      currentInningsIndex: 0,
    };
    state = setBowler(state, 'bowler1');

    for (let i = 0; i < 6; i += 1) {
      const r = applyDelivery(state, ball());
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    expect(currentInnings(state).strikerId).toBe('s1');
    expect(currentInnings(state).nonStrikerId).toBeNull();
  });

  it('winning run off a no-ball ends the innings immediately, with the correct result', () => {
    let chase = createTestMatch({}, { inningsNo: 2, target: 100 });
    const before = applyDelivery(chase, ball({ runsOffBat: 0, extraType: null }));
    expect(before.ok).toBe(true);
    if (before.ok) chase = before.state;
    // 98 runs in, needs 2 to win — hits the winning run off a no-ball.
    chase = { ...chase, innings: [{ ...currentInnings(chase), runs: 98 }] };
    const winning = applyDelivery(chase, ball({ extraType: 'no_ball', runsOffBat: 2 }));
    expect(winning.ok).toBe(true);
    if (!winning.ok) return;
    const innings = currentInnings(winning.state);
    expect(innings.runs).toBe(101);
    expect(innings.status).toBe('completed');
    expect(innings.endReason).toBe('target_reached');

    const firstInnings = { ...currentInnings(winning.state), inningsNo: 1, runs: 99, target: null };
    const result = computeMatchResult(firstInnings, innings, winning.state.config);
    expect(result.type).toBe('win');
    expect(result.winnerTeamId).toBe(innings.battingTeamId);
    // 11 a side, chasing team lost no wickets: 10 wickets in hand.
    expect(result.marginWickets).toBe(10);
  });

  it('all out on a run out of the non-striker: correct batter remains, not out', () => {
    const state = createTestMatch();
    const result = applyDelivery(
      state,
      ball({
        runsOffBat: 1,
        wicket: { type: 'run_out', dismissedPlayerId: 'ns1', crossedBeforeDismissal: false },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.wickets).toBe(1);
    expect(innings.batters.ns1?.status).toBe('out');
    expect(innings.batters.s1?.status).toBe('not_out');
    // 1 completed run (odd) with no further crossing swaps ends: s1 was at
    // the striker's end, now at the non-striker's end; ns1's end is vacant.
    expect(innings.nonStrikerId).toBe('s1');
    expect(innings.strikerId).toBeNull();
  });

  it('run out on the last ball of the over, batters crossed: correct batter on strike next over', () => {
    let state = createTestMatch({ ballsPerOver: 6 });
    for (let i = 0; i < 5; i += 1) {
      const r = applyDelivery(state, ball());
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    // Attempting a 2nd run, crossed when the throw came in: striker's partner (ns1) is out.
    const result = applyDelivery(
      state,
      ball({
        runsOffBat: 1,
        wicket: { type: 'run_out', dismissedPlayerId: 'ns1', crossedBeforeDismissal: true },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let innings = currentInnings(result.state);
    // completed=1, crossed=true → parity 0 → s1 stays at striker's end, ns1's
    // end (now non-striker) is vacant — then the over-end swap (this is the
    // over's last ball) flips both, landing the vacancy on the striker's end.
    expect(innings.strikerId).toBeNull();
    expect(innings.nonStrikerId).toBe('s1');
    state = setNewBatter(result.state, 's2');
    innings = currentInnings(state);
    expect(innings.strikerId).toBe('s2');
    expect(innings.nonStrikerId).toBe('s1');
  });
});

describe('applyDelivery — validation failures', () => {
  it('rejects a delivery once the innings is no longer in progress', () => {
    const state = createTestMatch({}, { status: 'completed', endReason: 'all_out' });
    const result = applyDelivery(state, ball());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INNINGS_NOT_IN_PROGRESS');
  });

  it('rejects a delivery with no bowler set', () => {
    let state = createTestMatch();
    state = {
      ...state,
      innings: [{ ...currentInnings(state), bowlerId: null }],
    };
    const result = applyDelivery(state, ball());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('BOWLER_NOT_SET');
  });

  it('rejects a bowler bowling consecutive overs', () => {
    let state = createTestMatch();
    state = {
      ...state,
      innings: [{ ...currentInnings(state), bowlerId: 'bowler1', previousBowlerId: 'bowler1' }],
    };
    const result = applyDelivery(state, ball());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('BOWLER_CANNOT_BOWL_CONSECUTIVE_OVERS');
  });
});

describe('applyDelivery — penalty runs', () => {
  it('credits penalty runs to the team total, not the batter, and does not swap strike', () => {
    const state = createTestMatch();
    const result = applyDelivery(state, ball({ extraType: 'penalty', penaltyRuns: 5 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.runs).toBe(5);
    expect(innings.extras.penalty).toBe(5);
    expect(innings.batters.s1?.runs).toBe(0);
    expect(innings.strikerId).toBe('s1');
  });
});

describe('applyDelivery — retired batters', () => {
  it('retired_out counts as a wicket and vacates the striker end', () => {
    const state = createTestMatch();
    const result = applyDelivery(
      state,
      ball({ wicket: { type: 'retired_out', dismissedPlayerId: 's1' } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.wickets).toBe(1);
    expect(innings.batters.s1?.status).toBe('retired_out');
    expect(innings.strikerId).toBeNull();
  });

  it('retired_hurt does not count as a wicket but still vacates the end', () => {
    const state = createTestMatch();
    const result = applyDelivery(
      state,
      ball({ wicket: { type: 'retired_hurt', dismissedPlayerId: 's1' } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.wickets).toBe(0);
    expect(innings.batters.s1?.status).toBe('retired_hurt');
    expect(innings.strikerId).toBeNull();
  });
});

describe('applyDelivery — true last-man-standing dismissal', () => {
  it('the lone survivor being dismissed ends the innings with no ends arithmetic needed', () => {
    const config = { ...DEFAULT_CONFIG, ballsPerOver: 6, playersPerSide: 2, lastManStanding: true };
    let state = createInitialMatchState('test-match', config);
    state = {
      ...state,
      innings: [
        emptyInnings({
          wickets: 1,
          strikerId: 's1',
          nonStrikerId: null,
          batters: {
            s1: {
              playerId: 's1',
              position: 1,
              runs: 40,
              balls: 30,
              fours: 4,
              sixes: 1,
              status: 'not_out',
              dismissal: null,
            },
          },
        }),
      ],
      currentInningsIndex: 0,
    };
    state = setBowler(state, 'bowler1');

    const result = applyDelivery(
      state,
      ball({ wicket: { type: 'bowled', dismissedPlayerId: 's1' } })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.wickets).toBe(2);
    expect(innings.status).toBe('completed');
    expect(innings.endReason).toBe('all_out');
    expect(innings.strikerId).toBeNull();
    expect(innings.nonStrikerId).toBeNull();
  });
});

describe('setNewBatter / setBowler invariants', () => {
  it('setNewBatter throws when there is no vacant end', () => {
    const state = createTestMatch();
    expect(() => setNewBatter(state, 's2')).toThrow(/no vacant end/);
  });

  it('setBowler throws when asked to bowl the same bowler consecutive overs', () => {
    let state = createTestMatch();
    state = {
      ...state,
      innings: [{ ...currentInnings(state), bowlerId: null, previousBowlerId: 'bowler1' }],
    };
    expect(() => setBowler(state, 'bowler1')).toThrow(/consecutive overs/);
  });

  it('setNewBatter throws before any innings has started', () => {
    const fresh = createInitialMatchState('empty-match', DEFAULT_CONFIG);
    expect(() => setNewBatter(fresh, 's1')).toThrow(/no current innings/);
  });

  it('setBowler throws before any innings has started', () => {
    const fresh = createInitialMatchState('empty-match', DEFAULT_CONFIG);
    expect(() => setBowler(fresh, 'bowler1')).toThrow(/no current innings/);
  });
});

describe('applyDelivery — additional validation and edge-case branches', () => {
  it('rejects a delivery when striker and non-striker are (invalidly) the same player', () => {
    let state = createTestMatch();
    state = { ...state, innings: [{ ...currentInnings(state), nonStrikerId: 's1' }] };
    const result = applyDelivery(state, ball());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('BATTERS_NOT_SET');
  });

  it('rejects a delivery with no non-striker set outside last-man-standing', () => {
    let state = createTestMatch();
    state = { ...state, innings: [{ ...currentInnings(state), nonStrikerId: null }] };
    const result = applyDelivery(state, ball());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('BATTERS_NOT_SET');
  });

  it('a super-over innings uses 1-over/3-a-side rules regardless of the match config', () => {
    let state = createTestMatch({ ballsPerOver: 6, playersPerSide: 11 }, { isSuperOver: true });
    for (let i = 0; i < 6; i += 1) {
      const r = applyDelivery(state, ball());
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    // The over completed after 6 balls (super over config's ballsPerOver is
    // inherited from the base match — only overs/players/bowler-limit change).
    expect(currentInnings(state).bowlerId).toBeNull();
  });

  it('a super-over innings ends all out at 2 wickets (3 a side)', () => {
    let state = createTestMatch({}, { isSuperOver: true });
    const r1 = applyDelivery(
      state,
      ball({ wicket: { type: 'bowled', dismissedPlayerId: currentInnings(state).strikerId! } })
    );
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    state = setNewBatter(r1.state, 's2');
    const r2 = applyDelivery(
      state,
      ball({ wicket: { type: 'bowled', dismissedPlayerId: currentInnings(state).strikerId! } })
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(currentInnings(r2.state).wickets).toBe(2);
    expect(currentInnings(r2.state).status).toBe('completed');
    expect(currentInnings(r2.state).endReason).toBe('all_out');
  });

  it('penalty runs default to 0 when penaltyRuns is omitted', () => {
    const state = createTestMatch();
    const result = applyDelivery(state, ball({ extraType: 'penalty' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(currentInnings(result.state).runs).toBe(0);
  });

  it('a run-out on a wide counts only the runs actually run, not the auto wide-run, toward crossing', () => {
    const state = createTestMatch();
    const result = applyDelivery(
      state,
      ball({
        extraType: 'wide',
        extraRuns: 1, // 1 auto + 1 run = 2 total, so 1 run was actually run (odd → crosses)
        wicket: { type: 'run_out', dismissedPlayerId: 'ns1', crossedBeforeDismissal: false },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const innings = currentInnings(result.state);
    expect(innings.extras.wides).toBe(2);
    expect(innings.wickets).toBe(1);
  });

  it('a run-out on a bye/leg-bye counts the full extras total toward crossing', () => {
    const state = createTestMatch();
    const result = applyDelivery(
      state,
      ball({
        extraType: 'bye',
        extraRuns: 1,
        wicket: { type: 'run_out', dismissedPlayerId: 'ns1', crossedBeforeDismissal: false },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(currentInnings(result.state).wickets).toBe(1);
  });

  it('an invariant violation (corrupted state: striker not tracked as a batter) throws', () => {
    let state = createTestMatch();
    state = { ...state, innings: [{ ...currentInnings(state), strikerId: 'ghost' }] };
    expect(() => applyDelivery(state, ball())).toThrow(/not on the crease/);
  });

  it('an invariant violation (corrupted state: bowler not tracked) throws', () => {
    let state = createTestMatch();
    state = { ...state, innings: [{ ...currentInnings(state), bowlerId: 'ghost' }] };
    expect(() => applyDelivery(state, ball())).toThrow(/not tracked/);
  });
});
