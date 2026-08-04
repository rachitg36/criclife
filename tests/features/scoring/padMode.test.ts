import { describe, expect, it } from 'vitest';
import { padModeForInnings } from '@/features/scoring/padMode';

/**
 * Reported from a real match stuck at 14-1: reloading the pad after a wicket
 * asked "Who is on strike?" and then "Who is the non-striker?" — the openers
 * picker — and offered the batter who was still at the crease as a candidate.
 *
 * `init` decided the mode with `strikerId === null || nonStrikerId === null`,
 * which is true both at the start of an innings and after every dismissal.
 */
describe('padModeForInnings', () => {
  it('asks for two openers only when both ends are empty', () => {
    expect(padModeForInnings({ strikerId: null, nonStrikerId: null, bowlerId: null })).toBe(
      'AWAITING_OPENERS'
    );
  });

  it('asks for one batter when a wicket has emptied an end', () => {
    expect(padModeForInnings({ strikerId: null, nonStrikerId: 'p2', bowlerId: 'p6' })).toBe(
      'AWAITING_BATTER'
    );
    expect(padModeForInnings({ strikerId: 'p2', nonStrikerId: null, bowlerId: 'p6' })).toBe(
      'AWAITING_BATTER'
    );
  });

  it('asks for a batter before a bowler — somebody has to be in first', () => {
    expect(padModeForInnings({ strikerId: 'p2', nonStrikerId: null, bowlerId: null })).toBe(
      'AWAITING_BATTER'
    );
  });

  it('asks for a bowler at the end of an over', () => {
    expect(padModeForInnings({ strikerId: 'p2', nonStrikerId: 'p3', bowlerId: null })).toBe(
      'AWAITING_BOWLER'
    );
  });

  it('is ready when both ends and the bowler are set', () => {
    expect(padModeForInnings({ strikerId: 'p2', nonStrikerId: 'p3', bowlerId: 'p6' })).toBe(
      'READY'
    );
  });
});
