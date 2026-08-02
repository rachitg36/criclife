import { describe, expect, it } from 'vitest';
import { buildDismissalText } from '../../src/engine/dismissals';
import type { WicketType } from '../../src/engine/types';

describe('buildDismissalText', () => {
  it('bowled', () => {
    expect(buildDismissalText('bowled', 'bowler1', null)).toBe('b bowler1');
  });

  it('caught, with and without a named fielder (c & b)', () => {
    expect(buildDismissalText('caught', 'bowler1', 'fielder1')).toBe('c fielder1 b bowler1');
    expect(buildDismissalText('caught', 'bowler1', null)).toBe('c & b bowler1');
  });

  it('lbw', () => {
    expect(buildDismissalText('lbw', 'bowler1', null)).toBe('lbw b bowler1');
  });

  it('stumped', () => {
    expect(buildDismissalText('stumped', 'bowler1', 'keeper1')).toBe('st keeper1 b bowler1');
  });

  it('hit_wicket', () => {
    expect(buildDismissalText('hit_wicket', 'bowler1', null)).toBe('hit wicket b bowler1');
  });

  it('run_out, with and without a named fielder', () => {
    expect(buildDismissalText('run_out', null, 'fielder1')).toBe('run out (fielder1)');
    expect(buildDismissalText('run_out', null, null)).toBe('run out');
  });

  it('obstructing_the_field', () => {
    expect(buildDismissalText('obstructing_the_field', null, null)).toBe('obstructing the field');
  });

  it('hit_ball_twice', () => {
    expect(buildDismissalText('hit_ball_twice', null, null)).toBe('hit the ball twice');
  });

  it('timed_out', () => {
    expect(buildDismissalText('timed_out', null, null)).toBe('timed out');
  });

  it('retired_out', () => {
    expect(buildDismissalText('retired_out', null, null)).toBe('retired out');
  });

  it('retired_hurt', () => {
    expect(buildDismissalText('retired_hurt', null, null)).toBe('retired hurt');
  });

  it('handled_the_ball (merged into obstructing under current Laws)', () => {
    expect(buildDismissalText('handled_the_ball', null, null)).toBe('obstructing the field');
  });

  it('covers every WicketType — nothing falls through to the exhaustiveness guard', () => {
    const allTypes: WicketType[] = [
      'bowled',
      'caught',
      'lbw',
      'run_out',
      'stumped',
      'hit_wicket',
      'retired_out',
      'retired_hurt',
      'obstructing_the_field',
      'handled_the_ball',
      'timed_out',
      'hit_ball_twice',
    ];
    for (const type of allTypes) {
      expect(() => buildDismissalText(type, 'bowler1', 'fielder1')).not.toThrow();
    }
  });
});
