import type { InningsState, MatchConfig, MatchResult } from '@/engine/types';

/**
 * A few sentences about how the match actually went.
 *
 * A finished match currently offers a result line and a wall of numbers. All
 * the interesting facts are already in `InningsState` — who chose to bat, how
 * close it finished, whether anyone made fifty, whether a bowler ran through
 * a side — and nobody ever put them into words. Requested on 2026-08-04:
 * "since you have a lot of information, can you write some nice sentence…".
 *
 * Rules this follows, because a generated sentence that overclaims is worse
 * than no sentence:
 *
 * - **Only what the data says.** Every line below is a fact with a threshold,
 *   not a judgement. There is no "brilliant", no "collapse".
 * - **Nothing when there is nothing.** A dull match gets one line, or none.
 *   Padding out three sentences about a 12-run game is how this reads as
 *   machine-written.
 * - **Pure.** No dates, no `Math.random`, no store. Same match in, same words
 *   out — which is also what makes it testable.
 */
export type NarrativeInput = {
  innings: readonly InningsState[];
  config: MatchConfig;
  result: MatchResult | null;
  nameOfTeam: (teamId: string) => string;
  nameOfPlayer: (playerId: string) => string;
};

/** A margin this thin is the story, whatever else happened. */
const THRILLER_RUNS = 10;
const THRILLER_WICKETS = 2;
/** Balls to spare, below which a chase counts as going to the wire. */
const DOWN_TO_THE_WIRE_BALLS = 6;

export function buildNarrative(input: NarrativeInput): string[] {
  const { innings, config, result, nameOfTeam, nameOfPlayer } = input;
  // Super overs are their own drama and their own scale; a one-over innings
  // has no run rate worth remarking on. The tie that caused it is covered by
  // the result line instead.
  const main = innings.filter((i) => !i.isSuperOver);
  const [first, second] = main;
  if (!first) return [];

  const lines: string[] = [];

  lines.push(tossLine(first, nameOfTeam));

  lines.push(inningsLine(first, config, nameOfTeam, nameOfPlayer));

  if (second) {
    // The chase sentence *is* the second innings' sentence when there is a
    // chase to describe. When there is not — a tie, where "fell 0 runs short"
    // would be both wrong and bleak — fall back to the plain summary, so the
    // side that batted second is never simply left out.
    lines.push(
      chaseLine(second, first, config, nameOfTeam) ??
        inningsLine(second, config, nameOfTeam, nameOfPlayer)
    );
  }

  const bowling = bestBowlingLine(main, nameOfPlayer);
  if (bowling) lines.push(bowling);

  const drama = dramaLine(result, nameOfTeam);
  if (drama) lines.push(drama);

  return lines;
}

/**
 * The toss is inferred, not read.
 *
 * `MatchState` does not carry the toss — only `matches.toss_winner_team_id`
 * does, and this module is pure — but whoever batted first either chose to or
 * was put in, and the sentence works either way if it says only what is
 * certain: this side batted first.
 */
function tossLine(first: InningsState, nameOfTeam: (id: string) => string): string {
  return `${nameOfTeam(first.battingTeamId)} batted first against ${nameOfTeam(first.bowlingTeamId)}.`;
}

function inningsLine(
  innings: InningsState,
  config: MatchConfig,
  nameOfTeam: (id: string) => string,
  nameOfPlayer: (id: string) => string
): string {
  const team = nameOfTeam(innings.battingTeamId);
  const overs = (innings.legalBalls / config.ballsPerOver).toFixed(1);

  const top = topScorer(innings);
  if (top && top.runs >= 20) {
    const notOut = top.out ? '' : ' not out';
    return `${team} made ${innings.runs}-${innings.wickets} from ${overs} overs, ${nameOfPlayer(top.id)} top-scoring with ${top.runs}${notOut}.`;
  }
  return `${team} made ${innings.runs}-${innings.wickets} from ${overs} overs.`;
}

function chaseLine(
  second: InningsState,
  first: InningsState,
  config: MatchConfig,
  nameOfTeam: (id: string) => string
): string | null {
  const target = second.target ?? first.runs + 1;
  const chased = second.runs >= target;
  const team = nameOfTeam(second.battingTeamId);
  const ballsLeft = config.oversPerInnings * config.ballsPerOver - second.legalBalls;

  if (chased) {
    if (ballsLeft <= 0) return `${team} got there off the last ball.`;
    if (ballsLeft <= DOWN_TO_THE_WIRE_BALLS) {
      return `${team} chased ${target} down with ${ballsLeft} ball${ballsLeft === 1 ? '' : 's'} to spare.`;
    }
    return `${team} chased ${target} with ${ballsLeft} balls in hand.`;
  }

  const short = target - 1 - second.runs;
  if (short <= 0) return null; // a tie — the result line says so better
  return `${team} fell ${short} run${short === 1 ? '' : 's'} short.`;
}

function bestBowlingLine(
  innings: readonly InningsState[],
  nameOfPlayer: (id: string) => string
): string | null {
  let best: { id: string; wickets: number; runs: number } | null = null;
  for (const i of innings) {
    for (const [id, b] of Object.entries(i.bowlers)) {
      if (
        !best ||
        b.wickets > best.wickets ||
        (b.wickets === best.wickets && b.runsConceded < best.runs)
      ) {
        best = { id, wickets: b.wickets, runs: b.runsConceded };
      }
    }
  }
  // Two wickets is the floor. One-for is not a spell worth a sentence, and
  // saying so anyway is exactly what makes generated prose feel cheap.
  if (!best || best.wickets < 2) return null;
  return `${nameOfPlayer(best.id)} was the pick of the bowlers with ${best.wickets} for ${best.runs}.`;
}

function dramaLine(result: MatchResult | null, nameOfTeam: (id: string) => string): string | null {
  if (!result) return null;

  if (result.type === 'super_over_win') {
    return result.winnerTeamId
      ? `It took a super over to separate them, and ${nameOfTeam(result.winnerTeamId)} held their nerve.`
      : 'It took a super over to separate them.';
  }
  if (result.type === 'tie') return 'Nothing between them at the end of it.';

  const thinRuns = result.marginRuns !== null && result.marginRuns <= THRILLER_RUNS;
  const thinWickets = result.marginWickets !== null && result.marginWickets <= THRILLER_WICKETS;
  if (thinRuns || thinWickets) return 'It went to the wire.';

  // A comfortable win gets no extra sentence. The scoreline above already
  // said it, and dressing it up is how this starts sounding like a machine.
  return null;
}

function topScorer(innings: InningsState): { id: string; runs: number; out: boolean } | null {
  let best: { id: string; runs: number; out: boolean } | null = null;
  for (const [id, b] of Object.entries(innings.batters)) {
    if (!best || b.runs > best.runs) {
      best = { id, runs: b.runs, out: b.status === 'out' };
    }
  }
  return best;
}
