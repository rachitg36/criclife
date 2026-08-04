import { describe, expect, it } from 'vitest';
import { applyDelivery, setBowler, setNewBatter } from '../../src/engine/applyDelivery';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createInitialMatchState, deliveryToInput, replay } from '../../src/engine/replay';
import type { Delivery } from '../../src/engine/types';
import { ball } from './helpers';

const SEEDS = [{ inningsNo: 1, battingTeamId: 'teamA', bowlingTeamId: 'teamB' }];

function oneBallState() {
  let state = createInitialMatchState('replay-test', DEFAULT_CONFIG);
  state = {
    ...state,
    innings: [
      {
        inningsNo: 1,
        battingTeamId: 'teamA',
        bowlingTeamId: 'teamB',
        isSuperOver: false,
        runs: 0,
        wickets: 0,
        legalBalls: 0,
        extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
        strikerId: null,
        nonStrikerId: null,
        bowlerId: null,
        previousBowlerId: null,
        isFreeHit: false,
        target: null,
        revisedTarget: null,
        revisedOvers: null,
        batters: {},
        bowlers: {},
        fallOfWickets: [],
        yetToBat: [],
        status: 'in_progress' as const,
        endReason: null,
        currentOver: { bowlerIds: [], runs: 0 },
      },
    ],
    currentInningsIndex: 0,
  };
  state = setNewBatter(state, 's1');
  state = setNewBatter(state, 'ns1');
  state = setBowler(state, 'bowler1');
  return state;
}

describe('deliveryToInput / replay round-tripping', () => {
  it('round-trips a penalty delivery', () => {
    const state = oneBallState();
    const result = applyDelivery(state, ball({ extraType: 'penalty', penaltyRuns: 5 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const input = deliveryToInput(DEFAULT_CONFIG, result.delivery);
    expect(input.extraType).toBe('penalty');
    expect(input.penaltyRuns).toBe(5);

    const replayed = replay('replay-test', DEFAULT_CONFIG, [result.delivery], SEEDS);
    expect(replayed).toEqual(result.state);
  });

  it('round-trips a run-out with crossedBeforeDismissal recorded', () => {
    const state = oneBallState();
    const result = applyDelivery(
      state,
      ball({
        runsOffBat: 1,
        wicket: { type: 'run_out', dismissedPlayerId: 'ns1', crossedBeforeDismissal: true },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const input = deliveryToInput(DEFAULT_CONFIG, result.delivery);
    expect(input.wicket?.crossedBeforeDismissal).toBe(true);

    const replayed = replay('replay-test', DEFAULT_CONFIG, [result.delivery], SEEDS);
    expect(replayed).toEqual(result.state);
  });

  it('correcting an earlier-innings ball after play has moved on switches innings back and forth', () => {
    // A two-innings log where the very last row is a correction to innings 1
    // (docs/04-RULES-ENGINE.md §10 "edit an earlier ball": same seq, new
    // values, replay from the top) — exercises replay re-entering an innings
    // that isn't the most recently started one.
    const state = oneBallState();
    const firstBall = applyDelivery(state, ball({ runsOffBat: 1 }));
    expect(firstBall.ok).toBe(true);
    if (!firstBall.ok) return;

    let twoInnings = firstBall.state;
    twoInnings = {
      ...twoInnings,
      innings: [
        ...twoInnings.innings,
        {
          ...twoInnings.innings[0]!,
          inningsNo: 2,
          battingTeamId: 'teamB',
          bowlingTeamId: 'teamA',
          runs: 0,
          wickets: 0,
          legalBalls: 0,
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
          strikerId: null,
          nonStrikerId: null,
          bowlerId: null,
          previousBowlerId: null,
          batters: {},
          bowlers: {},
          fallOfWickets: [],
          currentOver: { bowlerIds: [], runs: 0 },
        },
      ],
      currentInningsIndex: 1,
    };
    twoInnings = setNewBatter(twoInnings, 's2');
    twoInnings = setNewBatter(twoInnings, 'ns2');
    twoInnings = setBowler(twoInnings, 'bowler2');
    const secondInningsBall = applyDelivery(twoInnings, ball({ runsOffBat: 2 }));
    expect(secondInningsBall.ok).toBe(true);
    if (!secondInningsBall.ok) return;

    const correctionForInnings1: Delivery = {
      ...firstBall.delivery,
      clientDeliveryId: 'correction-1',
      runsBatter: 4,
      runsTotal: 4,
      isBoundaryFour: true,
    };

    const log = [firstBall.delivery, secondInningsBall.delivery, correctionForInnings1];
    const seeds = [
      { inningsNo: 1, battingTeamId: 'teamA', bowlingTeamId: 'teamB' },
      { inningsNo: 2, battingTeamId: 'teamB', bowlingTeamId: 'teamA' },
    ];
    const replayed = replay('replay-test', DEFAULT_CONFIG, log, seeds);

    // The correction landed on innings 1 (the "current" innings switched
    // back), and its extra run was applied on top of the original ball.
    expect(replayed.currentInningsIndex).toBe(0);
    expect(replayed.innings[0]!.runs).toBe(1 + 4);
  });

  it('throws a descriptive error when a recorded delivery no longer replays cleanly', () => {
    // Ball 1 is a genuine no-ball (sets isFreeHit for the next ball). Ball 2
    // is a fabricated "bowled" dismissal on that free hit — a row that could
    // only exist in a corrupted/tampered log, since applyDelivery itself
    // would have refused to produce it at recording time.
    const state = oneBallState();
    const noBall = applyDelivery(state, ball({ extraType: 'no_ball', runsOffBat: 0 }));
    expect(noBall.ok).toBe(true);
    if (!noBall.ok) return;
    expect(noBall.state.innings[0]!.isFreeHit).toBe(true);

    const brokenDelivery: Delivery = {
      ...noBall.delivery,
      clientDeliveryId: 'broken-1',
      extraType: null,
      isLegal: true,
      isWicket: true,
      wicketType: 'bowled',
      dismissedPlayerId: 's1',
      isFreeHit: true,
    };

    expect(() =>
      replay('replay-test', DEFAULT_CONFIG, [noBall.delivery, brokenDelivery], SEEDS)
    ).toThrow(/REPLAY: applyDelivery failed/);
  });

  it('throws when a delivery names an innings with no matching seed', () => {
    const state = oneBallState();
    const result = applyDelivery(state, ball());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => replay('replay-test', DEFAULT_CONFIG, [result.delivery], [])).toThrow(
      /no innings seed for innings 1/
    );
  });

  it("innings 2's target is null when innings 1 isn't in the replayed log at all", () => {
    const state = oneBallState();
    const first = applyDelivery(state, ball({ runsOffBat: 1 }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    let twoInnings = first.state;
    twoInnings = {
      ...twoInnings,
      innings: [
        ...twoInnings.innings,
        {
          ...twoInnings.innings[0]!,
          inningsNo: 2,
          battingTeamId: 'teamB',
          bowlingTeamId: 'teamA',
          runs: 0,
          wickets: 0,
          legalBalls: 0,
          extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
          strikerId: null,
          nonStrikerId: null,
          bowlerId: null,
          previousBowlerId: null,
          batters: {},
          bowlers: {},
          fallOfWickets: [],
          currentOver: { bowlerIds: [], runs: 0 },
        },
      ],
      currentInningsIndex: 1,
    };
    twoInnings = setNewBatter(twoInnings, 's2');
    twoInnings = setNewBatter(twoInnings, 'ns2');
    twoInnings = setBowler(twoInnings, 'bowler2');
    const second = applyDelivery(twoInnings, ball({ runsOffBat: 1 }));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // Replay just innings 2's ball, without innings 1's ball in the log —
    // there's no prior innings to derive a target from.
    const replayed = replay(
      'replay-test',
      DEFAULT_CONFIG,
      [second.delivery],
      [{ inningsNo: 2, battingTeamId: 'teamB', bowlingTeamId: 'teamA' }]
    );
    expect(replayed.innings[0]!.target).toBeNull();
  });

  it('a super-over seed starts the match status at super_over', () => {
    const state = oneBallState();
    const result = applyDelivery(state, ball());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const superOverDelivery: Delivery = { ...result.delivery, inningsNo: 3 };
    const replayed = replay(
      'replay-test',
      DEFAULT_CONFIG,
      [superOverDelivery],
      [{ inningsNo: 3, battingTeamId: 'teamA', bowlingTeamId: 'teamB', isSuperOver: true }]
    );
    expect(replayed.status).toBe('super_over');
    expect(replayed.innings[0]!.isSuperOver).toBe(true);
  });

  it('round-trips fielderId and assistFielderId through a persisted wicket row', () => {
    const state = oneBallState();
    const result = applyDelivery(
      state,
      ball({
        wicket: {
          type: 'run_out',
          dismissedPlayerId: 'ns1',
          fielderId: 'fielder1',
          assistFielderId: 'fielder2',
          crossedBeforeDismissal: false,
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const input = deliveryToInput(DEFAULT_CONFIG, result.delivery);
    expect(input.wicket?.fielderId).toBe('fielder1');
    expect(input.wicket?.assistFielderId).toBe('fielder2');

    const replayed = replay('replay-test', DEFAULT_CONFIG, [result.delivery], SEEDS);
    expect(replayed).toEqual(result.state);
  });
});

/**
 * The state every match is in between `start_innings` and the first ball —
 * innings rows exist, the delivery log is empty — and the one nothing
 * replayed until a real match was set up against a real database.
 *
 * Innings used to be created only inside the per-delivery path, so with no
 * deliveries `replay` returned `innings: []`. The scorer pad reads
 * `innings[currentInningsIndex]` to decide what to show, found nothing, and
 * reported the innings as not started — while the server had already started
 * it. Pressing "Start the innings" again inserted nothing and changed nothing.
 * A brand-new match could not be scored at all.
 */
describe('replay of a started innings with no deliveries', () => {
  it('materialises the innings the seeds describe', () => {
    const state = replay('replay-test', DEFAULT_CONFIG, [], SEEDS);

    expect(state.innings).toHaveLength(1);
    expect(state.currentInningsIndex).toBe(0);
    expect(state.innings[0]?.inningsNo).toBe(1);
    expect(state.innings[0]?.battingTeamId).toBe('teamA');
    // Nobody is in yet — this is exactly the AWAITING_OPENERS the pad wants.
    expect(state.innings[0]?.strikerId).toBeNull();
    expect(state.innings[0]?.bowlerId).toBeNull();
    expect(state.innings[0]?.status).toBe('in_progress');
  });

  it('gives a fresh second innings the target the first innings actually set', () => {
    // Why this runs after the fold, not before: `targetFor` reads the previous
    // innings' runs, which are zero until its deliveries are applied. Seeding
    // innings 2 up front gave it a target of 1, and the three match fixtures
    // caught it — innings 2 ended on its first scoring shot.
    const seeds = [
      { inningsNo: 1, battingTeamId: 'teamA', bowlingTeamId: 'teamB' },
      { inningsNo: 2, battingTeamId: 'teamB', bowlingTeamId: 'teamA' },
    ];
    const first = applyDelivery(oneBallState(), ball({ runsOffBat: 4 }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const state = replay('replay-test', DEFAULT_CONFIG, [first.delivery], seeds);

    expect(state.innings).toHaveLength(2);
    expect(state.innings[0]?.runs).toBe(4);
    expect(state.innings[1]?.target).toBe(5);
    expect(state.innings[1]?.status).toBe('in_progress');
    expect(state.currentInningsIndex).toBe(1);
  });

  it('still returns an empty match when there are no seeds either', () => {
    const state = replay('replay-test', DEFAULT_CONFIG, [], []);
    expect(state.innings).toHaveLength(0);
    expect(state.currentInningsIndex).toBe(-1);
  });
});
