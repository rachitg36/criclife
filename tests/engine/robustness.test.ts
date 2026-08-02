import { describe, expect, it } from 'vitest';
import {
  applyDelivery,
  cloneMatch,
  createMatch,
  makeConfig,
  replay,
  type Delivery,
  type DeliveryInput,
  type MatchState,
} from '@/engine';
import { harness, innings } from './harness';

/**
 * Guard rails. Every branch here exists because the engine may be handed a
 * state it did not build — a row replayed from Postgres, a half-synced offline
 * queue, or a client a version behind. The engine must degrade to a typed
 * error rather than throw, because a throw in the scoring pad loses the ball.
 */

function input(overrides: Partial<DeliveryInput> = {}): DeliveryInput {
  return {
    clientDeliveryId: 'd-1',
    runsOffBat: 0,
    extraType: null,
    extraRuns: 0,
    isBoundary: false,
    wicket: null,
    ...overrides,
  };
}

function matchWith(mutate: (state: MatchState) => void): MatchState {
  const h = harness();
  const state = cloneMatch(h.state);
  mutate(state);
  return state;
}

describe('validation guards', () => {
  it('rejects a match with no innings at all', () => {
    const state = createMatch({ matchId: 'm', config: makeConfig() });
    const result = applyDelivery(state, input());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INVALID_INPUT');
  });

  it('rejects when no striker is set', () => {
    const state = matchWith((s) => {
      s.innings[0]!.strikerId = null;
    });
    const result = applyDelivery(state, input());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('NO_STRIKER');
  });

  it('rejects when no non-striker is set, unless batting alone is allowed', () => {
    const state = matchWith((s) => {
      s.innings[0]!.nonStrikerId = null;
    });
    const blocked = applyDelivery(state, input());
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe('NO_STRIKER');

    // The same state is fine in last-man-standing.
    const allowed = applyDelivery(
      { ...state, config: { ...state.config, lastManStanding: true } },
      input()
    );
    expect(allowed.ok).toBe(true);
  });

  it('rejects when no bowler is set', () => {
    const state = matchWith((s) => {
      s.innings[0]!.bowlerId = null;
    });
    const result = applyDelivery(state, input());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('NO_BOWLER');
  });

  it('rejects when the same player fills two roles', () => {
    const sameBatters = matchWith((s) => {
      s.innings[0]!.nonStrikerId = s.innings[0]!.strikerId;
    });
    const a = applyDelivery(sameBatters, input());
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toBe('SAME_PLAYER');

    const bowlerIsStriker = matchWith((s) => {
      s.innings[0]!.bowlerId = s.innings[0]!.strikerId;
    });
    const b = applyDelivery(bowlerIsStriker, input());
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error).toBe('SAME_PLAYER');

    const bowlerIsNonStriker = matchWith((s) => {
      s.innings[0]!.bowlerId = s.innings[0]!.nonStrikerId;
    });
    const c = applyDelivery(bowlerIsNonStriker, input());
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toBe('SAME_PLAYER');
  });

  it('rejects negative extra runs', () => {
    const h = harness();
    const result = applyDelivery(h.state, input({ extraRuns: -2 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INVALID_INPUT');
  });

  it('explains an illegal dismissal differently on a free hit', () => {
    const h = harness();
    const onNormal = h.expectReject({
      extraType: 'wide',
      wicket: { type: 'bowled', dismissedPlayerId: h.striker() },
    });
    expect(onNormal.message).toContain('on this delivery');

    h.ball({ extraType: 'no_ball' });
    const onFreeHit = h.expectReject({
      wicket: { type: 'bowled', dismissedPlayerId: h.striker() },
    });
    expect(onFreeHit.message).toContain('on a free hit');
  });

  it('rebuilds a missing batter card rather than throwing', () => {
    // Simulates a state where the crease references a batter with no card.
    const state = matchWith((s) => {
      const i = s.innings[0]!;
      delete i.batters[i.strikerId!];
    });

    const result = applyDelivery(state, input({ runsOffBat: 4, isBoundary: true }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const i = result.state.innings[0]!;
    expect(i.batters[i.nonStrikerId ?? '']).toBeDefined();
    expect(i.runs).toBe(4);
  });

  it('rebuilds a missing dismissed-batter card rather than throwing', () => {
    // The NON-striker's card, specifically: the striker's is recreated by the
    // batter step before the wicket step ever runs, so only a non-striker
    // dismissal exercises the guard in step 8.
    const state = matchWith((s) => {
      const i = s.innings[0]!;
      delete i.batters[i.nonStrikerId!];
    });
    const nonStriker = state.innings[0]!.nonStrikerId!;

    const result = applyDelivery(
      state,
      input({
        wicket: {
          type: 'run_out',
          dismissedPlayerId: nonStriker,
          fielderId: 'f1',
          crossedBeforeDismissal: false,
        },
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const i = result.state.innings[0]!;
    expect(i.wickets).toBe(1);
    expect(i.batters[nonStriker]?.status).toBe('out');
  });
});

describe('penalty runs', () => {
  /**
   * NOTE: per docs/04 § 4 step 2, `isLegal` is true for a penalty, so it ticks
   * the over along. That is almost certainly wrong under the Laws — penalty
   * runs are awarded, not bowled — but it is what the spec says, and the
   * engine implements the spec. Flagged for a doc decision; this test pins
   * the current behaviour so a fix is a deliberate change, not a surprise.
   */
  it('adds the awarded runs to the penalty bucket', () => {
    const h = harness();
    h.ball({ extraType: 'penalty', penaltyRuns: 5 });

    const i = innings(h.state);
    expect(i.runs).toBe(5);
    expect(i.extras.penalty).toBe(5);
    // Neither batter nor bowler is charged.
    expect(i.batters[i.strikerId!]?.runs).toBe(0);
  });

  it('defaults to zero when no penalty amount is given', () => {
    const h = harness();
    h.ball({ extraType: 'penalty' });
    expect(innings(h.state).extras.penalty).toBe(0);
  });

  it('does not rotate the strike — nobody ran', () => {
    const h = harness();
    const before = innings(h.state).strikerId;
    h.ball({ extraType: 'penalty', penaltyRuns: 5 });
    expect(innings(h.state).strikerId).toBe(before);
  });
});

describe('retired out', () => {
  it('counts as a wicket and marks the card accordingly', () => {
    const h = harness();
    const striker = h.striker();
    h.ball({ wicket: { type: 'retired_out', dismissedPlayerId: striker } });

    const i = innings(h.state);
    expect(i.wickets).toBe(1);
    expect(i.batters[striker]?.status).toBe('retired_out');
    expect(i.yetToBat).not.toContain(striker);
  });

  it('does not return a retired-hurt batter when the config forbids it', () => {
    const h = harness({ config: { retiredHurtCanReturn: false } });
    const striker = h.striker();
    h.ball({ wicket: { type: 'retired_hurt', dismissedPlayerId: striker } });

    const i = innings(h.state);
    expect(i.wickets).toBe(0);
    expect(i.yetToBat).not.toContain(striker);
  });
});

describe('optional delivery metadata', () => {
  it('stores wagon-wheel and pitch-map coordinates when supplied', () => {
    const h = harness();
    h.ball({
      runsOffBat: 4,
      isBoundary: true,
      shot: { x: 0.42, y: -0.17 },
      pitch: { x: -0.3, y: 0.8 },
    });

    const d = h.deliveries[0]!;
    expect(d.shotX).toBe(0.42);
    expect(d.shotY).toBe(-0.17);
    expect(d.pitchX).toBe(-0.3);
    expect(d.pitchY).toBe(0.8);
  });

  it('leaves them null when omitted', () => {
    const h = harness();
    h.ball();
    const d = h.deliveries[0]!;
    expect(d.shotX).toBeNull();
    expect(d.pitchY).toBeNull();
  });
});

describe('replay failure', () => {
  it('reports the seq it stopped at rather than throwing', () => {
    // An initial state with no innings cannot accept any delivery.
    const empty = createMatch({ matchId: 'm', config: makeConfig() });
    const log: Delivery[] = [
      {
        clientDeliveryId: 'd-1',
        seq: 7,
        inningsNo: 1,
        overNo: 0,
        ballInOver: 1,
        isLegal: true,
        strikerId: 'b1',
        nonStrikerId: 'b2',
        bowlerId: 'bo1',
        runsBatter: 1,
        runsExtras: 0,
        extraType: null,
        runsTotal: 1,
        isWicket: false,
        wicketType: null,
        dismissedPlayerId: null,
        fielderId: null,
        assistFielderId: null,
        crossedBeforeDismissal: null,
        isFreeHit: false,
        createsFreeHit: false,
        isBoundaryFour: false,
        isBoundarySix: false,
        shotX: null,
        shotY: null,
        pitchX: null,
        pitchY: null,
        commentary: '',
        isDeleted: false,
      },
    ];

    const result = replay(empty, log);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('INVALID_INPUT');
    expect(result.failedAtSeq).toBe(7);
  });

  it('skips soft-deleted rows entirely', () => {
    const h = harness();
    h.ball({ runsOffBat: 4, isBoundary: true });
    h.ball({ runsOffBat: 2 });

    const log = h.deliveries.map((d, i) => ({ ...d, isDeleted: i === 1 }));
    const result = replay(h.initialState(), log);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.applied).toBe(1);
    expect(result.state.innings[0]!.runs).toBe(4);
  });

  it('applies rows in seq order regardless of array order', () => {
    const h = harness();
    h.ball({ runsOffBat: 1 });
    h.ball({ runsOffBat: 2 });
    h.ball({ runsOffBat: 3 });

    const shuffled = [h.deliveries[2]!, h.deliveries[0]!, h.deliveries[1]!];
    const result = replay(h.initialState(), shuffled);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.innings[0]!.runs).toBe(6);
  });
});

describe('cloning', () => {
  it('clones a tied result, whose margin is null', () => {
    const h = harness();
    const tied: MatchState = {
      ...h.state,
      result: {
        kind: 'tie',
        winnerTeamId: null,
        margin: null,
        viaSuperOver: false,
        text: 'match tied',
      },
    };
    const clone = cloneMatch(tied);
    expect(clone.result).toEqual(tied.result);
    expect(clone.result).not.toBe(tied.result);
  });

  it('clones an innings deeply, including dismissals and fall of wickets', () => {
    const h = harness();
    h.ball({ wicket: { type: 'caught', dismissedPlayerId: h.striker(), fielderId: 'f1' } });

    const clone = cloneMatch(h.state);
    const original = innings(h.state);
    const copied = clone.innings[0]!;

    copied.fallOfWickets[0]!.runs = 999;
    expect(original.fallOfWickets[0]?.runs).toBe(0);

    const outId = original.fallOfWickets[0]!.batterId;
    copied.batters[outId]!.dismissal!.atRuns = 999;
    expect(original.batters[outId]?.dismissal?.atRuns).toBe(0);
  });

  it('restores the crease from the log when replaying mid-innings changes', () => {
    const h = harness({ config: { oversPerInnings: 5 } });
    // A wicket forces a new batter, and the over change forces a new bowler —
    // both are implied by the next delivery's record, not stored separately.
    h.ball({ wicket: { type: 'bowled', dismissedPlayerId: h.striker() } });
    for (let i = 0; i < 6; i++) h.ball({ runsOffBat: 1 });

    const result = replay(h.initialState(), h.deliveries);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.innings[0]!.runs).toBe(innings(h.state).runs);
    expect(result.state.innings[0]!.wickets).toBe(1);
  });
});

describe('super over innings', () => {
  it('ends at two wickets down', () => {
    const h = harness({
      config: { oversPerInnings: 1, playersPerSide: 3 },
      batting: ['s1', 's2', 's3'],
      bowlers: ['sb1', 'sb2'],
      isSuperOver: true,
    });

    h.ball({ wicket: { type: 'bowled', dismissedPlayerId: h.striker() } });
    h.ball({ wicket: { type: 'bowled', dismissedPlayerId: h.striker() } });

    const i = innings(h.state);
    expect(i.wickets).toBe(2);
    expect(i.status).toBe('completed');
    expect(i.endReason).toBe('all_out');
    expect(i.isSuperOver).toBe(true);
  });
});
