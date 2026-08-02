/**
 * Engine type layer. docs/04-RULES-ENGINE.md § 1–3.
 *
 * This module is PURE — no React, no I/O, no DOM, no ambient time.
 * Names mirror `docs/02-DATA-MODEL.md` (which is snake_case in Postgres and
 * camelCase here) so the mapping stays obvious.
 */

export type PlayerId = string;
export type TeamId = string;

/* ── Configuration ─────────────────────────────────────────── */

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

export type Powerplay = {
  name: string;
  /** 1-indexed, inclusive. */
  fromOver: number;
  /** 1-indexed, inclusive. */
  toOver: number;
  fieldersOutside: number;
};

export type MatchConfig = {
  oversPerInnings: number;
  ballsPerOver: number;
  playersPerSide: number;
  /** `'auto'` resolves to `ceil(oversPerInnings / 5)` — see `resolveMaxOvers`. */
  maxOversPerBowler: number | 'auto';
  wideRuns: number;
  noBallRuns: number;
  byesEnabled: boolean;
  legByesEnabled: boolean;
  freeHitAfterNoBall: boolean;
  noBallFreeHitOnAllNoBalls: boolean;
  /** Last batter bats alone; odd runs do not hand over strike. */
  lastManStanding: boolean;
  powerplays: Powerplay[];
  superOverOnTie: boolean;
  retiredHurtCanReturn: boolean;
  penaltyRunsEnabled: boolean;
  declarationsEnabled: boolean;
  followOnEnabled: boolean;
  drsEnabled: boolean;
};

/* ── Per-player state ──────────────────────────────────────── */

export type BatterStatus = 'not_out' | 'out' | 'retired_hurt' | 'retired_out';

export type Dismissal = {
  type: WicketType;
  /** Null when the wicket is not credited to a bowler (run out, etc.). */
  bowlerId: PlayerId | null;
  fielderId: PlayerId | null;
  assistFielderId: PlayerId | null;
  /** Team score at the moment of dismissal. */
  atRuns: number;
  atLegalBalls: number;
};

export type BatterState = {
  playerId: PlayerId;
  runs: number;
  /** Balls faced. A wide is not a ball faced; a bye/leg-bye is. */
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  status: BatterStatus;
  dismissal: Dismissal | null;
  /** 1-indexed order of arrival at the crease. */
  battingPosition: number;
};

export type BowlerState = {
  playerId: PlayerId;
  legalBalls: number;
  runsConceded: number;
  wickets: number;
  maidens: number;
  wides: number;
  noBalls: number;
  dots: number;
};

export type FowEntry = {
  /** 1-indexed. */
  wicketNumber: number;
  batterId: PlayerId;
  /** Team score when the wicket fell. */
  runs: number;
  legalBalls: number;
};

/* ── Innings and match ─────────────────────────────────────── */

export type InningsEndReason =
  'all_out' | 'overs_complete' | 'target_reached' | 'declared' | 'abandoned';

export type InningsStatus = 'in_progress' | 'completed' | 'declared' | 'abandoned';

export type Extras = {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalty: number;
};

/**
 * Tracks the over in progress so maidens can be awarded correctly when a
 * bowler is swapped mid-over (docs/04 § 8) — a maiden requires the bowler to
 * have bowled the *whole* over for nought.
 */
export type CurrentOver = {
  /** Runs charged to the bowler this over (byes/leg-byes excluded). */
  runsConceded: number;
  /** Legal balls bowled this over, per bowler. */
  ballsByBowler: Record<PlayerId, number>;
};

export type InningsState = {
  inningsNo: number;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;

  runs: number;
  wickets: number;
  /** Authoritative over counter. Illegal deliveries do not increment it. */
  legalBalls: number;
  extras: Extras;

  strikerId: PlayerId | null;
  nonStrikerId: PlayerId | null;
  bowlerId: PlayerId | null;
  /** Cannot bowl consecutive overs. Null at the start of an innings. */
  previousBowlerId: PlayerId | null;

  isFreeHit: boolean;
  /** Set on the chasing innings: runs needed to win. */
  target: number | null;
  revisedTarget: number | null;
  revisedOvers: number | null;

  batters: Record<PlayerId, BatterState>;
  bowlers: Record<PlayerId, BowlerState>;
  fallOfWickets: FowEntry[];
  yetToBat: PlayerId[];

  currentOver: CurrentOver;

  isSuperOver: boolean;
  status: InningsStatus;
  endReason: InningsEndReason | null;
};

export type MatchStatus = 'setup' | 'in_progress' | 'completed' | 'abandoned';

export type ResultKind = 'win' | 'tie' | 'no_result';

export type MatchResult = {
  kind: ResultKind;
  winnerTeamId: TeamId | null;
  /** Winning margin unit. Null for a tie / no result. */
  margin: { by: 'runs' | 'wickets'; value: number } | null;
  /** True when the result was settled by a super over. */
  viaSuperOver: boolean;
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

/* ── Delivery input and the stored delivery ────────────────── */

export type WicketInput = {
  type: WicketType;
  /** May be the NON-striker on a run out. */
  dismissedPlayerId: PlayerId;
  fielderId?: PlayerId;
  assistFielderId?: PlayerId;
  /** Run out only: had the batters crossed before the dismissal? */
  crossedBeforeDismissal?: boolean;
};

export type DeliveryInput = {
  /** UUID. Idempotency key for offline sync. */
  clientDeliveryId: string;
  runsOffBat: number;
  extraType: ExtraType | null;
  /** Runs *additional* to the automatic wideRuns / noBallRuns. */
  extraRuns: number;
  /** Hit the rope, as opposed to all-run. */
  isBoundary: boolean;
  wicket: WicketInput | null;
  shot?: { x: number; y: number };
  pitch?: { x: number; y: number };
  penaltyRuns?: number;
  commentaryOverride?: string;
};

/**
 * A delivery as stored in the append-only log. Mirrors the `deliveries` table
 * in docs/02-DATA-MODEL.md § `deliveries`.
 */
export type Delivery = {
  clientDeliveryId: string;
  /** Monotonic per innings. Server-assigned in production; the engine
   *  assigns provisionally so replay is self-consistent offline. */
  seq: number;
  inningsNo: number;
  /** 0-indexed. */
  overNo: number;
  /** 1..ballsPerOver for legal balls; an illegal ball repeats the number. */
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

  /** This ball *was* bowled as a free hit. */
  isFreeHit: boolean;
  /** The *next* ball is a free hit. */
  createsFreeHit: boolean;

  isBoundaryFour: boolean;
  isBoundarySix: boolean;

  shotX: number | null;
  shotY: number | null;
  pitchX: number | null;
  pitchY: number | null;

  commentary: string;
  isDeleted: boolean;
};

/* ── Engine results ────────────────────────────────────────── */

/**
 * Error codes are shared with the API contract so the same string can be
 * shown by the pad whether the rejection came from the local engine or the
 * server. docs/10-API-CONTRACT.md § 3.1.
 */
export type EngineErrorCode =
  | 'ILLEGAL_DISMISSAL'
  | 'INNINGS_COMPLETE'
  | 'BOWLER_LIMIT'
  | 'CONSECUTIVE_OVER'
  | 'NO_STRIKER'
  | 'NO_BOWLER'
  | 'SAME_PLAYER'
  | 'INVALID_INPUT'
  | 'UNKNOWN_PLAYER';

export type EngineEvent =
  | { type: 'BOUNDARY_FOUR'; batterId: PlayerId }
  | { type: 'BOUNDARY_SIX'; batterId: PlayerId }
  | { type: 'WICKET'; batterId: PlayerId; wicketType: WicketType }
  | { type: 'OVER_COMPLETE'; overNo: number; bowlerId: PlayerId }
  | { type: 'MAIDEN'; overNo: number; bowlerId: PlayerId }
  | { type: 'NEW_BATTER_REQUIRED' }
  | { type: 'NEW_BOWLER_REQUIRED' }
  | { type: 'MILESTONE'; batterId: PlayerId; runs: 50 | 100 | 150 | 200 }
  | { type: 'INNINGS_COMPLETE'; inningsNo: number; reason: InningsEndReason }
  | { type: 'MATCH_COMPLETE'; result: MatchResult };

export type EngineOk = {
  ok: true;
  state: MatchState;
  delivery: Delivery;
  events: EngineEvent[];
};

export type EngineErr = {
  ok: false;
  error: EngineErrorCode;
  message: string;
};

export type EngineResult = EngineOk | EngineErr;
