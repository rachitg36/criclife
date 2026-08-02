import { describe, expect, it } from 'vitest';
import { generateCommentary } from '../../src/engine/commentary';
import type { Delivery, WicketType } from '../../src/engine/types';

function baseDelivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    inningsNo: 1,
    overNo: 0,
    ballInOver: 1,
    isLegal: true,
    strikerId: 'striker1',
    nonStrikerId: 'nonStriker1',
    bowlerId: 'bowler1',
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
    commentary: '',
    clientDeliveryId: 'cid-fixed',
    ...overrides,
  };
}

describe('generateCommentary — non-wicket deliveries', () => {
  it('a dot ball', () => {
    expect(generateCommentary(baseDelivery())).toBe('bowler1 to striker1, no run');
  });

  it('a single run (singular wording)', () => {
    expect(generateCommentary(baseDelivery({ runsBatter: 1, runsTotal: 1 }))).toBe(
      'bowler1 to striker1, 1 run'
    );
  });

  it('multiple runs (plural wording)', () => {
    expect(generateCommentary(baseDelivery({ runsBatter: 3, runsTotal: 3 }))).toBe(
      'bowler1 to striker1, 3 runs'
    );
  });

  it('a four picks a deterministic phrase from the pool', () => {
    const line = generateCommentary(
      baseDelivery({ runsBatter: 4, runsTotal: 4, isBoundaryFour: true })
    );
    expect(line).toMatch(/^bowler1 to striker1, FOUR! .+/);
  });

  it('a six picks a deterministic phrase from the pool', () => {
    const line = generateCommentary(
      baseDelivery({ runsBatter: 6, runsTotal: 6, isBoundarySix: true })
    );
    expect(line).toMatch(/^bowler1 to striker1, SIX! .+/);
  });

  it('the same clientDeliveryId always yields the same boundary phrase (determinism)', () => {
    const d = baseDelivery({ runsBatter: 6, runsTotal: 6, isBoundarySix: true });
    expect(generateCommentary(d)).toBe(generateCommentary(d));
  });

  it('a wide', () => {
    expect(generateCommentary(baseDelivery({ extraType: 'wide', runsExtras: 1, runsTotal: 1 }))).toBe(
      'bowler1 to striker1, wide'
    );
  });

  it('a no-ball with no runs off the bat', () => {
    expect(
      generateCommentary(baseDelivery({ extraType: 'no_ball', runsExtras: 1, runsTotal: 1 }))
    ).toBe('bowler1 to striker1, NO BALL');
  });

  it('a no-ball hit for runs appends the run count', () => {
    expect(
      generateCommentary(
        baseDelivery({ extraType: 'no_ball', runsBatter: 4, runsExtras: 1, runsTotal: 5 })
      )
    ).toBe('bowler1 to striker1, NO BALL, 4 runs');
  });

  it('byes (plural and singular)', () => {
    expect(generateCommentary(baseDelivery({ extraType: 'bye', runsExtras: 4, runsTotal: 4 }))).toBe(
      'bowler1 to striker1, 4 byes'
    );
    expect(generateCommentary(baseDelivery({ extraType: 'bye', runsExtras: 1, runsTotal: 1 }))).toBe(
      'bowler1 to striker1, 1 bye'
    );
  });

  it('leg byes (plural and singular)', () => {
    expect(
      generateCommentary(baseDelivery({ extraType: 'leg_bye', runsExtras: 2, runsTotal: 2 }))
    ).toBe('bowler1 to striker1, 2 leg byes');
    expect(
      generateCommentary(baseDelivery({ extraType: 'leg_bye', runsExtras: 1, runsTotal: 1 }))
    ).toBe('bowler1 to striker1, 1 leg bye');
  });
});

describe('generateCommentary — wicket deliveries, every WicketType', () => {
  const cases: Array<{ type: WicketType; overrides?: Partial<Delivery>; expect: string | RegExp }> = [
    { type: 'bowled', expect: 'bowler1 to striker1, BOWLED HIM! striker1 b bowler1' },
    {
      type: 'caught',
      overrides: { fielderId: 'fielder1' },
      expect: 'bowler1 to striker1, CAUGHT! c fielder1 b bowler1',
    },
    { type: 'caught', expect: 'bowler1 to striker1, CAUGHT! c & b bowler1' },
    { type: 'lbw', expect: 'bowler1 to striker1, LBW!' },
    { type: 'hit_wicket', expect: 'bowler1 to striker1, HIT WICKET!' },
    {
      type: 'run_out',
      overrides: { fielderId: 'fielder1' },
      expect: /RUN OUT! striker1 run out \(fielder1\)/,
    },
    { type: 'run_out', expect: 'bowler1 to striker1, RUN OUT! striker1 run out' },
    {
      type: 'stumped',
      overrides: { fielderId: 'keeper1' },
      expect: 'bowler1 to striker1, STUMPED! st keeper1 b bowler1',
    },
    { type: 'obstructing_the_field', expect: /OBSTRUCTING THE FIELD! striker1 given out/ },
    { type: 'handled_the_ball', expect: /OBSTRUCTING THE FIELD! striker1 given out/ },
    { type: 'hit_ball_twice', expect: /OUT! striker1 hit the ball twice/ },
    { type: 'timed_out', expect: 'striker1 timed out' },
    { type: 'retired_out', expect: 'striker1 retires, out' },
    { type: 'retired_hurt', expect: 'striker1 retires hurt' },
  ];

  for (const { type, overrides, expect: expected } of cases) {
    it(type + (overrides?.fielderId ? ' (with fielder)' : ''), () => {
      const line = generateCommentary(
        baseDelivery({ isWicket: true, wicketType: type, dismissedPlayerId: 'striker1', ...overrides })
      );
      if (typeof expected === 'string') expect(line).toBe(expected);
      else expect(line).toMatch(expected);
    });
  }
});

describe('generateCommentary — milestones', () => {
  it('appends a fifty note', () => {
    expect(generateCommentary(baseDelivery({ runsBatter: 1, runsTotal: 1 }), 'fifty')).toBe(
      "bowler1 to striker1, 1 run — that's a fifty for striker1!"
    );
  });

  it('appends a hundred note', () => {
    expect(generateCommentary(baseDelivery({ runsBatter: 1, runsTotal: 1 }), 'hundred')).toBe(
      'bowler1 to striker1, 1 run — a hundred for striker1!'
    );
  });
});
