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
  it('demands openers for a brand new innings', () => {
    expect(padModeForInnings({ status: 'in_progress', strikerId: null, nonStrikerId: null, bowlerId: null })).toBe(
      'AWAITING_OPENERS'
    );
  });

  it('demands a single batter after a wicket', () => {
    expect(
      padModeForInnings({ status: 'in_progress', strikerId: 'p1', nonStrikerId: null, bowlerId: 'p2' })
    ).toBe('AWAITING_BATTER');
  });

  it('demands a bowler before the first ball is bowled', () => {
    expect(
      padModeForInnings({ status: 'in_progress', strikerId: 'p1', nonStrikerId: 'p2', bowlerId: null })
    ).toBe('AWAITING_BOWLER');
  });

  it('evaluates READY when all actors are known', () => {
    expect(
      padModeForInnings({ status: 'in_progress', strikerId: 'p1', nonStrikerId: 'p2', bowlerId: 'p3' })
    ).toBe('READY');
  });
});
