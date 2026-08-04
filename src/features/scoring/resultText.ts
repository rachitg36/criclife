import type { MatchResult } from '@/engine/types';

/**
 * Turns a `MatchResult` into a sentence with team *names* in it.
 *
 * `computeMatchResult` already builds a `text`, but the engine is pure and
 * knows nothing but ids, so that string reads:
 *
 *   75cfbb5d-664e-4ed0-a0cc-6a67f48989a7 won by 2 wickets
 *
 * which is what the very first completed match actually showed a human. The
 * engine cannot fix this without being handed team names, and handing it
 * display strings would make every score depend on them. So the sentence is
 * rebuilt here, from the parts the engine does export — `winnerTeamId`,
 * `marginRuns`, `marginWickets` — which is the layer that knows what a team
 * is called.
 *
 * Pure, so it can be tested without a database.
 */
export function resultText(
  result: MatchResult | null,
  nameFor: (teamId: string) => string
): string {
  if (!result) return 'The match has ended.';

  const winner = result.winnerTeamId ? nameFor(result.winnerTeamId) : null;

  if (result.type === 'tie') return 'Match tied.';
  if (result.type === 'draw') return 'Match drawn.';
  if (result.type === 'no_result') return 'No result.';
  if (result.type === 'abandoned') return 'Match abandoned.';
  if (!winner) return result.text;

  if (result.type === 'forfeit') return `${winner} won by forfeit.`;
  const superOver = result.type === 'super_over_win' ? ' in the Super Over' : '';

  if (result.marginRuns !== null && result.marginRuns > 0) {
    return `${winner} won by ${plural(result.marginRuns, 'run')}${superOver}.`;
  }
  if (result.marginWickets !== null && result.marginWickets > 0) {
    return `${winner} won by ${plural(result.marginWickets, 'wicket')}${superOver}.`;
  }
  return `${winner} won${superOver}.`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
