/**
 * Pure type definitions for the cricket rules engine. See docs/04-RULES-ENGINE.md.
 * Field names are camelCase mirrors of the snake_case columns in docs/02-DATA-MODEL.md.
 */

export type PlayerId = string;
export type TeamId = string;

export type ExtraType = 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'penalty';

export type WicketType =
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'run_out'
  | 'stumped'
  | 'hit_wicket'
  | 'retired_out'
  | 'retired_hurt'
  | 'obstructing_the_field'
  | 'handled_the_ball'
  | 'timed_out'
  | 'hit_ball_twice';

export type MatchStatus =
  'scheduled' | 'toss' | 'live' | 'innings_break' | 'super_over' | 'completed' | 'abandoned';

export type InningsStatus = 'in_progress' | 'completed' | 'declared' | 'abandoned';

export type InningsEndReason =
  'all_out' | 'overs_complete' | 'target_reached' | 'declared' | 'abandoned';

export type ResultType =
  'win' | 'tie' | 'draw' | 'no_result' | 'abandoned' | 'super_over_win' | 'forfeit';

export type BatterStatus = 'not_out' | 'out' | 'retired_hurt' | 'retired_out' | 'did_not_bat';

export type Powerplay = {
  name: string;
  fromOver: number;
  toOver: number;
  fieldersOutside: number;
};

export type MatchConfig = {
  oversPerInnings: number;
  ballsPerOver: number;
  playersPerSide: number;
  /** `'auto'` resolves to `ceil(oversPerInnings / 5)`. See config.ts. */
  maxOversPerBowler: number | 'auto';
  wideRuns: number;
  noBallRuns: number;
  byesEnabled: boolean;
  legByesEnabled: boolean;
  freeHitAfterNoBall: boolean;
  noBallFreeHitOnAllNoBalls: boolean;
  lastManStanding: boolean;
  powerplays: Powerplay[];
  superOverOnTie: boolean;
  retiredHurtCanReturn: boolean;
  penaltyRunsEnabled: boolean;
  declarationsEnabled: boolean;
  followOnEnabled: boolean;
  drsEnabled: boolean;
  rulesProfileName?: string;
};

export type DismissalInfo = {
  type: WicketType;
  dismissedPlayerId: PlayerId;
  /** Null when this wicket type is not credited to the bowler — see §5.1. */
  bowlerId: PlayerId | null;
  fielderId: PlayerId | null;
  assistFielderId: PlayerId | null;
  text: string;
};

export type BatterState = {
  playerId: PlayerId;
  /** 1-indexed batting order position, assigned the moment they come to the crease. */
  position: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  status: BatterStatus;
  dismissal: DismissalInfo | null;
};

export type BowlerState = {
  playerId: PlayerId;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  wides: number;
  noBalls: number;
  dots: number;
  maidens: number;
};

export type FowEntry = {
  wicketNumber: number;
  runs: number;
  legalBalls: number;
  playerId: PlayerId;
};

export type ExtrasBreakdown = {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalty: number;
};

/**
 * Tracks the in-progress over so `applyDelivery` can decide, on completion,
 * whether it was a maiden. A wide/no-ball adds runs here without advancing
 * `legalBalls`, and a mid-over bowler change is visible via `bowlerIds.length`.
 */
export type CurrentOverTracker = {
  bowlerIds: PlayerId[];
  runs: number;
};

export type InningsState = {
  inningsNo: number;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  isSuperOver: boolean;

  runs: number;
  wickets: number;
  legalBalls: number;
  extras: ExtrasBreakdown;

  strikerId: PlayerId | null;
  nonStrikerId: PlayerId | null;
  bowlerId: PlayerId | null;
  previousBowlerId: PlayerId | null;

  isFreeHit: boolean;
  target: number | null;
  revisedTarget: number | null;
  revisedOvers: number | null;

  batters: Record<PlayerId, BatterState>;
  bowlers: Record<PlayerId, BowlerState>;
  fallOfWickets: FowEntry[];
  yetToBat: PlayerId[];
  /**
   * How many players are in this batting side, when the caller supplied a
   * batting order. `playersPerSide` is what the match is *configured* for;
   * this is who actually turned up, and sides do turn up short. Null when
   * nobody said, in which case only the configured number is used.
   */
  squadSize: number | null;

  status: InningsStatus;
  endReason: InningsEndReason | null;

  currentOver: CurrentOverTracker;
};

export type MatchResult = {
  type: ResultType;
  winnerTeamId: TeamId | null;
  marginRuns: number | null;
  marginWickets: number | null;
  text: string;
};

export type MatchState = {
  matchId: string;
  config: MatchConfig;
  status: MatchStatus;
  toss: { winnerTeamId: TeamId; decision: 'bat' | 'bowl' } | null;
  innings: InningsState[];
  currentInningsIndex: number;
  result: MatchResult | null;
};

export type WicketInput = {
  type: WicketType;
  dismissedPlayerId: PlayerId;
  fielderId?: PlayerId;
  assistFielderId?: PlayerId;
  crossedBeforeDismissal?: boolean;
};

export type DeliveryInput = {
  clientDeliveryId: string;
  runsOffBat: number;
  extraType: ExtraType | null;
  /** Runs additional to the automatic wideRuns/noBallRuns. */
  extraRuns: number;
  isBoundary: boolean;
  wicket: WicketInput | null;
  shot?: { x: number; y: number };
  pitch?: { x: number; y: number };
  penaltyRuns?: number;
  commentaryOverride?: string;
};

/**
 * The persisted, append-only ball record — the engine's view of a row in the
 * `deliveries` table (docs/02-DATA-MODEL.md §6). `replay.ts` folds an ordered
 * array of these back into a `MatchState`; `applyDelivery` produces one as
 * part of its result. Server-only bookkeeping (`id`, `seq`, `scoredByProfileId`)
 * is deliberately absent — that's the data layer's concern, not the engine's.
 */
export type Delivery = {
  inningsNo: number;
  overNo: number;
  ballInOver: number;
  isLegal: boolean;
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
  bowlerId: PlayerId;
  runsBatter: number;
  runsExtras: number;
  extraType: ExtraType | null;
  runsTotal: number;
  isWicket: boolean;
  wicketType: WicketType | null;
  dismissedPlayerId: PlayerId | null;
  fielderId: PlayerId | null;
  assistFielderId: PlayerId | null;
  crossedBeforeDismissal: boolean | null;
  isFreeHit: boolean;
  createsFreeHit: boolean;
  isBoundaryFour: boolean;
  isBoundarySix: boolean;
  commentary: string;
  clientDeliveryId: string;
};

export type EngineEvent =
  | {
      type: 'OVER_COMPLETE';
      inningsNo: number;
      overNo: number;
      bowlerId: PlayerId;
      maiden: boolean;
    }
  | { type: 'NEW_BATTER_REQUIRED'; inningsNo: number }
  | { type: 'INNINGS_COMPLETE'; inningsNo: number; reason: InningsEndReason }
  | { type: 'MATCH_COMPLETE'; result: MatchResult }
  | { type: 'MILESTONE'; playerId: PlayerId; milestone: 'fifty' | 'hundred' };

export type EngineFailure = { ok: false; error: string };

export type EngineSuccess = {
  ok: true;
  state: MatchState;
  delivery: Delivery;
  events: EngineEvent[];
};

export type EngineResult = EngineFailure | EngineSuccess;
