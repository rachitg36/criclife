import { describe, expect, it } from 'vitest';
import { batter, bowlerCard, harness, innings } from './harness';

/**
 * docs/04-RULES-ENGINE.md § 12 — the named unit cases, one describe block
 * each, in the order the doc lists them.
 */

describe('§ 12 — wide with 2 runs run', () => {
  it('adds 3 to extras, leaves balls faced alone, and swaps the strike', () => {
    const h = harness();
    const before = innings(h.state).strikerId!;

    h.ball({ extraType: 'wide', extraRuns: 2 });

    const i = innings(h.state);
    expect(i.runs).toBe(3);
    expect(i.extras.wides).toBe(3);
    expect(i.legalBalls).toBe(0);
    expect(batter(h.state, before).balls).toBe(0);
    // Two runs run off the wide = an even number crossed... but the automatic
    // wide run is not a run *run*, so 3 − 1 = 2 crossings → no swap.
    expect(i.strikerId).toBe(before);
  });

  it('swaps the strike when an odd number is run off the wide', () => {
    const h = harness();
    const before = innings(h.state).strikerId!;
    h.ball({ extraType: 'wide', extraRuns: 1 });
    expect(innings(h.state).strikerId).not.toBe(before);
    expect(innings(h.state).runs).toBe(2);
  });
});

describe('§ 12 — no-ball hit for six', () => {
  it('scores 7, credits 6 to the batter, counts the ball, and sets up a free hit', () => {
    const h = harness();
    const striker = innings(h.state).strikerId!;
    const bowler = innings(h.state).bowlerId!;

    h.ball({ extraType: 'no_ball', runsOffBat: 6, isBoundary: true });

    const i = innings(h.state);
    expect(i.runs).toBe(7);
    expect(i.extras.noBalls).toBe(1);
    expect(i.legalBalls).toBe(0);
    expect(batter(h.state, striker).runs).toBe(6);
    expect(batter(h.state, striker).balls).toBe(1);
    expect(batter(h.state, striker).sixes).toBe(1);
    expect(bowlerCard(h.state, bowler).runsConceded).toBe(7);
    expect(i.isFreeHit).toBe(true);
  });
});

describe('§ 12 — free hit', () => {
  it('rejects a bowled dismissal', () => {
    const h = harness();
    h.ball({ extraType: 'no_ball' });
    expect(innings(h.state).isFreeHit).toBe(true);

    const striker = innings(h.state).strikerId!;
    const rejected = h.expectReject({
      wicket: { type: 'bowled', dismissedPlayerId: striker },
    });
    expect(rejected.error).toBe('ILLEGAL_DISMISSAL');
    // The innings is untouched by a rejected ball.
    expect(innings(h.state).wickets).toBe(0);
  });

  it('is consumed by a legal ball', () => {
    const h = harness();
    h.ball({ extraType: 'no_ball' });
    expect(innings(h.state).isFreeHit).toBe(true);
    h.ball({ runsOffBat: 2 });
    expect(innings(h.state).isFreeHit).toBe(false);
  });

  it('persists through a wide', () => {
    const h = harness();
    h.ball({ extraType: 'no_ball' });
    expect(innings(h.state).isFreeHit).toBe(true);
    h.ball({ extraType: 'wide' });
    expect(innings(h.state).isFreeHit).toBe(true);
  });

  it('allows a run out', () => {
    const h = harness();
    h.ball({ extraType: 'no_ball' });
    const striker = innings(h.state).strikerId!;
    h.ball({ wicket: { type: 'run_out', dismissedPlayerId: striker, fielderId: 'field-1' } });
    expect(innings(h.state).wickets).toBe(1);
  });
});

describe('§ 12 — byes and leg-byes', () => {
  it('bye 4: 4 to extras, bowler concedes nothing, ball faced, no strike change', () => {
    const h = harness();
    const striker = innings(h.state).strikerId!;
    const bowler = innings(h.state).bowlerId!;

    h.ball({ extraType: 'bye', extraRuns: 4 });

    const i = innings(h.state);
    expect(i.runs).toBe(4);
    expect(i.extras.byes).toBe(4);
    expect(i.legalBalls).toBe(1);
    expect(batter(h.state, striker).balls).toBe(1);
    expect(batter(h.state, striker).runs).toBe(0);
    expect(bowlerCard(h.state, bowler).runsConceded).toBe(0);
    expect(i.strikerId).toBe(striker);
  });

  it('leg bye 1: strike swaps, bowler concedes nothing', () => {
    const h = harness();
    const striker = innings(h.state).strikerId!;
    const bowler = innings(h.state).bowlerId!;

    h.ball({ extraType: 'leg_bye', extraRuns: 1 });

    expect(innings(h.state).extras.legByes).toBe(1);
    expect(bowlerCard(h.state, bowler).runsConceded).toBe(0);
    expect(innings(h.state).strikerId).not.toBe(striker);
  });
});

describe('§ 12 — strike rotation at the end of an over', () => {
  it('3 runs off the last ball swaps twice, so nobody changes ends', () => {
    const h = harness();
    for (let i = 0; i < 5; i++) h.ball();
    const striker = innings(h.state).strikerId!;

    h.ball({ runsOffBat: 3 });

    // Odd runs swap, then the over-end swap puts them back.
    expect(innings(h.state).strikerId).toBe(striker);
    expect(innings(h.state).legalBalls).toBe(6);
  });

  it('2 runs off the last ball leaves one swap — the over-end one', () => {
    const h = harness();
    for (let i = 0; i < 5; i++) h.ball();
    const striker = innings(h.state).strikerId!;
    h.ball({ runsOffBat: 2 });
    expect(innings(h.state).strikerId).not.toBe(striker);
  });
});

describe('§ 12 — run outs', () => {
  it('puts the right batter on strike when they crossed on the last ball of the over', () => {
    const h = harness();
    for (let i = 0; i < 5; i++) h.ball();

    const i0 = innings(h.state);
    const striker = i0.strikerId!;
    const nonStriker = i0.nonStrikerId!;

    // Non-striker run out having crossed: the striker is now at the far end,
    // and the over-end swap brings them back on strike.
    h.ball({
      wicket: {
        type: 'run_out',
        dismissedPlayerId: nonStriker,
        fielderId: 'field-1',
        crossedBeforeDismissal: true,
      },
    });

    const i = innings(h.state);
    expect(i.wickets).toBe(1);
    expect(i.strikerId).toBe(striker);
    expect(i.nonStrikerId).toBeNull();
  });

  it('keeps the surviving batter at the correct end when they did not cross', () => {
    const h = harness();
    const i0 = innings(h.state);
    const striker = i0.strikerId!;
    const nonStriker = i0.nonStrikerId!;

    h.ball({
      wicket: {
        type: 'run_out',
        dismissedPlayerId: striker,
        fielderId: 'field-1',
        crossedBeforeDismissal: false,
      },
    });

    const i = innings(h.state);
    expect(i.strikerId).toBeNull();
    expect(i.nonStrikerId).toBe(nonStriker);
  });

  it('counts runs completed before the run out', () => {
    const h = harness();
    const striker = innings(h.state).strikerId!;
    h.ball({
      runsOffBat: 1,
      wicket: {
        type: 'run_out',
        dismissedPlayerId: striker,
        fielderId: 'field-1',
        crossedBeforeDismissal: true,
      },
    });
    expect(innings(h.state).runs).toBe(1);
  });

  it('still counts the wide run when a run out happens off a wide', () => {
    const h = harness();
    const striker = innings(h.state).strikerId!;
    h.ball({
      extraType: 'wide',
      wicket: { type: 'run_out', dismissedPlayerId: striker, fielderId: 'field-1' },
    });
    expect(innings(h.state).runs).toBe(1);
    expect(innings(h.state).extras.wides).toBe(1);
    expect(innings(h.state).wickets).toBe(1);
  });
});

describe('§ 12 — maidens', () => {
  it('awards a maiden for six dots', () => {
    const h = harness();
    const bowler = innings(h.state).bowlerId!;
    for (let i = 0; i < 6; i++) h.ball();
    expect(bowlerCard(h.state, bowler).maidens).toBe(1);
  });

  it('does not award a maiden if the over contained a wide', () => {
    const h = harness();
    const bowler = innings(h.state).bowlerId!;
    h.ball({ extraType: 'wide' });
    for (let i = 0; i < 6; i++) h.ball();
    expect(bowlerCard(h.state, bowler).maidens).toBe(0);
  });

  it('gives neither bowler a maiden when the over was shared', () => {
    // docs/04 § 8 — a bowler injured mid-over. Six dot balls were bowled, but
    // neither bowler bowled the whole over, so neither earns the maiden.
    const h = harness({ bowlers: ['bowl-1', 'bowl-2', 'bowl-3'] });
    const first = innings(h.state).bowlerId!;

    for (let i = 0; i < 3; i++) h.ball();
    h.changeBowlerMidOver('bowl-3');
    for (let i = 0; i < 3; i++) h.ball();

    expect(innings(h.state).legalBalls).toBe(6);
    expect(bowlerCard(h.state, first).maidens).toBe(0);
    expect(bowlerCard(h.state, 'bowl-3').maidens).toBe(0);
    // Both are credited the balls they actually bowled.
    expect(bowlerCard(h.state, first).legalBalls).toBe(3);
    expect(bowlerCard(h.state, 'bowl-3').legalBalls).toBe(3);
  });

  it('still awards a maiden when the over leaked only byes', () => {
    // Byes are not charged to the bowler, so the over is still a maiden.
    const h = harness();
    const bowler = innings(h.state).bowlerId!;
    h.ball({ extraType: 'bye', extraRuns: 2 });
    for (let i = 0; i < 5; i++) h.ball();
    expect(bowlerCard(h.state, bowler).maidens).toBe(1);
    expect(bowlerCard(h.state, bowler).runsConceded).toBe(0);
    expect(innings(h.state).runs).toBe(2);
  });
});

describe('§ 12 — innings and match end', () => {
  it('ends the innings immediately when the winning run comes off a no-ball', () => {
    const h = harness({ target: 2, inningsNo: 2, config: { oversPerInnings: 20 } });
    h.ball({ extraType: 'no_ball', runsOffBat: 1 });

    const i = innings(h.state);
    expect(i.runs).toBe(2);
    expect(i.status).toBe('completed');
    expect(i.endReason).toBe('target_reached');
  });

  it('ends at all out for a smaller side', () => {
    const h = harness({
      config: { playersPerSide: 8 },
      batting: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
    });

    for (let w = 0; w < 7; w++) {
      h.ball({ wicket: { type: 'bowled', dismissedPlayerId: h.striker() } });
    }

    const i = innings(h.state);
    expect(i.wickets).toBe(7);
    expect(i.status).toBe('completed');
    expect(i.endReason).toBe('all_out');
  });

  it('ends on overs complete', () => {
    const h = harness({ config: { oversPerInnings: 1 } });
    for (let i = 0; i < 6; i++) h.ball();
    const i = innings(h.state);
    expect(i.status).toBe('completed');
    expect(i.endReason).toBe('overs_complete');
  });

  it('leaves the correct batter at the crease when the non-striker is run out to end the innings', () => {
    const h = harness({ config: { playersPerSide: 3 }, batting: ['b1', 'b2', 'b3'] });
    // Two wickets ends a 3-a-side innings.
    const first = innings(h.state).strikerId!;
    h.ball({ wicket: { type: 'bowled', dismissedPlayerId: first } });

    const i1 = innings(h.state);
    const nonStriker = i1.nonStrikerId!;
    h.ball({
      wicket: {
        type: 'run_out',
        dismissedPlayerId: nonStriker,
        fielderId: 'field-1',
        crossedBeforeDismissal: false,
      },
    });

    const i = innings(h.state);
    expect(i.wickets).toBe(2);
    expect(i.endReason).toBe('all_out');
    expect(i.nonStrikerId).toBeNull();
  });
});

describe('§ 12 — bowler constraints', () => {
  it('rejects a bowler past the per-bowler cap', () => {
    // Three bowlers, cap of one over each, so that when bowl-1 is forced back
    // on for the third over they are blocked by the CAP and not merely by the
    // consecutive-over rule — which would fire first and mask this.
    const h = harness({
      config: { oversPerInnings: 4, maxOversPerBowler: 1 },
      bowlers: ['bowl-1', 'bowl-2', 'bowl-3'],
    });

    for (let i = 0; i < 12; i++) h.ball(); // two full overs
    expect(innings(h.state).previousBowlerId).not.toBe('bowl-1');

    h.useBowler('bowl-1');
    const rejected = h.expectReject();
    expect(rejected.error).toBe('BOWLER_LIMIT');
  });

  it('rejects the same bowler two overs running', () => {
    const h = harness({ bowlers: ['bowl-1', 'bowl-2'] });
    for (let i = 0; i < 6; i++) h.ball();
    h.useBowler('bowl-1');
    const rejected = h.expectReject();
    expect(rejected.error).toBe('CONSECUTIVE_OVER');
  });

  it("resolves 'auto' to ceil(overs / 5)", () => {
    const h = harness({ config: { oversPerInnings: 20, maxOversPerBowler: 'auto' } });
    // 4 overs × 6 balls = 24 legal balls before the cap bites.
    expect(h.state.config.maxOversPerBowler).toBe('auto');
  });
});

describe('§ 12 — alternative formats', () => {
  it('completes an over after 5 balls when ballsPerOver is 5 (The Hundred)', () => {
    const h = harness({ config: { ballsPerOver: 5 } });
    const bowler = innings(h.state).bowlerId!;
    for (let i = 0; i < 5; i++) h.ball();
    expect(innings(h.state).legalBalls).toBe(5);
    expect(innings(h.state).bowlerId).toBeNull();
    expect(bowlerCard(h.state, bowler).maidens).toBe(1);
  });

  it('continues at 7 down with 8 a side when last-man-standing is on', () => {
    const h = harness({
      config: { playersPerSide: 8, lastManStanding: true },
      batting: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8'],
    });

    for (let w = 0; w < 7; w++) {
      h.ball({ wicket: { type: 'bowled', dismissedPlayerId: h.striker() } });
    }

    const i = innings(h.state);
    expect(i.wickets).toBe(7);
    expect(i.status).toBe('in_progress');
    expect(i.strikerId).not.toBeNull();
    expect(i.nonStrikerId).toBeNull();
  });

  it('keeps the lone batter on strike through odd runs and over ends', () => {
    const h = harness({
      config: { playersPerSide: 2, lastManStanding: true },
      batting: ['b1', 'b2'],
    });
    h.ball({ wicket: { type: 'bowled', dismissedPlayerId: h.striker() } });

    const lone = h.striker();
    h.ball({ runsOffBat: 1 });
    expect(innings(h.state).strikerId).toBe(lone);

    // Two balls gone (the wicket and the single); four more completes the over.
    for (let i = 0; i < 4; i++) h.ball();
    expect(innings(h.state).legalBalls).toBe(6);
    expect(innings(h.state).strikerId).toBe(lone);
  });
});

describe('validation', () => {
  it('rejects a ball once the innings is complete', () => {
    const h = harness({ config: { oversPerInnings: 1 } });
    for (let i = 0; i < 6; i++) h.ball();
    const rejected = h.expectReject();
    expect(rejected.error).toBe('INNINGS_COMPLETE');
  });

  it('rejects negative runs', () => {
    const h = harness();
    const rejected = h.expectReject({ runsOffBat: -1 });
    expect(rejected.error).toBe('INVALID_INPUT');
  });

  it('rejects a dismissal of someone who is not at the crease', () => {
    const h = harness();
    const rejected = h.expectReject({
      wicket: { type: 'bowled', dismissedPlayerId: 'not-playing' },
    });
    expect(rejected.error).toBe('UNKNOWN_PLAYER');
  });

  it('leaves the caller state untouched on both success and failure', () => {
    const h = harness();
    const before = h.state;
    const runsBefore = innings(before).runs;
    h.ball({ runsOffBat: 4, isBoundary: true });
    // The original object is not mutated — applyDelivery clones.
    expect(innings(before).runs).toBe(runsBefore);
    expect(innings(h.state).runs).toBe(4);
  });
});

describe('milestones and events', () => {
  it('emits a fifty milestone as the batter crosses it', () => {
    // A long over, so the strike never rotates away mid-test and one batter
    // actually reaches the milestone.
    const h = harness({ config: { oversPerInnings: 20, ballsPerOver: 12 } });
    const striker = innings(h.state).strikerId!;

    // 9 sixes = 54, crossing 50 on the 9th.
    let milestone: number | null = null;
    for (let i = 0; i < 9; i++) {
      const events = h.ball({ runsOffBat: 6, isBoundary: true });
      const m = events.find((e) => e.type === 'MILESTONE');
      if (m && m.type === 'MILESTONE' && milestone === null) milestone = m.runs;
    }
    expect(milestone).toBe(50);
    expect(batter(h.state, striker).runs).toBe(54);
    expect(batter(h.state, striker).sixes).toBe(9);
  });

  it('emits OVER_COMPLETE and asks for a new bowler', () => {
    const h = harness();
    let events: ReturnType<typeof h.ball> = [];
    for (let i = 0; i < 6; i++) events = h.ball();
    expect(events.some((e) => e.type === 'OVER_COMPLETE')).toBe(true);
    expect(events.some((e) => e.type === 'NEW_BOWLER_REQUIRED')).toBe(true);
  });

  it('asks for a new batter after a wicket', () => {
    const h = harness();
    const striker = innings(h.state).strikerId!;
    const events = h.ball({ wicket: { type: 'bowled', dismissedPlayerId: striker } });
    expect(events.some((e) => e.type === 'NEW_BATTER_REQUIRED')).toBe(true);
    expect(events.some((e) => e.type === 'WICKET')).toBe(true);
  });
});

describe('retired hurt', () => {
  it('is not a wicket and the batter can return', () => {
    const h = harness({ config: { retiredHurtCanReturn: true } });
    const striker = innings(h.state).strikerId!;

    h.ball({ wicket: { type: 'retired_hurt', dismissedPlayerId: striker } });

    const i = innings(h.state);
    expect(i.wickets).toBe(0);
    expect(batter(h.state, striker).status).toBe('retired_hurt');
    expect(i.yetToBat).toContain(striker);
  });
});
