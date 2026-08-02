/**
 * State construction and cloning.
 *
 * `applyDelivery` never mutates the state it is given — it clones, applies,
 * and returns. That is what makes replay-based undo (docs/04 § 10) safe: the
 * same log always folds to the same state, and nothing holds a stale
 * reference into a half-updated innings.
 */

import type {
  BatterState,
  BowlerState,
  InningsState,
  MatchConfig,
  MatchState,
  PlayerId,
  TeamId,
} from './types';

export function createBatter(playerId: PlayerId, battingPosition: number): BatterState {
  return {
    playerId,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    dots: 0,
    status: 'not_out',
    dismissal: null,
    battingPosition,
  };
}

export function createBowler(playerId: PlayerId): BowlerState {
  return {
    playerId,
    legalBalls: 0,
    runsConceded: 0,
    wickets: 0,
    maidens: 0,
    wides: 0,
    noBalls: 0,
    dots: 0,
  };
}

export type CreateInningsParams = {
  inningsNo: number;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  /** Full batting order. The first two take the crease. */
  battingOrder: PlayerId[];
  strikerId?: PlayerId;
  nonStrikerId?: PlayerId;
  bowlerId?: PlayerId;
  target?: number | null;
  isSuperOver?: boolean;
};

export function createInnings(params: CreateInningsParams): InningsState {
  const order = [...params.battingOrder];
  const striker = params.strikerId ?? order[0] ?? null;
  const nonStriker = params.nonStrikerId ?? order[1] ?? null;

  const batters: Record<PlayerId, BatterState> = {};
  let position = 0;
  if (striker !== null) batters[striker] = createBatter(striker, ++position);
  if (nonStriker !== null) batters[nonStriker] = createBatter(nonStriker, ++position);

  const yetToBat = order.filter((id) => id !== striker && id !== nonStriker);

  return {
    inningsNo: params.inningsNo,
    battingTeamId: params.battingTeamId,
    bowlingTeamId: params.bowlingTeamId,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
    strikerId: striker,
    nonStrikerId: nonStriker,
    bowlerId: params.bowlerId ?? null,
    previousBowlerId: null,
    isFreeHit: false,
    target: params.target ?? null,
    revisedTarget: null,
    revisedOvers: null,
    batters,
    bowlers: {},
    fallOfWickets: [],
    yetToBat,
    currentOver: { runsConceded: 0, ballsByBowler: {} },
    isSuperOver: params.isSuperOver ?? false,
    status: 'in_progress',
    endReason: null,
  };
}

export type CreateMatchParams = {
  matchId: string;
  config: MatchConfig;
  toss?: { winnerTeamId: TeamId; decision: 'bat' | 'bowl' } | null;
  innings?: InningsState[];
};

export function createMatch(params: CreateMatchParams): MatchState {
  return {
    matchId: params.matchId,
    config: params.config,
    status: params.innings && params.innings.length > 0 ? 'in_progress' : 'setup',
    toss: params.toss ?? null,
    innings: params.innings ?? [],
    currentInningsIndex: 0,
    result: null,
  };
}

export function cloneBatter(b: BatterState): BatterState {
  return { ...b, dismissal: b.dismissal === null ? null : { ...b.dismissal } };
}

export function cloneInnings(i: InningsState): InningsState {
  const batters: Record<PlayerId, BatterState> = {};
  for (const key of Object.keys(i.batters)) {
    const b = i.batters[key];
    if (b) batters[key] = cloneBatter(b);
  }
  const bowlers: Record<PlayerId, BowlerState> = {};
  for (const key of Object.keys(i.bowlers)) {
    const b = i.bowlers[key];
    if (b) bowlers[key] = { ...b };
  }
  return {
    ...i,
    extras: { ...i.extras },
    batters,
    bowlers,
    fallOfWickets: i.fallOfWickets.map((f) => ({ ...f })),
    yetToBat: [...i.yetToBat],
    currentOver: {
      runsConceded: i.currentOver.runsConceded,
      ballsByBowler: { ...i.currentOver.ballsByBowler },
    },
  };
}

export function cloneMatch(m: MatchState): MatchState {
  return {
    ...m,
    config: { ...m.config, powerplays: m.config.powerplays.map((p) => ({ ...p })) },
    toss: m.toss === null ? null : { ...m.toss },
    innings: m.innings.map(cloneInnings),
    result:
      m.result === null
        ? null
        : { ...m.result, margin: m.result.margin === null ? null : { ...m.result.margin } },
  };
}

/** Brings a new batter to the crease, filling whichever end is empty. */
export function sendInNextBatter(innings: InningsState, playerId: PlayerId): void {
  const position = Object.keys(innings.batters).length + 1;
  if (!innings.batters[playerId]) {
    innings.batters[playerId] = createBatter(playerId, position);
  }
  innings.yetToBat = innings.yetToBat.filter((id) => id !== playerId);
  if (innings.strikerId === null) innings.strikerId = playerId;
  else if (innings.nonStrikerId === null) innings.nonStrikerId = playerId;
}

/** Assigns the bowler for the next over. */
export function setBowler(innings: InningsState, playerId: PlayerId): void {
  innings.bowlerId = playerId;
  if (!innings.bowlers[playerId]) {
    innings.bowlers[playerId] = createBowler(playerId);
  }
}
