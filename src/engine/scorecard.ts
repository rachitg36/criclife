import { oversDisplay } from './projections';
import type { BatterStatus, InningsState, MatchConfig, PlayerId } from './types';

export type BattingCardRow = {
  playerId: PlayerId;
  position: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** `null` when the batter hasn't faced a ball yet. */
  strikeRate: number | null;
  status: BatterStatus;
  /** `null` when not out / yet to bat. */
  dismissalText: string | null;
};

export function buildBattingCard(innings: InningsState): BattingCardRow[] {
  return Object.values(innings.batters)
    .sort((a, b) => a.position - b.position)
    .map((b) => ({
      playerId: b.playerId,
      position: b.position,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      strikeRate: b.balls > 0 ? (b.runs / b.balls) * 100 : null,
      status: b.status,
      dismissalText: b.dismissal?.text ?? null,
    }));
}

export type BowlingCardRow = {
  playerId: PlayerId;
  oversDisplay: string;
  legalBalls: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  /** `null` until the bowler has sent down a legal ball. */
  economy: number | null;
  wides: number;
  noBalls: number;
  dots: number;
};

export function buildBowlingCard(innings: InningsState, config: MatchConfig): BowlingCardRow[] {
  return Object.values(innings.bowlers).map((bw) => ({
    playerId: bw.playerId,
    oversDisplay: oversDisplay(bw.legalBalls, config.ballsPerOver),
    legalBalls: bw.legalBalls,
    maidens: bw.maidens,
    runsConceded: bw.runsConceded,
    wickets: bw.wickets,
    economy: bw.legalBalls > 0 ? bw.runsConceded / (bw.legalBalls / config.ballsPerOver) : null,
    wides: bw.wides,
    noBalls: bw.noBalls,
    dots: bw.dots,
  }));
}

export type InningsScorecard = {
  inningsNo: number;
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  oversDisplay: string;
  extras: InningsState['extras'];
  batting: BattingCardRow[];
  bowling: BowlingCardRow[];
};

export function buildInningsScorecard(
  innings: InningsState,
  config: MatchConfig
): InningsScorecard {
  return {
    inningsNo: innings.inningsNo,
    battingTeamId: innings.battingTeamId,
    bowlingTeamId: innings.bowlingTeamId,
    runs: innings.runs,
    wickets: innings.wickets,
    oversDisplay: oversDisplay(innings.legalBalls, config.ballsPerOver),
    extras: innings.extras,
    batting: buildBattingCard(innings),
    bowling: buildBowlingCard(innings, config),
  };
}
