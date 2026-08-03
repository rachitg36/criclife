import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import {
  applyDelivery,
  computeMatchResult,
  createInitialMatchState,
  replay,
  resolveTiedSuperOvers,
  setBowler,
  setNewBatter,
  superOverConfig,
  DEFAULT_MAX_SUPER_OVER_ATTEMPTS,
} from '@/engine';
import type {
  Delivery,
  DeliveryInput,
  EngineEvent,
  ExtraType,
  MatchConfig,
  MatchResult,
  MatchState,
  PlayerId,
  WicketInput,
} from '@/engine/types';
import type { InningsSeed } from '@/engine/replay';
import type { Database, Json } from '@/types/database';

export type SquadPlayer = Database['public']['Tables']['players']['Row'] & {
  isCaptain: boolean;
  isWicketKeeper: boolean;
  battingOrder: number | null;
};

/** What `edit_delivery` will actually correct — never legality. See
    docs/10-API-CONTRACT.md §3.4 and the migration's own comment on why a
    wide/legal ball can't be reclassified after the fact. */
export type EditableDeliveryChanges = {
  runsOffBat?: number;
  extraRuns?: number;
  wicket?: WicketInput | null;
  commentaryOverride?: string;
};

/**
 * docs/05-SCORER-VIEW.md § 5 — the states the pad can be in.
 * `LOADING`/`ERROR` are this store's own bootstrap states, not in that table.
 */
export type PadMode =
  | 'LOADING'
  | 'ERROR'
  | 'READY'
  | 'AWAITING_OPENERS'
  | 'AWAITING_BOWLER'
  | 'AWAITING_BATTER'
  | 'WICKET_SHEET'
  | 'INNINGS_BREAK'
  | 'MATCH_OVER'
  | 'READ_ONLY';

type ScorerState = {
  matchId: string | null;
  teamAId: string | null;
  teamBId: string | null;
  config: MatchConfig | null;
  matchState: MatchState | null;
  /** The raw per-ball log for the current innings — the over-dot strip and
      ball history need individual ball outcomes, which InningsState (a
      running aggregate) doesn't retain on its own. */
  deliveries: Delivery[];
  /** DB ids parallel to `deliveries`, by index. Null while a ball is still
      in flight to the server — `editDelivery` is unavailable for it until
      the RPC returns and fills this in. */
  deliveryIds: (string | null)[];
  inningsIdByNo: Record<number, string>;
  squadA: SquadPlayer[];
  squadB: SquadPlayer[];
  mode: PadMode;
  armedModifier: ExtraType | null;
  matchResult: MatchResult | null;
  pendingCount: number;
  error: string | null;
  revoked: boolean;
  lastTap: { key: string; at: number } | null;
  /** docs/05-SCORER-VIEW.md § 4 — a same-button tap 250–600ms after the
      last one committed anyway (it's outside the hard swallow window) but
      surfaces this so the scorer can undo it if it really was accidental. */
  duplicateWarning: boolean;
  /** The rare "edit a previous ball" sheet — reachable via long-press UNDO
      or the ⋯ overflow. Independent of `mode` since it overlays either the
      run pad or a picker without replacing it. */
  historyOpen: boolean;
  /** `mode` before the wicket sheet opened, so cancelling restores it
      instead of always falling back to READY. */
  preWicketSheetMode: PadMode | null;
  /** docs/05-SCORER-VIEW.md § 7 — "state lives in Zustand, not the route":
      tapping away to another scorer tab and back must restore the pad
      instantly, so which tab is active lives here rather than as a route. */
  scorerTab: 'score' | 'scorecard' | 'map' | 'feed' | 'settings';

  init: (matchId: string) => Promise<void>;
  armModifier: (m: ExtraType | null) => void;
  recordRun: (runs: number) => Promise<void>;
  recordExtra: (extraRuns: number) => Promise<void>;
  recordWicket: (wicket: WicketInput, runs?: number) => Promise<void>;
  pickOpeners: (strikerId: PlayerId, nonStrikerId: PlayerId) => void;
  pickBowler: (bowlerId: PlayerId) => void;
  pickBatter: (playerId: PlayerId) => void;
  undo: () => Promise<void>;
  editDelivery: (deliveryId: string, changes: EditableDeliveryChanges, reason?: string) => Promise<void>;
  startNextInnings: () => Promise<void>;
  markRevoked: (revoked: boolean) => void;
  dismissError: () => void;
  openWicketSheet: () => void;
  closeWicketSheet: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  setScorerTab: (tab: ScorerState['scorerTab']) => void;
  dismissDuplicateWarning: () => void;
};

/** Identifies "the same button" across taps — deliberately excludes
    `clientDeliveryId`, which is a fresh random UUID on every call and would
    make every tap look unique. docs/05-SCORER-VIEW.md § 4. */
function tapKeyFor(input: DeliveryInput): string {
  return [
    input.runsOffBat,
    input.extraType ?? '',
    input.extraRuns,
    input.wicket?.type ?? '',
    input.wicket?.dismissedPlayerId ?? '',
  ].join(':');
}

type TapGuardResult = 'swallow' | 'warn' | 'ok';

/** <250ms on the same button is one accidental double-fire — swallowed.
    250–600ms is "probably fine, but flag it" — docs' "Recorded twice? Undo"
    chip. Anything slower is just two separate, deliberate taps. */
function checkTapGuard(state: ScorerState, key: string): TapGuardResult {
  if (!state.lastTap || state.lastTap.key !== key) return 'ok';
  const delta = Date.now() - state.lastTap.at;
  if (delta < 250) return 'swallow';
  if (delta < 600) return 'warn';
  return 'ok';
}

function currentInnings(state: MatchState) {
  return state.innings[state.currentInningsIndex] ?? null;
}

function effectiveConfig(state: MatchState) {
  const innings = currentInnings(state);
  return innings?.isSuperOver ? superOverConfig(state.config) : state.config;
}

function toEngineDelivery(row: Database['public']['Tables']['deliveries']['Row']): Delivery {
  return {
    inningsNo: 0, // filled by the caller, which knows which innings this row belongs to
    overNo: row.over_no,
    ballInOver: row.ball_in_over,
    isLegal: row.is_legal,
    strikerId: row.striker_id,
    nonStrikerId: row.non_striker_id,
    bowlerId: row.bowler_id,
    runsBatter: row.runs_batter,
    runsExtras: row.runs_extras,
    extraType: row.extra_type,
    runsTotal: row.runs_total ?? row.runs_batter + row.runs_extras,
    isWicket: row.is_wicket,
    wicketType: row.wicket_type,
    dismissedPlayerId: row.dismissed_player_id,
    fielderId: row.fielder_id,
    assistFielderId: row.assist_fielder_id,
    crossedBeforeDismissal: row.crossed_before_dismissal,
    isFreeHit: row.is_free_hit,
    createsFreeHit: row.creates_free_hit,
    isBoundaryFour: row.is_boundary_four,
    isBoundarySix: row.is_boundary_six,
    commentary: row.commentary ?? '',
    clientDeliveryId: row.client_delivery_id,
  };
}

export const useScorerStore = create<ScorerState>((set, get) => ({
  matchId: null,
  teamAId: null,
  teamBId: null,
  config: null,
  matchState: null,
  deliveries: [],
  deliveryIds: [],
  inningsIdByNo: {},
  squadA: [],
  squadB: [],
  mode: 'LOADING',
  armedModifier: null,
  matchResult: null,
  pendingCount: 0,
  error: null,
  revoked: false,
  lastTap: null,
  duplicateWarning: false,
  historyOpen: false,
  preWicketSheetMode: null,
  scorerTab: 'score',

  init: async (matchId) => {
    set({ mode: 'LOADING', matchId, error: null });

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();
    if (matchError || !match) {
      set({ mode: 'ERROR', error: matchError?.message ?? 'Match not found' });
      return;
    }

    const { data: inningsRows } = await supabase
      .from('innings')
      .select('*')
      .eq('match_id', matchId)
      .order('innings_no');

    const { data: squadRows } = await supabase
      .from('match_squads')
      .select('*, player:players(*)')
      .eq('match_id', matchId)
      .eq('is_playing_xi', true);

    const config = match.config as unknown as MatchConfig;
    const seeds: InningsSeed[] = (inningsRows ?? []).map((i) => ({
      inningsNo: i.innings_no,
      battingTeamId: i.batting_team_id,
      bowlingTeamId: i.bowling_team_id,
      isSuperOver: i.is_super_over,
    }));
    const inningsIdByNo: Record<number, string> = {};
    for (const i of inningsRows ?? []) inningsIdByNo[i.innings_no] = i.id;

    let deliveries: Delivery[] = [];
    let deliveryIds: string[] = [];
    if (inningsRows && inningsRows.length > 0) {
      const ids = inningsRows.map((i) => i.id);
      const { data: deliveryRows } = await supabase
        .from('deliveries')
        .select('*')
        .in('innings_id', ids)
        .eq('is_deleted', false)
        .order('seq');

      const noByInningsId = new Map(inningsRows.map((i) => [i.id, i.innings_no]));
      deliveries = (deliveryRows ?? []).map((row) => ({
        ...toEngineDelivery(row),
        inningsNo: noByInningsId.get(row.innings_id) ?? 0,
      }));
      deliveryIds = (deliveryRows ?? []).map((row) => row.id);
    }

    let matchState: MatchState;
    try {
      matchState =
        seeds.length > 0
          ? replay(matchId, config, deliveries, seeds)
          : createInitialMatchState(matchId, config);
    } catch (e) {
      set({ mode: 'ERROR', error: e instanceof Error ? e.message : 'Replay failed' });
      return;
    }

    const squadA: SquadPlayer[] = [];
    const squadB: SquadPlayer[] = [];
    for (const row of (squadRows ?? []) as unknown as {
      team_id: string;
      is_captain: boolean;
      is_wicket_keeper: boolean;
      batting_order: number | null;
      player: Database['public']['Tables']['players']['Row'];
    }[]) {
      const entry: SquadPlayer = {
        ...row.player,
        isCaptain: row.is_captain,
        isWicketKeeper: row.is_wicket_keeper,
        battingOrder: row.batting_order,
      };
      if (row.team_id === match.team_a_id) squadA.push(entry);
      else squadB.push(entry);
    }
    squadA.sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99));
    squadB.sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99));

    const innings = currentInnings(matchState);
    let mode: PadMode = 'READY';
    if (match.is_locked || matchState.status === 'completed') {
      mode = 'MATCH_OVER';
    } else if (!innings) {
      mode = 'AWAITING_OPENERS';
    } else if (innings.strikerId === null || innings.nonStrikerId === null) {
      mode = 'AWAITING_OPENERS';
    } else if (innings.bowlerId === null) {
      mode = 'AWAITING_BOWLER';
    }

    set({
      teamAId: match.team_a_id,
      teamBId: match.team_b_id,
      config,
      matchState,
      deliveries,
      deliveryIds,
      inningsIdByNo,
      squadA,
      squadB,
      mode,
      error: null,
    });
  },

  armModifier: (m) => set((s) => ({ armedModifier: s.armedModifier === m ? null : m })),

  recordRun: async (runs) => {
    const armed = get().armedModifier;
    await commitDelivery(set, get, {
      clientDeliveryId: crypto.randomUUID(),
      runsOffBat: armed ? 0 : runs,
      extraType: armed,
      extraRuns: armed ? runs : 0,
      isBoundary: !armed && (runs === 4 || runs === 6),
      wicket: null,
    });
  },

  recordExtra: async (extraRuns) => {
    const armed = get().armedModifier;
    if (!armed) return;
    await commitDelivery(set, get, {
      clientDeliveryId: crypto.randomUUID(),
      runsOffBat: 0,
      extraType: armed,
      extraRuns,
      isBoundary: false,
      wicket: null,
    });
  },

  recordWicket: async (wicket, runs = 0) => {
    await commitDelivery(set, get, {
      clientDeliveryId: crypto.randomUUID(),
      runsOffBat: runs,
      extraType: null,
      extraRuns: 0,
      isBoundary: false,
      wicket,
    });
  },

  pickOpeners: (strikerId, nonStrikerId) => {
    const { matchState } = get();
    if (!matchState) return;
    let next = setNewBatter(matchState, strikerId);
    next = setNewBatter(next, nonStrikerId);
    const innings = currentInnings(next);
    set({
      matchState: next,
      mode: innings?.bowlerId === null ? 'AWAITING_BOWLER' : 'READY',
    });
  },

  pickBowler: (bowlerId) => {
    const { matchState } = get();
    if (!matchState) return;
    const next = setBowler(matchState, bowlerId);
    set({ matchState: next, mode: 'READY' });
  },

  pickBatter: (playerId) => {
    const { matchState } = get();
    if (!matchState) return;
    const next = setNewBatter(matchState, playerId);
    set({ matchState: next, mode: 'READY' });
  },

  undo: async () => {
    const { matchId, matchState, inningsIdByNo } = get();
    if (!matchId || !matchState) return;
    const innings = currentInnings(matchState);
    if (!innings) return;
    const inningsId = inningsIdByNo[innings.inningsNo];
    if (!inningsId) return;

    const { error } = await supabase.rpc('undo_last_delivery', { p_innings_id: inningsId });
    if (error) {
      set({ error: error.message });
      return;
    }
    haptic('select');
    await get().init(matchId);
  },

  editDelivery: async (deliveryId, changes, reason) => {
    const { matchId } = get();
    if (!matchId) return;
    const { error } = await supabase.rpc('edit_delivery', {
      p_delivery_id: deliveryId,
      p_changes: changes as unknown as Json,
      p_reason: reason ?? null,
    });
    if (error) {
      set({ error: error.message });
      return;
    }
    haptic('select');
    await get().init(matchId);
  },

  startNextInnings: async () => {
    const { matchId } = get();
    if (!matchId) return;
    const { error } = await supabase.rpc('start_innings', { p_match_id: matchId });
    if (error) {
      set({ error: error.message });
      return;
    }
    await get().init(matchId);
  },

  markRevoked: (revoked) => set({ revoked, mode: revoked ? 'READ_ONLY' : get().mode }),
  dismissError: () => set({ error: null }),

  openWicketSheet: () => {
    const { mode } = get();
    if (mode !== 'READY') return;
    set({ preWicketSheetMode: mode, mode: 'WICKET_SHEET' });
  },
  closeWicketSheet: () => {
    const { preWicketSheetMode } = get();
    set({ mode: preWicketSheetMode ?? 'READY', preWicketSheetMode: null });
  },
  openHistory: () => set({ historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),
  setScorerTab: (tab) => set({ scorerTab: tab }),
  dismissDuplicateWarning: () => set({ duplicateWarning: false }),
}));

async function commitDelivery(
  set: (partial: Partial<ScorerState>) => void,
  get: () => ScorerState,
  input: DeliveryInput
) {
  const state = get();
  const tapKey = tapKeyFor(input);
  const tapGuard = checkTapGuard(state, tapKey);
  if (tapGuard === 'swallow') return;
  if (!state.matchState || state.revoked) return;

  const innings = currentInnings(state.matchState);
  if (!innings || innings.strikerId === null || innings.bowlerId === null) return;

  const result = applyDelivery(state.matchState, input);
  if (!result.ok) {
    set({ error: result.error });
    haptic('error');
    return;
  }

  // Optimistic: the pad reflects the new state instantly, before the network
  // call below ever resolves. docs/05 § 2 — "no confirm, no dialog."
  const deliveryIndex = state.deliveries.length;
  set({
    matchState: result.state,
    deliveries: [...state.deliveries, result.delivery],
    deliveryIds: [...state.deliveryIds, null],
    armedModifier: null,
    error: null,
    lastTap: { key: tapKey, at: Date.now() },
    duplicateWarning: tapGuard === 'warn',
  });
  fireHaptic(result.delivery, input);
  applyEvents(set, get, result.events);

  const inningsId = get().inningsIdByNo[innings.inningsNo];
  if (!inningsId) {
    set({ error: 'No innings id for the current innings — cannot record this ball' });
    return;
  }
  const expectedSeq = await currentServerSeq(inningsId);

  set({ pendingCount: get().pendingCount + 1 });
  const { data, error } = await supabase.rpc('record_delivery', {
    p: {
      inningsId,
      clientDeliveryId: input.clientDeliveryId,
      expectedSeq,
      strikerId: innings.strikerId,
      nonStrikerId: innings.nonStrikerId,
      bowlerId: innings.bowlerId,
      runsOffBat: input.runsOffBat,
      extraType: input.extraType,
      extraRuns: input.extraRuns,
      isBoundary: input.isBoundary,
      wicket: input.wicket,
      shot: input.shot ?? null,
      pitch: input.pitch ?? null,
      commentaryOverride: result.delivery.commentary,
    } as unknown as Json,
  });
  set({ pendingCount: Math.max(0, get().pendingCount - 1) });

  if (error) {
    // The optimistic apply already reflects locally; surface the failure
    // and resync from server truth (full Dexie-backed offline retry queue
    // is Phase 6 — this sandbox's network is always "up" or "down", never
    // queued).
    set({ error: error.message });
    const matchId = get().matchId;
    if (matchId) await get().init(matchId);
    return;
  }

  const returnedId = (data as { delivery?: { id?: string } } | null)?.delivery?.id;
  if (returnedId) {
    const ids = [...get().deliveryIds];
    if (ids[deliveryIndex] === null) ids[deliveryIndex] = returnedId;
    set({ deliveryIds: ids });
  }
}

async function currentServerSeq(inningsId: string): Promise<number> {
  const { data } = await supabase
    .from('deliveries')
    .select('seq')
    .eq('innings_id', inningsId)
    .eq('is_deleted', false)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.seq ?? 0;
}

function fireHaptic(delivery: Delivery, input: DeliveryInput) {
  if (input.wicket) return haptic('wicket');
  if (delivery.isBoundaryFour || delivery.isBoundarySix) return haptic('boundary');
  if (delivery.runsTotal === 0) return haptic('dot');
  return haptic('runs');
}

function applyEvents(
  set: (partial: Partial<ScorerState>) => void,
  get: () => ScorerState,
  events: EngineEvent[]
) {
  for (const event of events) {
    if (event.type === 'OVER_COMPLETE') {
      set({ mode: 'AWAITING_BOWLER' });
    }
    if (event.type === 'NEW_BATTER_REQUIRED') {
      set({ mode: 'AWAITING_BATTER' });
    }
    if (event.type === 'INNINGS_COMPLETE') {
      void handleInningsComplete(set, get, event.inningsNo, event.reason);
    }
  }
}

async function handleInningsComplete(
  set: (partial: Partial<ScorerState>) => void,
  get: () => ScorerState,
  inningsNo: number,
  reason: string
) {
  const { matchId, matchState, inningsIdByNo, teamAId, teamBId } = get();
  if (!matchId || !matchState || !teamAId || !teamBId) return;
  const inningsId = inningsIdByNo[inningsNo];
  if (inningsId) {
    await supabase.rpc('end_innings', { p_innings_id: inningsId, p_reason: reason });
  }

  if (inningsNo % 2 === 1) {
    set({ mode: 'INNINGS_BREAK' });
    return;
  }

  const innings1 = matchState.innings.find((i) => i.inningsNo === inningsNo - 1);
  const innings2 = matchState.innings.find((i) => i.inningsNo === inningsNo);
  if (!innings1 || !innings2) return;

  const config = effectiveConfig(matchState);
  let result: MatchResult;
  if (inningsNo <= 2) {
    result = computeMatchResult(innings1, innings2, config);
  } else {
    const superOverPairs = Math.floor((inningsNo - 2) / 2);
    result = resolveTiedSuperOvers(
      matchState.innings,
      teamAId,
      teamBId,
      superOverPairs >= DEFAULT_MAX_SUPER_OVER_ATTEMPTS
    );
  }

  if (result.type === 'tie' && matchState.config.superOverOnTie) {
    set({ mode: 'INNINGS_BREAK', matchResult: result });
    return;
  }

  set({ mode: 'MATCH_OVER', matchResult: result });
  await supabase.rpc('complete_match', {
    p_match_id: matchId,
    p_result_type: result.type,
    p_winner_team_id: result.winnerTeamId,
    p_win_margin_runs: result.marginRuns,
    p_win_margin_wickets: result.marginWickets,
    p_result_text: result.text,
  });
}
