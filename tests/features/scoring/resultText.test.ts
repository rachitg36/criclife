import { describe, expect, it } from 'vitest';
import { resultText } from '@/features/scoring/resultText';
import type { MatchResult } from '@/engine/types';

/**
 * The first match ever completed in this app announced its winner as
 *
 *   75cfbb5d-664e-4ed0-a0cc-6a67f48989a7 won by 2 wickets
 *
 * The engine is pure and knows only ids, so its own `result.text` cannot say
 * otherwise. This is the layer that knows what a team is called.
 */
const NAMES: Record<string, string> = { 'team-a': 'TM1', 'team-b': 'TM2' };
const nameFor = (id: string) => NAMES[id] ?? id;

const result = (over: Partial<MatchResult>): MatchResult =>
  ({
    type: 'win',
    winnerTeamId: 'team-b',
    marginRuns: null,
    marginWickets: 2,
    text: 'team-b won by 2 wickets',
    ...over,
  }) as MatchResult;

describe('resultText', () => {
  it('names the winner instead of printing their id', () => {
    const text = resultText(result({}), nameFor);
    expect(text).toBe('TM2 won by 2 wickets.');
    expect(text).not.toMatch(/team-b/);
  });

  it('says runs when the side batting first defended', () => {
    expect(
      resultText(result({ winnerTeamId: 'team-a', marginRuns: 14, marginWickets: null }), nameFor)
    ).toBe('TM1 won by 14 runs.');
  });

  it('gets the singular right', () => {
    expect(resultText(result({ marginWickets: 1 }), nameFor)).toBe('TM2 won by 1 wicket.');
    expect(resultText(result({ marginRuns: 1, marginWickets: null }), nameFor)).toBe(
      'TM2 won by 1 run.'
    );
  });

  it('handles the results that have no winner', () => {
    expect(resultText(result({ type: 'tie' }), nameFor)).toBe('Match tied.');
    expect(resultText(result({ type: 'draw' }), nameFor)).toBe('Match drawn.');
    expect(resultText(result({ type: 'no_result' }), nameFor)).toBe('No result.');
    expect(resultText(result({ type: 'abandoned' }), nameFor)).toBe('Match abandoned.');
  });

  it('mentions the super over, since that is the whole story of the match', () => {
    expect(resultText(result({ type: 'super_over_win' }), nameFor)).toBe(
      'TM2 won by 2 wickets in the Super Over.'
    );
  });

  it('handles a forfeit and a win with no margin', () => {
    expect(resultText(result({ type: 'forfeit' }), nameFor)).toBe('TM2 won by forfeit.');
    expect(resultText(result({ marginRuns: null, marginWickets: null }), nameFor)).toBe('TM2 won.');
  });

  it('says something sensible before a result exists', () => {
    expect(resultText(null, nameFor)).toBe('The match has ended.');
  });

  it('falls back to the engine text when the winner is unknown', () => {
    const r = result({ winnerTeamId: null, text: 'something happened' });
    expect(resultText(r, nameFor)).toBe('something happened');
  });
});
