/**
 * Scorecard projection. docs/04-RULES-ENGINE.md § 2 — derived, never stored.
 *
 * The fixture tests in `tests/engine/fixtures` compare against this shape, so
 * it doubles as the definition of "byte-identical scorecard" for the Phase 1
 * acceptance criteria.
 */

import { economy, oversDisplay, strikeRate, totalExtras } from './projections';
import type {
  BatterState,
  BowlerState,
  Dismissal,
  Extras,
  InningsState,
  MatchConfig,
  MatchState,
  PlayerId,
  WicketType,
} from './types';

export type BattingRow = {
  playerId: PlayerId;
  battingPosition: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number | null;
  status: BatterState['status'];
  /** "b Jones", "c Smith b Jones", "run out (Patel)", or null if not out. */
  howOut: string | null;
};

export type BowlingRow = {
  playerId: PlayerId;
  overs: string;
  legalBalls: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  economy: number | null;
  wides: number;
  noBalls: number;
  dots: number;
};

export type InningsScorecard = {
  inningsNo: number;
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  overs: string;
  extras: Extras;
  extrasTotal: number;
  batting: BattingRow[];
  bowling: BowlingRow[];
  fallOfWickets: { wicketNumber: number; batterId: PlayerId; runs: number; overs: string }[];
  didNotBat: PlayerId[];
  status: InningsState['status'];
  endReason: InningsState['endReason'];
};

export type Scorecard = {
  matchId: string;
  status: MatchState['status'];
  innings: InningsScorecard[];
  result: MatchState['result'];
};

export type NameLookup = Record<PlayerId, string>;

function nameOf(id: PlayerId | null, names: NameLookup): string {
  if (id === null) return 'unknown';
  return names[id] ?? id;
}

/**
 * The dismissal line as it appears on a printed card. Follows the shorthand
 * every cricketer already reads: `c Smith b Jones`, `st Khan b Patel`,
 * `run out (Rao)`, `lbw b Jones`.
 */
export function howOutText(dismissal: Dismissal | null, names: NameLookup = {}): string | null {
  if (dismissal === null) return null;
  const bowler = nameOf(dismissal.bowlerId, names);
  const fielder = nameOf(dismissal.fielderId, names);

  const type: WicketType = dismissal.type;
  switch (type) {
    case 'bowled':
      return `b ${bowler}`;
    case 'caught':
      return `c ${fielder} b ${bowler}`;
    case 'lbw':
      return `lbw b ${bowler}`;
    case 'stumped':
      return `st ${fielder} b ${bowler}`;
    case 'hit_wicket':
      return `hit wicket b ${bowler}`;
    case 'run_out': {
      const assist = dismissal.assistFielderId;
      const who = assist !== null ? `${nameOf(assist, names)}/${fielder}` : fielder;
      return `run out (${who})`;
    }
    case 'obstructing_the_field':
    case 'handled_the_ball':
      return 'obstructing the field';
    case 'hit_ball_twice':
      return 'hit the ball twice';
    case 'timed_out':
      return 'timed out';
    case 'retired_out':
      return 'retired out';
    case 'retired_hurt':
      return 'retired hurt';
  }
}

function battingRow(batter: BatterState, names: NameLookup): BattingRow {
  return {
    playerId: batter.playerId,
    battingPosition: batter.battingPosition,
    runs: batter.runs,
    balls: batter.balls,
    fours: batter.fours,
    sixes: batter.sixes,
    strikeRate: strikeRate(batter),
    status: batter.status,
    howOut: howOutText(batter.dismissal, names),
  };
}

function bowlingRow(bowler: BowlerState, config: MatchConfig): BowlingRow {
  return {
    playerId: bowler.playerId,
    overs: oversDisplay(bowler.legalBalls, config.ballsPerOver),
    legalBalls: bowler.legalBalls,
    maidens: bowler.maidens,
    runsConceded: bowler.runsConceded,
    wickets: bowler.wickets,
    economy: economy(bowler, config.ballsPerOver),
    wides: bowler.wides,
    noBalls: bowler.noBalls,
    dots: bowler.dots,
  };
}

export function inningsScorecard(
  innings: InningsState,
  config: MatchConfig,
  names: NameLookup = {}
): InningsScorecard {
  const batting = Object.values(innings.batters)
    .sort((a, b) => a.battingPosition - b.battingPosition)
    .map((b) => battingRow(b, names));

  // Bowlers in the order they first bowled — Object key order is insertion
  // order for string keys, which is exactly first-bowled order here.
  const bowling = Object.values(innings.bowlers).map((b) => bowlingRow(b, config));

  return {
    inningsNo: innings.inningsNo,
    battingTeamId: innings.battingTeamId,
    bowlingTeamId: innings.bowlingTeamId,
    runs: innings.runs,
    wickets: innings.wickets,
    legalBalls: innings.legalBalls,
    overs: oversDisplay(innings.legalBalls, config.ballsPerOver),
    extras: { ...innings.extras },
    extrasTotal: totalExtras(innings),
    batting,
    bowling,
    fallOfWickets: innings.fallOfWickets.map((f) => ({
      wicketNumber: f.wicketNumber,
      batterId: f.batterId,
      runs: f.runs,
      overs: oversDisplay(f.legalBalls, config.ballsPerOver),
    })),
    didNotBat: [...innings.yetToBat],
    status: innings.status,
    endReason: innings.endReason,
  };
}

export function scorecard(state: MatchState, names: NameLookup = {}): Scorecard {
  return {
    matchId: state.matchId,
    status: state.status,
    innings: state.innings.map((i) =>
      inningsScorecard(
        i,
        i.isSuperOver ? { ...state.config, oversPerInnings: 1 } : state.config,
        names
      )
    ),
    result: state.result,
  };
}
