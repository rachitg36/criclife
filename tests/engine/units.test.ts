import { describe, expect, it } from 'vitest';
import {
  allOutWickets,
  applyDelivery,
  ballsAllowed,
  ballsRemaining,
  bowlingAverage,
  bowlingStrikeRate,
  canDismissNonStriker,
  cloneMatch,
  consumesBall,
  createBatter,
  createBowler,
  createInnings,
  createMatch,
  currentRunRate,
  dotPercentFaced,
  economy,
  effectiveTarget,
  fielderCreditFor,
  generateCommentary,
  getCurrentPowerplay,
  hasBattersRemaining,
  howOutText,
  isLoneBatter,
  maidenText,
  makeConfig,
  maxBallsPerBowler,
  milestoneText,
  oversDecimal,
  oversDisplay,
  profile,
  projectedScore,
  PROFILES,
  requiredRate,
  requiredRuns,
  resolveMaxOvers,
  runsThatCrossed,
  scorecard,
  sendInNextBatter,
  setBowler,
  strikeRate,
  swapEnds,
  toDeliveryInput,
  totalExtras,
  undoLastDelivery,
  type Delivery,
  type Dismissal,
  type WicketType,
} from '@/engine';
import { harness, innings } from './harness';

/** A stored delivery with sane defaults, for the pure projections. */
function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    clientDeliveryId: 'd-1',
    seq: 1,
    inningsNo: 1,
    overNo: 0,
    ballInOver: 1,
    isLegal: true,
    strikerId: 'bat-1',
    nonStrikerId: 'bat-2',
    bowlerId: 'bowl-1',
    runsBatter: 0,
    runsExtras: 0,
    extraType: null,
    runsTotal: 0,
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
    ...overrides,
  };
}

describe('config', () => {
  it("resolves 'auto' to ceil(overs / 5) and reproduces every built-in cap", () => {
    expect(resolveMaxOvers(makeConfig({ oversPerInnings: 20, maxOversPerBowler: 'auto' }))).toBe(4);
    expect(resolveMaxOvers(makeConfig({ oversPerInnings: 50, maxOversPerBowler: 'auto' }))).toBe(
      10
    );
    expect(resolveMaxOvers(makeConfig({ oversPerInnings: 10, maxOversPerBowler: 'auto' }))).toBe(2);
    expect(resolveMaxOvers(makeConfig({ oversPerInnings: 8, maxOversPerBowler: 'auto' }))).toBe(2);
    expect(resolveMaxOvers(makeConfig({ oversPerInnings: 7, maxOversPerBowler: 3 }))).toBe(3);
  });

  it('converts the cap to legal balls', () => {
    expect(maxBallsPerBowler(makeConfig({ oversPerInnings: 20, ballsPerOver: 6 }))).toBe(24);
    expect(
      maxBallsPerBowler(makeConfig({ oversPerInnings: 20, ballsPerOver: 5, maxOversPerBowler: 4 }))
    ).toBe(20);
  });

  it('matches the § 1 profile table', () => {
    expect(PROFILES.t20.oversPerInnings).toBe(20);
    expect(PROFILES.t20.maxOversPerBowler).toBe(4);
    expect(PROFILES.odi.oversPerInnings).toBe(50);
    expect(PROFILES.odi.powerplays).toHaveLength(3);
    expect(PROFILES.t10.maxOversPerBowler).toBe(2);
    // The Hundred: 20 overs of 5 = 100 balls, 4 overs = a 20-ball cap.
    expect(PROFILES.hundred.ballsPerOver).toBe(5);
    expect(PROFILES.hundred.oversPerInnings * PROFILES.hundred.ballsPerOver).toBe(100);
    expect(maxBallsPerBowler(PROFILES.hundred)).toBe(20);
    expect(PROFILES.gully8.powerplays).toEqual([]);
  });

  it('returns a defensive copy from profile()', () => {
    const a = profile('t20');
    a.powerplays[0]!.fromOver = 99;
    expect(PROFILES.t20.powerplays[0]?.fromOver).toBe(1);
  });

  it('finds the powerplay covering the over in progress', () => {
    const t20 = profile('t20');
    // No balls bowled → over 1 → inside PP1 (overs 1–6).
    expect(getCurrentPowerplay(t20, 0)?.name).toBe('PP1');
    // 35 balls = 5.5 overs → over 6, still PP1.
    expect(getCurrentPowerplay(t20, 35)?.name).toBe('PP1');
    // 36 balls = over 7 → out of PP1.
    expect(getCurrentPowerplay(t20, 36)).toBeNull();
    expect(getCurrentPowerplay(profile('gully8'), 0)).toBeNull();
  });

  it('drops the all-out threshold by one, unless last-man-standing', () => {
    expect(allOutWickets(makeConfig({ playersPerSide: 11 }))).toBe(10);
    expect(allOutWickets(makeConfig({ playersPerSide: 11, lastManStanding: true }))).toBe(11);
  });
});

describe('dismissal helpers', () => {
  it('assigns the right fielding credit', () => {
    expect(fielderCreditFor('caught')).toBe('catch');
    expect(fielderCreditFor('run_out')).toBe('run_out');
    expect(fielderCreditFor('stumped')).toBe('stumping');
    expect(fielderCreditFor('bowled')).toBeNull();
  });

  it('knows that only a timed-out consumes no ball', () => {
    expect(consumesBall('timed_out')).toBe(false);
    expect(consumesBall('bowled')).toBe(true);
  });

  it('knows which dismissals can remove the non-striker', () => {
    expect(canDismissNonStriker('run_out')).toBe(true);
    expect(canDismissNonStriker('obstructing_the_field')).toBe(true);
    expect(canDismissNonStriker('retired_hurt')).toBe(true);
    expect(canDismissNonStriker('retired_out')).toBe(true);
    expect(canDismissNonStriker('bowled')).toBe(false);
    expect(canDismissNonStriker('caught')).toBe(false);
  });
});

describe('strike helpers', () => {
  const config = makeConfig({ wideRuns: 1 });
  const base = {
    runsBatter: 0,
    runsExtras: 0,
    isBoundaryFour: false,
    isBoundarySix: false,
    wicketType: null,
    crossedBeforeDismissal: null,
  };

  it('discounts the automatic wide run when counting crossings', () => {
    expect(runsThatCrossed({ ...base, extraType: 'wide', runsExtras: 1 }, config)).toBe(0);
    expect(runsThatCrossed({ ...base, extraType: 'wide', runsExtras: 3 }, config)).toBe(2);
  });

  it('counts every bye and leg-bye as a crossing', () => {
    expect(runsThatCrossed({ ...base, extraType: 'bye', runsExtras: 2 }, config)).toBe(2);
    expect(runsThatCrossed({ ...base, extraType: 'leg_bye', runsExtras: 1 }, config)).toBe(1);
  });

  it('counts no crossings on a penalty — nobody ran', () => {
    expect(runsThatCrossed({ ...base, extraType: 'penalty', runsExtras: 5 }, config)).toBe(0);
  });

  it('uses runs off the bat otherwise', () => {
    expect(runsThatCrossed({ ...base, extraType: null, runsBatter: 3 }, config)).toBe(3);
    expect(runsThatCrossed({ ...base, extraType: 'no_ball', runsBatter: 1 }, config)).toBe(1);
  });

  it('detects a lone batter only in last-man-standing mode', () => {
    expect(isLoneBatter(makeConfig({ lastManStanding: true }), 'a', null)).toBe(true);
    expect(isLoneBatter(makeConfig({ lastManStanding: true }), null, 'b')).toBe(true);
    expect(isLoneBatter(makeConfig({ lastManStanding: true }), 'a', 'b')).toBe(false);
    expect(isLoneBatter(makeConfig({ lastManStanding: false }), 'a', null)).toBe(false);
  });

  it('swaps ends, preserving nulls', () => {
    expect(swapEnds('a', 'b')).toEqual(['b', 'a']);
    expect(swapEnds<string | null>('a', null)).toEqual([null, 'a']);
  });
});

describe('innings end helpers', () => {
  it('honours revised overs and targets', () => {
    const i = createInnings({
      inningsNo: 2,
      battingTeamId: 'h',
      bowlingTeamId: 'a',
      battingOrder: ['b1', 'b2', 'b3'],
      target: 200,
    });
    const config = makeConfig({ oversPerInnings: 20, ballsPerOver: 6 });

    expect(ballsAllowed(i, config)).toBe(120);
    expect(effectiveTarget(i)).toBe(200);

    i.revisedOvers = 10;
    i.revisedTarget = 100;
    expect(ballsAllowed(i, config)).toBe(60);
    expect(effectiveTarget(i)).toBe(100);
  });

  it('knows when a side has run out of batters', () => {
    const config = makeConfig({ lastManStanding: false });
    const i = createInnings({
      inningsNo: 1,
      battingTeamId: 'h',
      bowlingTeamId: 'a',
      battingOrder: ['b1', 'b2', 'b3'],
    });

    expect(hasBattersRemaining(i, config)).toBe(true);

    i.yetToBat = [];
    expect(hasBattersRemaining(i, config)).toBe(true); // two still at the crease

    i.nonStrikerId = null;
    expect(hasBattersRemaining(i, config)).toBe(false);
    expect(hasBattersRemaining(i, makeConfig({ lastManStanding: true }))).toBe(true);

    i.strikerId = null;
    expect(hasBattersRemaining(i, makeConfig({ lastManStanding: true }))).toBe(false);
  });
});

describe('projections', () => {
  it('formats overs from legal balls', () => {
    expect(oversDisplay(0, 6)).toBe('0.0');
    expect(oversDisplay(7, 6)).toBe('1.1');
    expect(oversDisplay(10, 5)).toBe('2.0');
    expect(oversDecimal(9, 6)).toBe(1.5);
  });

  it('returns null rather than NaN before any ball is bowled', () => {
    const h = harness();
    const i = innings(h.state);
    expect(currentRunRate(i, h.state.config)).toBeNull();
    expect(projectedScore(i, h.state.config)).toBeNull();
    expect(requiredRuns(i)).toBeNull();
    expect(requiredRate(i, h.state.config)).toBeNull();
  });

  it('computes rates once the innings is under way', () => {
    const h = harness({ config: { oversPerInnings: 20 } });
    for (let n = 0; n < 6; n++) h.ball({ runsOffBat: 1 });

    const i = innings(h.state);
    expect(currentRunRate(i, h.state.config)).toBe(6);
    expect(ballsRemaining(i, h.state.config)).toBe(114);
    expect(projectedScore(i, h.state.config)).toBe(120);
    expect(totalExtras(i)).toBe(0);
  });

  it('computes the chase numbers', () => {
    const h = harness({ config: { oversPerInnings: 20 }, inningsNo: 2, target: 121 });
    for (let n = 0; n < 6; n++) h.ball({ runsOffBat: 1 });

    const i = innings(h.state);
    expect(requiredRuns(i)).toBe(115);
    expect(requiredRate(i, h.state.config)).toBeCloseTo(115 / 19, 6);
  });

  it('reports no required rate once the balls run out, rather than Infinity', () => {
    // Target of 10 off one over, six singles scored — the chase falls short
    // with nothing left to bowl.
    const h = harness({ config: { oversPerInnings: 1 }, inningsNo: 2, target: 10 });
    for (let n = 0; n < 6; n++) h.ball({ runsOffBat: 1 });

    const i = innings(h.state);
    expect(i.runs).toBe(6);
    expect(requiredRuns(i)).toBe(4);
    expect(ballsRemaining(i, h.state.config)).toBe(0);
    expect(requiredRate(i, h.state.config)).toBeNull();
  });

  it('clamps the requirement at zero once the target is passed', () => {
    const i = createInnings({
      inningsNo: 2,
      battingTeamId: 'h',
      bowlingTeamId: 'a',
      battingOrder: ['b1', 'b2'],
      target: 100,
    });
    i.runs = 120;
    expect(requiredRuns(i)).toBe(0);
  });

  it('computes batting and bowling rates, with nulls where undefined', () => {
    const fresh = createBatter('b1', 1);
    expect(strikeRate(fresh)).toBeNull();
    expect(dotPercentFaced(fresh)).toBeNull();

    const scored = { ...fresh, runs: 30, balls: 20, dots: 5 };
    expect(strikeRate(scored)).toBe(150);
    expect(dotPercentFaced(scored)).toBe(25);

    const idle = createBowler('bo1');
    expect(economy(idle, 6)).toBeNull();
    expect(bowlingAverage(idle)).toBeNull();
    expect(bowlingStrikeRate(idle)).toBeNull();

    const worked = { ...idle, legalBalls: 24, runsConceded: 36, wickets: 3 };
    expect(economy(worked, 6)).toBe(9);
    expect(bowlingAverage(worked)).toBe(12);
    expect(bowlingStrikeRate(worked)).toBe(8);
  });
});

describe('scorecard', () => {
  const names = { 'bowl-1': 'Jones', 'field-1': 'Smith', 'field-2': 'Rao', 'bat-1': 'Khan' };

  function dismissal(type: WicketType, extra: Partial<Dismissal> = {}): Dismissal {
    return {
      type,
      bowlerId: 'bowl-1',
      fielderId: 'field-1',
      assistFielderId: null,
      atRuns: 10,
      atLegalBalls: 12,
      ...extra,
    };
  }

  it('renders every dismissal in the shorthand a cricketer reads', () => {
    expect(howOutText(null)).toBeNull();
    expect(howOutText(dismissal('bowled'), names)).toBe('b Jones');
    expect(howOutText(dismissal('caught'), names)).toBe('c Smith b Jones');
    expect(howOutText(dismissal('lbw'), names)).toBe('lbw b Jones');
    expect(howOutText(dismissal('stumped'), names)).toBe('st Smith b Jones');
    expect(howOutText(dismissal('hit_wicket'), names)).toBe('hit wicket b Jones');
    expect(howOutText(dismissal('run_out'), names)).toBe('run out (Smith)');
    expect(howOutText(dismissal('run_out', { assistFielderId: 'field-2' }), names)).toBe(
      'run out (Rao/Smith)'
    );
    expect(howOutText(dismissal('obstructing_the_field'), names)).toBe('obstructing the field');
    expect(howOutText(dismissal('handled_the_ball'), names)).toBe('obstructing the field');
    expect(howOutText(dismissal('hit_ball_twice'), names)).toBe('hit the ball twice');
    expect(howOutText(dismissal('timed_out'), names)).toBe('timed out');
    expect(howOutText(dismissal('retired_out'), names)).toBe('retired out');
    expect(howOutText(dismissal('retired_hurt'), names)).toBe('retired hurt');
  });

  it('falls back to the player id when no name is known', () => {
    expect(howOutText(dismissal('bowled'))).toBe('b bowl-1');
    expect(howOutText(dismissal('bowled', { bowlerId: null }))).toBe('b unknown');
  });

  it('builds a full card with batting, bowling and fall of wickets', () => {
    const h = harness({ config: { oversPerInnings: 5 } });
    h.ball({ runsOffBat: 4, isBoundary: true });
    h.ball({ extraType: 'wide' });
    h.ball({ wicket: { type: 'bowled', dismissedPlayerId: h.striker() } });

    const card = scorecard(h.state).innings[0]!;
    expect(card.runs).toBe(5);
    expect(card.wickets).toBe(1);
    expect(card.extrasTotal).toBe(1);
    expect(card.overs).toBe('0.2');
    expect(card.batting[0]?.howOut).toBe('b bowl-1');
    expect(card.batting[0]?.strikeRate).toBe(200);
    expect(card.bowling[0]?.wickets).toBe(1);
    expect(card.fallOfWickets[0]?.overs).toBe('0.2');
    expect(card.didNotBat.length).toBeGreaterThan(0);
    expect(card.status).toBe('in_progress');
    expect(card.endReason).toBeNull();
  });

  it('uses super-over rules for a super-over innings', () => {
    const h = harness({ config: { oversPerInnings: 20 }, isSuperOver: true });
    h.ball({ runsOffBat: 1 });
    const card = scorecard(h.state);
    expect(card.innings[0]?.overs).toBe('0.1');
    expect(card.matchId).toBe('match-test');
    expect(card.result).toBeNull();
  });
});

describe('commentary', () => {
  const names = { 'bowl-1': 'Jones', 'bat-1': 'Khan', 'bat-2': 'Patel', 'field-1': 'Smith' };

  it('describes runs off the bat', () => {
    expect(generateCommentary(delivery(), names)).toBe('Jones to Khan, no run');
    expect(generateCommentary(delivery({ runsBatter: 1, runsTotal: 1 }), names)).toBe(
      'Jones to Khan, 1 run'
    );
    expect(generateCommentary(delivery({ runsBatter: 3, runsTotal: 3 }), names)).toBe(
      'Jones to Khan, 3 runs'
    );
  });

  it('describes boundaries with a phrase', () => {
    const four = generateCommentary(
      delivery({ runsBatter: 4, runsTotal: 4, isBoundaryFour: true }),
      names
    );
    expect(four).toMatch(/^Jones to Khan, FOUR! .+/);

    const six = generateCommentary(
      delivery({ runsBatter: 6, runsTotal: 6, isBoundarySix: true }),
      names
    );
    expect(six).toMatch(/^Jones to Khan, SIX! .+/);
  });

  it('picks the same phrase every time for the same ball', () => {
    const d = delivery({ runsBatter: 4, runsTotal: 4, isBoundaryFour: true });
    expect(generateCommentary(d, names)).toBe(generateCommentary(d, names));
  });

  it('varies the phrase across different balls', () => {
    const lines = new Set(
      Array.from({ length: 20 }, (_, i) =>
        generateCommentary(
          delivery({
            clientDeliveryId: `x-${i}`,
            runsBatter: 4,
            runsTotal: 4,
            isBoundaryFour: true,
          }),
          names
        )
      )
    );
    expect(lines.size).toBeGreaterThan(1);
  });

  it('describes extras', () => {
    expect(
      generateCommentary(delivery({ extraType: 'wide', runsExtras: 1, runsTotal: 1 }), names)
    ).toBe('Jones to Khan, wide');
    expect(
      generateCommentary(delivery({ extraType: 'wide', runsExtras: 3, runsTotal: 3 }), names)
    ).toBe('Jones to Khan, wide, 3 runs');
    expect(
      generateCommentary(delivery({ extraType: 'no_ball', runsExtras: 1, runsTotal: 1 }), names)
    ).toBe('Jones to Khan, NO BALL');
    expect(
      generateCommentary(
        delivery({ extraType: 'no_ball', runsExtras: 1, runsBatter: 4, runsTotal: 5 }),
        names
      )
    ).toBe('Jones to Khan, NO BALL, 5 runs');
    expect(
      generateCommentary(delivery({ extraType: 'bye', runsExtras: 1, runsTotal: 1 }), names)
    ).toBe('Jones to Khan, 1 bye');
    expect(
      generateCommentary(delivery({ extraType: 'bye', runsExtras: 2, runsTotal: 2 }), names)
    ).toBe('Jones to Khan, 2 byes');
    expect(
      generateCommentary(delivery({ extraType: 'leg_bye', runsExtras: 1, runsTotal: 1 }), names)
    ).toBe('Jones to Khan, 1 leg bye');
    expect(
      generateCommentary(delivery({ extraType: 'leg_bye', runsExtras: 3, runsTotal: 3 }), names)
    ).toBe('Jones to Khan, 3 leg byes');
    expect(
      generateCommentary(delivery({ extraType: 'penalty', runsExtras: 5, runsTotal: 5 }), names)
    ).toBe('5 penalty runs');
    expect(
      generateCommentary(delivery({ extraType: 'penalty', runsExtras: 1, runsTotal: 1 }), names)
    ).toBe('1 penalty run');
  });

  it('describes every dismissal', () => {
    const wicket = (type: WicketType, extra: Partial<Delivery> = {}) =>
      generateCommentary(
        delivery({
          isWicket: true,
          wicketType: type,
          dismissedPlayerId: 'bat-1',
          fielderId: 'field-1',
          ...extra,
        }),
        names,
        { batterRuns: 25, batterBalls: 18 }
      );

    expect(wicket('bowled')).toBe('Jones to Khan, BOWLED HIM! Khan b Jones 25(18)');
    expect(wicket('caught')).toBe('Jones to Khan, CAUGHT! c Smith b Jones 25(18)');
    expect(wicket('lbw')).toBe('Jones to Khan, LBW! 25(18)');
    expect(wicket('stumped')).toBe('Jones to Khan, STUMPED! st Smith b Jones');
    expect(wicket('run_out')).toBe('Jones to Khan, RUN OUT! Khan run out (Smith)');
    expect(wicket('hit_wicket')).toBe('Jones to Khan, HIT WICKET! Khan hit wicket b Jones 25(18)');
    expect(wicket('retired_hurt')).toBe('Khan retires hurt');
    expect(wicket('retired_out')).toBe('Khan retires out');
    expect(wicket('timed_out')).toBe('Khan is timed out');
    expect(wicket('obstructing_the_field')).toBe('Jones to Khan, OUT! Khan obstructing the field');
    expect(wicket('handled_the_ball')).toBe('Jones to Khan, OUT! Khan obstructing the field');
    expect(wicket('hit_ball_twice')).toBe('Jones to Khan, OUT! Khan hit the ball twice');
  });

  it('omits the card when the batter totals are unknown', () => {
    expect(
      generateCommentary(
        delivery({ isWicket: true, wicketType: 'bowled', dismissedPlayerId: 'bat-1' }),
        names
      )
    ).toBe('Jones to Khan, BOWLED HIM! Khan b Jones');
  });

  it('falls back to ids when names are missing', () => {
    expect(generateCommentary(delivery())).toBe('bowl-1 to bat-1, no run');
  });

  it('writes milestone and maiden suffixes', () => {
    expect(milestoneText(50, 'Khan')).toBe("That's a 50 for Khan!");
    expect(milestoneText(100, 'Khan')).toBe("That's a hundred for Khan!");
    expect(milestoneText(150, 'Khan')).toBe("That's a 150 for Khan!");
    expect(maidenText()).toBe('MAIDEN over');
  });

  it('honours a scorer override', () => {
    const h = harness();
    h.ball({ runsOffBat: 4, isBoundary: true, commentaryOverride: 'Absolute filth, put away.' });
    expect(h.deliveries[0]?.commentary).toBe('Absolute filth, put away.');
  });

  it('appends the milestone and maiden text to generated lines', () => {
    const h = harness({ config: { ballsPerOver: 1 } });
    // One-ball overs: a single dot ball is a maiden.
    h.ball();
    expect(h.deliveries[0]?.commentary).toContain('MAIDEN over');
  });

  it('uses supplied names in the milestone suffix, falling back to the id', () => {
    const config = makeConfig({ oversPerInnings: 20, ballsPerOver: 12 });
    const state = createMatch({
      matchId: 'm',
      config,
      innings: [
        createInnings({
          inningsNo: 1,
          battingTeamId: 'h',
          bowlingTeamId: 'a',
          battingOrder: ['bat-1', 'bat-2', 'bat-3'],
          bowlerId: 'bowl-1',
        }),
      ],
    });

    // Eight sixes gets to 48; the ninth crosses fifty.
    let named = state;
    for (let n = 0; n < 9; n++) {
      const result = applyDelivery(
        named,
        {
          clientDeliveryId: `n-${n}`,
          runsOffBat: 6,
          extraType: null,
          extraRuns: 0,
          isBoundary: true,
          wicket: null,
        },
        { names: { 'bat-1': 'Khan', 'bowl-1': 'Jones' } }
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      named = result.state;
      if (n === 8) expect(result.delivery.commentary).toContain("That's a 50 for Khan!");
    }

    // Without a name lookup the id stands in, rather than throwing.
    let anon = state;
    for (let n = 0; n < 9; n++) {
      const result = applyDelivery(anon, {
        clientDeliveryId: `a-${n}`,
        runsOffBat: 6,
        extraType: null,
        extraRuns: 0,
        isBoundary: true,
        wicket: null,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      anon = result.state;
      if (n === 8) expect(result.delivery.commentary).toContain("That's a 50 for bat-1!");
    }
  });
});

describe('state helpers', () => {
  it('creates an innings with explicit openers', () => {
    const i = createInnings({
      inningsNo: 1,
      battingTeamId: 'h',
      bowlingTeamId: 'a',
      battingOrder: ['b1', 'b2', 'b3', 'b4'],
      strikerId: 'b3',
      nonStrikerId: 'b4',
    });
    expect(i.strikerId).toBe('b3');
    expect(i.nonStrikerId).toBe('b4');
    expect(i.yetToBat).toEqual(['b1', 'b2']);
    expect(i.batters['b3']?.battingPosition).toBe(1);
  });

  it('handles an empty batting order without throwing', () => {
    const i = createInnings({
      inningsNo: 1,
      battingTeamId: 'h',
      bowlingTeamId: 'a',
      battingOrder: [],
    });
    expect(i.strikerId).toBeNull();
    expect(i.nonStrikerId).toBeNull();
    expect(i.batters).toEqual({});
  });

  it('starts a match in setup with no innings', () => {
    const m = createMatch({ matchId: 'm', config: makeConfig() });
    expect(m.status).toBe('setup');
    expect(m.innings).toEqual([]);
    expect(m.toss).toBeNull();
  });

  it('sends in a batter at whichever end is empty', () => {
    const i = createInnings({
      inningsNo: 1,
      battingTeamId: 'h',
      bowlingTeamId: 'a',
      battingOrder: ['b1', 'b2', 'b3'],
    });

    i.strikerId = null;
    sendInNextBatter(i, 'b3');
    expect(i.strikerId).toBe('b3');
    expect(i.yetToBat).not.toContain('b3');

    // A second call with both ends full changes nothing.
    sendInNextBatter(i, 'b3');
    expect(i.strikerId).toBe('b3');

    i.nonStrikerId = null;
    i.batters['b4'] = createBatter('b4', 4);
    sendInNextBatter(i, 'b4');
    expect(i.nonStrikerId).toBe('b4');
  });

  it('creates a bowler record only once', () => {
    const i = createInnings({
      inningsNo: 1,
      battingTeamId: 'h',
      bowlingTeamId: 'a',
      battingOrder: ['b1', 'b2'],
    });
    setBowler(i, 'bo1');
    i.bowlers['bo1']!.runsConceded = 12;
    setBowler(i, 'bo1');
    expect(i.bowlers['bo1']?.runsConceded).toBe(12);
  });

  it('deep-clones a match, including the result', () => {
    const h = harness({ config: { oversPerInnings: 1, playersPerSide: 3 } });
    for (let n = 0; n < 6; n++) h.ball({ runsOffBat: 1 });

    const clone = cloneMatch(h.state);
    clone.innings[0]!.runs = 999;
    expect(innings(h.state).runs).toBe(6);

    const withResult = cloneMatch({
      ...h.state,
      result: {
        kind: 'win',
        winnerTeamId: 'h',
        margin: { by: 'runs', value: 5 },
        viaSuperOver: false,
        text: 'won by 5 runs',
      },
      toss: { winnerTeamId: 'h', decision: 'bat' },
    });
    expect(withResult.result?.margin).toEqual({ by: 'runs', value: 5 });
    expect(withResult.toss?.decision).toBe('bat');
  });
});

describe('replay helpers', () => {
  const config = makeConfig({ wideRuns: 1, noBallRuns: 1 });

  it('reconstructs the input for every extra type', () => {
    expect(toDeliveryInput(delivery({ extraType: 'wide', runsExtras: 3 }), config).extraRuns).toBe(
      2
    );
    expect(
      toDeliveryInput(delivery({ extraType: 'no_ball', runsExtras: 1, runsBatter: 4 }), config)
        .extraRuns
    ).toBe(0);
    expect(toDeliveryInput(delivery({ extraType: 'bye', runsExtras: 2 }), config).extraRuns).toBe(
      2
    );
    expect(
      toDeliveryInput(delivery({ extraType: 'leg_bye', runsExtras: 1 }), config).extraRuns
    ).toBe(1);
    expect(
      toDeliveryInput(delivery({ extraType: 'penalty', runsExtras: 5 }), config).penaltyRuns
    ).toBe(5);
    expect(toDeliveryInput(delivery(), config).extraRuns).toBe(0);
  });

  it('carries the wicket, shot and pitch through', () => {
    const input = toDeliveryInput(
      delivery({
        isWicket: true,
        wicketType: 'run_out',
        dismissedPlayerId: 'bat-2',
        fielderId: 'f1',
        assistFielderId: 'f2',
        crossedBeforeDismissal: true,
        shotX: 0.5,
        shotY: -0.25,
        pitchX: 0.1,
        pitchY: 0.2,
        isBoundaryFour: true,
      }),
      config
    );

    expect(input.wicket).toEqual({
      type: 'run_out',
      dismissedPlayerId: 'bat-2',
      fielderId: 'f1',
      assistFielderId: 'f2',
      crossedBeforeDismissal: true,
    });
    expect(input.shot).toEqual({ x: 0.5, y: -0.25 });
    expect(input.pitch).toEqual({ x: 0.1, y: 0.2 });
    expect(input.isBoundary).toBe(true);
  });

  it('drops an incomplete wicket record rather than inventing one', () => {
    expect(
      toDeliveryInput(delivery({ isWicket: true, wicketType: null }), config).wicket
    ).toBeNull();
  });

  it('soft-deletes the highest live seq, and tolerates an empty log', () => {
    const log = [delivery({ seq: 1 }), delivery({ seq: 3 }), delivery({ seq: 2 })];
    const once = undoLastDelivery(log);
    expect(once.find((d) => d.seq === 3)?.isDeleted).toBe(true);

    const twice = undoLastDelivery(once);
    expect(twice.find((d) => d.seq === 2)?.isDeleted).toBe(true);
    expect(twice.filter((d) => d.isDeleted)).toHaveLength(2);

    expect(undoLastDelivery([])).toEqual([]);
    // A fully deleted log is a no-op rather than an error.
    const allDeleted = [delivery({ seq: 1, isDeleted: true })];
    expect(undoLastDelivery(allDeleted)[0]?.isDeleted).toBe(true);
  });
});
