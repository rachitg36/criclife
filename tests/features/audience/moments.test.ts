import { describe, expect, it } from 'vitest';
import { applyDelivery, setBowler } from '../../../src/engine/applyDelivery';
import { DEFAULT_CONFIG } from '../../../src/engine/config';
import { detectMoments, inLastOver, isHatTrickBall } from '../../../src/features/audience/moments';
import { ball, createTestMatch } from '../../engine/helpers';
import { logged } from './helpers';
import type { MatchState, WicketType } from '../../../src/engine/types';

const config = DEFAULT_CONFIG;

/** Applies one ball and hands back everything `detectMoments` needs. */
function play(before: MatchState, input = ball()) {
  const result = applyDelivery(before, input);
  if (!result.ok) throw new Error(`test setup: ${result.error}`);
  return {
    moments: detectMoments({
      delivery: result.delivery,
      events: result.events,
      before,
      after: result.state,
      config,
    }),
    after: result.state,
  };
}

const kinds = (ms: { kind: string }[]) => ms.map((m) => m.kind);

describe('detectMoments', () => {
  it('fires FOUR on a boundary four', () => {
    const { moments } = play(createTestMatch(), ball({ runsOffBat: 4, isBoundary: true }));
    expect(kinds(moments)).toContain('four');
    expect(moments[0]!.durationMs).toBe(350);
  });

  it('fires SIX, not FOUR, on a six', () => {
    const { moments } = play(createTestMatch(), ball({ runsOffBat: 6, isBoundary: true }));
    expect(kinds(moments)).toEqual(['six']);
    expect(moments[0]!.durationMs).toBe(900);
  });

  it('fires nothing for a dot ball', () => {
    expect(play(createTestMatch()).moments).toEqual([]);
  });

  it('fires WICKET on a dismissal', () => {
    const { moments } = play(
      createTestMatch(),
      ball({ wicket: { type: 'bowled', dismissedPlayerId: 's1' } })
    );
    expect(kinds(moments)).toContain('wicket');
  });

  it('does not celebrate a retired hurt — it is a substitution, not a dismissal', () => {
    const { moments } = play(
      createTestMatch(),
      ball({ wicket: { type: 'retired_hurt', dismissedPlayerId: 's1' } })
    );
    expect(kinds(moments)).not.toContain('wicket');
  });

  it('fires FIFTY off the engine milestone event', () => {
    const state = createTestMatch({}, { runs: 46, legalBalls: 30 });
    const seeded: MatchState = {
      ...state,
      innings: state.innings.map((i) => ({
        ...i,
        batters: { ...i.batters, s1: { ...i.batters.s1!, runs: 48, balls: 30 } },
      })),
    };
    const { moments } = play(seeded, ball({ runsOffBat: 4, isBoundary: true }));
    expect(kinds(moments)).toEqual(expect.arrayContaining(['four', 'fifty']));
  });

  it('fires MAIDEN when an over completes with no runs off the bowler', () => {
    let state = createTestMatch();
    for (let i = 0; i < 5; i += 1) {
      const r = applyDelivery(state, ball());
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    const { moments } = play(state);
    expect(kinds(moments)).toContain('maiden');
  });

  it('fires FINAL OVER exactly once, on the ball that enters it', () => {
    // 18.5 overs of 20 bowled: the ball below completes over 19, which is
    // exactly when the final over becomes the next thing to happen.
    const state = createTestMatch({}, { legalBalls: 19 * 6 - 1, runs: 100 });
    const first = play(state);
    expect(kinds(first.moments)).toContain('last_over');

    // Entering the final over is necessarily an over boundary, so a bowler has
    // to be named again before the next ball — same as the real pad.
    const second = play(setBowler(first.after, 'bowler2'));
    expect(kinds(second.moments)).not.toContain('last_over');
  });
});

describe('isHatTrickBall', () => {
  const wicket = (bowlerId: string, type: WicketType = 'bowled') =>
    logged({ bowlerId, isWicket: true, wicketType: type, dismissedPlayerId: 's1' });

  it('is false with no bowler', () => {
    expect(isHatTrickBall([], null)).toBe(false);
  });

  it('is false after one wicket', () => {
    expect(isHatTrickBall([wicket('b1')], 'b1')).toBe(false);
  });

  it('is true after two consecutive wickets by the same bowler', () => {
    expect(isHatTrickBall([wicket('b1'), wicket('b1')], 'b1')).toBe(true);
  });

  it('ignores balls bowled from the other end — a hat-trick spans overs', () => {
    const log = [wicket('b1'), logged({ bowlerId: 'b2' }), logged({ bowlerId: 'b2' }), wicket('b1')];
    expect(isHatTrickBall(log, 'b1')).toBe(true);
  });

  it('is broken by a non-wicket delivery from the same bowler', () => {
    expect(isHatTrickBall([wicket('b1'), logged({ bowlerId: 'b1' }), wicket('b1')], 'b1')).toBe(
      false
    );
  });

  it('is broken by a wide in between', () => {
    const log = [
      wicket('b1'),
      logged({ bowlerId: 'b1', extraType: 'wide', isLegal: false, runsExtras: 1 }),
      wicket('b1'),
    ];
    expect(isHatTrickBall(log, 'b1')).toBe(false);
  });

  it('does not count a run out — the bowler dismissed nobody on that ball', () => {
    expect(isHatTrickBall([wicket('b1'), wicket('b1', 'run_out')], 'b1')).toBe(false);
  });

  it('is false for a different bowler than the one on the streak', () => {
    expect(isHatTrickBall([wicket('b1'), wicket('b1')], 'b2')).toBe(false);
  });
});

describe('inLastOver', () => {
  it('is false mid-innings', () => {
    expect(inLastOver(createTestMatch({}, { legalBalls: 60 }), config)).toBe(false);
  });

  it('is true inside the final over', () => {
    expect(inLastOver(createTestMatch({}, { legalBalls: 19 * 6 }), config)).toBe(true);
  });

  it('is false once the overs are gone — there is no "final over" left to be in', () => {
    expect(inLastOver(createTestMatch({}, { legalBalls: 20 * 6 }), config)).toBe(false);
  });

  it('is false for a completed innings', () => {
    expect(
      inLastOver(createTestMatch({}, { legalBalls: 19 * 6, status: 'completed' }), config)
    ).toBe(false);
  });
});
