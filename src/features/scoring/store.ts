import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { haptic } from '@/lib/haptics';
import {
  attachShotToPending,
  erroredCount as dexieErroredCount,
  pendingCount as dexiePendingCount,
  type PendingDelivery,
} from '@/lib/db';
import { useUiStore } from '@/stores/uiStore';
import { toEngineDelivery } from '@/lib/deliveryRow';
import { classifyError, userMessage } from '@/lib/errors';
import { padModeForInnings } from './padMode';
import { resultText } from './resultText';
import { loadRestorableCrease, rememberCrease } from './creaseMemo';
import {
  attachSyncWorker,
  discardQueuedForInnings,
  enqueueDelivery,
  flushInnings,
  retryQueuedForInnings,
  subscribeSyncEvents,
  type SyncEvent,
} from '@/lib/syncWorker';
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
  /** No innings row exists yet — `start_innings` has never been called. */
  | 'NOT_STARTED'
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
  /** Display names, so the result can say who won. See `resultText`. */
  teamAName: string | null;
  teamBName: string | null;
  /** The spectator link's slug. The scorer is the person who needs to send
      it, and had no way to reach it without leaving the pad. */
  publicSlug: string | null;
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
  /** Last server seq known to be durably committed, per innings id. Used
      instead of a per-ball network read (Phase 5's `currentServerSeq`) so
      committing a ball never depends on connectivity — docs/09 § 5. */
  syncedSeq: Record<string, number>;
  /** Mirrors `navigator.onLine`. Drives the sync pill's `offline` state. */
  online: boolean;
  /** A drain attempt hit a non-network, non-conflict error (MATCH_LOCKED,
      a genuine exception, ...) that a plain retry won't fix on its own.
      Drives the sync pill's `error` state — docs/05 § 6.3. */
  hasSyncError: boolean;
  /** *What* went wrong, not just that something did. The sync worker has
      always had the server's own message — `MATCH_LOCKED`, `BOWLER_LIMIT`,
      `CONSECUTIVE_OVER`, a constraint violation, a 5xx — and the store threw
      it away, so the pad could only ever say "⚠ sync error". A scorer whose
      balls have stopped reaching the server needs the sentence, not the
      symbol: it is the difference between "pick a different bowler" and
      "your match is broken". */
  syncErrorMessage: string | null;
  /** Set when the sync worker reports STALE_SEQ or a business-rule clash
      that only makes sense if a co-scorer scored differently while this
      device was offline. Non-null blocks the pad — docs/05 § 6.6. */
  conflict: { inningsId: string; pending: PendingDelivery[] } | null;
  /** `start_innings` is in flight. Exists so the button can say so — a
      request with no visible state is indistinguishable from a dead button. */
  starting: boolean;
  /** This device's own signed-in identity — needed to broadcast (and to
      ignore its own echo of) soft locks. docs/03 § 3.6. */
  myProfileId: string | null;
  myDisplayName: string | null;
  /** A co-scorer's soft lock received over realtime broadcast — never set
      by this device's own actions. Dims the pad for its duration —
      docs/03 § 3.6: "Arjun is entering a wicket…", 8s. */
  softLock: { displayName: string; action: string; until: number } | null;
  /** Advanced Mode's wagon-wheel prompt — docs/05 § 8. Set for a couple of
      seconds after a ball that scored off the bat, cleared by a tap on the
      field, by the next ball, or by its own timer. The ball is already
      recorded either way; this only decides whether it carries coordinates. */
  shotPrompt: { clientDeliveryId: string; runs: number } | null;

  init: (matchId: string) => Promise<void>;
  armModifier: (m: ExtraType | null) => void;
  recordRun: (runs: number) => Promise<void>;
  recordExtra: (extraRuns: number) => Promise<void>;
  recordWicket: (wicket: WicketInput, runs?: number) => Promise<void>;
  pickOpeners: (strikerId: PlayerId, nonStrikerId: PlayerId) => void;
  pickBowler: (bowlerId: PlayerId) => void;
  pickBatter: (playerId: PlayerId) => void;
  undo: () => Promise<void>;
  editDelivery: (
    deliveryId: string,
    changes: EditableDeliveryChanges,
    reason?: string
  ) => Promise<void>;
  startNextInnings: () => Promise<void>;
  markRevoked: (revoked: boolean) => void;
  dismissError: () => void;
  openWicketSheet: () => void;
  closeWicketSheet: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  setScorerTab: (tab: ScorerState['scorerTab']) => void;
  dismissDuplicateWarning: () => void;
  /** docs/05-SCORER-VIEW.md § 6.6 "Keep theirs" — discard this device's
      queued balls for the conflicted innings and resync from the server. */
  resolveConflictKeepTheirs: () => Promise<void>;
  /** "Keep both" — re-anchor this device's queued balls to the current
      server seq and retry, landing them after whatever the other scorer
      wrote. True "Keep mine" (discarding the other scorer's committed
      ball) isn't offered here; see syncWorker.ts's own comment on why. */
  resolveConflictKeepMine: () => Promise<void>;
  dismissSyncError: () => void;
  /** Re-anchor this innings' stuck balls to the server's current seq and try
      again. Same machinery the merge screen's "Keep both" uses — a queue
      wedged behind a hard error and a queue wedged behind a conflict need the
      identical thing done to them, and the scorer had a button for only one
      of the two. */
  retrySync: () => Promise<void>;
  /** Advanced Mode — record where the last ball went. `x`/`y` are normalised
      to -1..1 with the batter at the origin, matching what `WagonWheel` draws
      and the `shot: {x, y}` the RPC persists. */
  attachShot: (x: number, y: number) => Promise<void>;
  dismissShotPrompt: () => void;
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

/** The embedded team join, which the generated types cannot express. */
function teamName(row: unknown): string | null {
  const t = row as { short_code?: string; name?: string } | null;
  return t?.short_code ?? t?.name ?? null;
}

function currentInnings(state: MatchState) {
  return state.innings[state.currentInningsIndex] ?? null;
}

function effectiveConfig(state: MatchState) {
  const innings = currentInnings(state);
  return innings?.isSuperOver ? superOverConfig(state.config) : state.config;
}

export const useScorerStore = create<ScorerState>((set, get) => ({
  matchId: null,
  teamAId: null,
  teamAName: null,
  teamBName: null,
  publicSlug: null,
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
  syncedSeq: {},
  online: typeof navigator === 'undefined' || navigator.onLine,
  hasSyncError: false,
  syncErrorMessage: null,
  conflict: null,
  starting: false,
  myProfileId: null,
  myDisplayName: null,
  softLock: null,
  shotPrompt: null,

  init: async (matchId) => {
    set({ mode: 'LOADING', matchId, error: null });

    const { data: match, error: matchError } = await supabase
      .from('matches')
      // Team names come along so the result sentence can name the winner.
      // The engine only knows ids, so its own `result.text` renders a raw
      // UUID — which is what the first completed match showed a human.
      .select(
        '*, team_a:teams!matches_team_a_id_fkey(name,short_code), team_b:teams!matches_team_b_id_fkey(name,short_code)'
      )
      .eq('id', matchId)
      .single();
    if (matchError || !match) {
      set({ mode: 'ERROR', error: matchError?.message ?? 'Match not found' });
      return;
    }

    // These three were previously fetched with their errors discarded, and an
    // empty result is indistinguishable from a failed one once it reaches the
    // pad: no squad rows renders AWAITING_OPENERS with the "Who is on strike?"
    // prompt and no names under it, which reads as a broken app rather than a
    // failed request. Surface them the same way the match query is surfaced.
    const { data: inningsRows, error: inningsError } = await supabase
      .from('innings')
      .select('*')
      .eq('match_id', matchId)
      .order('innings_no');
    if (inningsError) {
      set({ mode: 'ERROR', error: userMessage(classifyError(inningsError)) });
      return;
    }

    const { data: squadRows, error: squadError } = await supabase
      .from('match_squads')
      .select('*, player:players(*)')
      .eq('match_id', matchId)
      .eq('is_playing_xi', true);
    if (squadError) {
      set({ mode: 'ERROR', error: userMessage(classifyError(squadError)) });
      return;
    }

    const config = match.config as unknown as MatchConfig;

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

    // The batting order goes into the seed, so the engine knows both who is
    // yet to bat and how many players the side actually has. Neither was ever
    // supplied: `yetToBat` stayed empty for every match, so the "next batter"
    // picker read "No batters remaining" at the first wicket of every innings
    // ever scored here — and a side picked shorter than `playersPerSide` could
    // reach a state with nobody left to bat and an innings that had not ended.
    const seeds: InningsSeed[] = (inningsRows ?? []).map((i) => ({
      inningsNo: i.innings_no,
      battingTeamId: i.batting_team_id,
      bowlingTeamId: i.bowling_team_id,
      isSuperOver: i.is_super_over,
      battingOrder: (i.batting_team_id === match.team_a_id ? squadA : squadB).map((p) => p.id),
    }));
    const inningsIdByNo: Record<number, string> = {};
    for (const i of inningsRows ?? []) inningsIdByNo[i.innings_no] = i.id;

    let deliveries: Delivery[] = [];
    let deliveryIds: string[] = [];
    const syncedSeq: Record<string, number> = {};
    if (inningsRows && inningsRows.length > 0) {
      const ids = inningsRows.map((i) => i.id);
      for (const id of ids) syncedSeq[id] = 0;
      const { data: deliveryRows, error: deliveryError } = await supabase
        .from('deliveries')
        .select('*')
        .in('innings_id', ids)
        .eq('is_deleted', false)
        .order('seq');
      // Silently treating this as "no balls bowled" is the worst of the three:
      // the pad would open at 0/0 on a match already in progress, and the
      // scorer's next ball would be seq 1 against a server that has fifty.
      if (deliveryError) {
        set({ mode: 'ERROR', error: userMessage(classifyError(deliveryError)) });
        return;
      }

      const noByInningsId = new Map(inningsRows.map((i) => [i.id, i.innings_no]));
      deliveries = (deliveryRows ?? []).map((row) => ({
        ...toEngineDelivery(row),
        inningsNo: noByInningsId.get(row.innings_id) ?? 0,
      }));
      deliveryIds = (deliveryRows ?? []).map((row) => row.id);
      for (const row of deliveryRows ?? []) {
        syncedSeq[row.innings_id] = Math.max(syncedSeq[row.innings_id] ?? 0, row.seq);
      }
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

    // Put back the openers and the opening bowler if they were chosen on this
    // device and no ball has been bowled since. Between `start_innings` and
    // the first delivery there is nothing in the database that records the
    // crease, so navigating away and back re-asked all three questions.
    // `restorableCrease` is what keeps this safe — in particular it refuses
    // once any delivery exists, where a null striker means a wicket has just
    // fallen rather than "not chosen yet".
    {
      const innings = currentInnings(matchState);
      if (innings && !match.is_locked && matchState.status !== 'completed') {
        const bowlingSquad = innings.bowlingTeamId === match.team_a_id ? squadA : squadB;
        const restore = loadRestorableCrease(matchId, innings.inningsNo, {
          hasDeliveries: deliveries.some((d) => d.inningsNo === innings.inningsNo),
          strikerId: innings.strikerId,
          nonStrikerId: innings.nonStrikerId,
          bowlerId: innings.bowlerId,
          yetToBat: innings.yetToBat,
          bowlingSquad: bowlingSquad.map((p) => p.id),
        });
        if (restore.strikerId && restore.nonStrikerId) {
          matchState = setNewBatter(matchState, restore.strikerId);
          matchState = setNewBatter(matchState, restore.nonStrikerId);
        }
        if (restore.bowlerId) matchState = setBowler(matchState, restore.bowlerId);
      }
    }

    const innings = currentInnings(matchState);
    let mode: PadMode = 'READY';
    if (match.is_locked || matchState.status === 'completed') {
      mode = 'MATCH_OVER';
    } else if (!innings) {
      // Not AWAITING_OPENERS. There is no innings to pick openers *for*, and
      // `OpenersPicker` returns null without one — which rendered the pad as a
      // black rectangle with WICKET and UNDO floating at the bottom, the first
      // thing anyone saw on the real thing. `start_innings` has to be called
      // first, and only `NOT_STARTED` says so.
      mode = 'NOT_STARTED';
    } else {
      mode = padModeForInnings(innings);
    }

    set({
      teamAId: match.team_a_id,
      publicSlug: match.public_slug,
      teamAName: teamName(match.team_a),
      teamBName: teamName(match.team_b),
      teamBId: match.team_b_id,
      config,
      matchState,
      deliveries,
      deliveryIds,
      inningsIdByNo,
      syncedSeq,
      squadA,
      squadB,
      mode,
      error: null,
    });

    ensureSyncWorkerAttached(set, get, matchId);
    void refreshPendingCount(set, get);
    ensureSoftLockChannelAttached(set, get, matchId);
    void loadMyIdentity(set);
    // Catch up any innings the engine considers finished that the server still
    // has open — the case `handleInningsComplete` deliberately leaves behind
    // when it cannot upload the closing ball. Fire-and-forget: it is a repair,
    // not part of loading the pad.
    void reconcileEndedInnings(
      matchId,
      matchState,
      inningsIdByNo,
      new Map((inningsRows ?? []).map((i) => [i.innings_no, i.status]))
    );
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
    persistCrease(get());
  },

  pickBowler: (bowlerId) => {
    const { matchState } = get();
    if (!matchState) return;
    const next = setBowler(matchState, bowlerId);
    set({ matchState: next, mode: 'READY' });
    persistCrease(get());
  },

  pickBatter: (playerId) => {
    const { matchState } = get();
    if (!matchState) return;
    const next = setNewBatter(matchState, playerId);
    set({ matchState: next, mode: 'READY' });
    persistCrease(get());
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
    if (!matchId) {
      // Was a bare `return`. Every silent path out of this function reads as
      // "the button does nothing", which is the one outcome that tells nobody
      // anything — reported exactly that way on 2026-08-04.
      set({ error: 'No match is loaded. Reload the page.' });
      return;
    }

    set({ starting: true, error: null });
    try {
      const { error } = await supabase.rpc('start_innings', { p_match_id: matchId });
      if (error) {
        // TOSS_REQUIRED / XI_REQUIRED / FORBIDDEN all arrive here, and each
        // says exactly what is missing — worth translating rather than raw.
        set({ error: userMessage(classifyError(error)) });
        return;
      }

      await get().init(matchId);

      // The RPC returned an innings and `init` still cannot see one. Nothing
      // known produces this — which is exactly why it must not be silent.
      if (get().mode === 'NOT_STARTED') {
        set({
          error:
            'The server started the innings but it did not come back. Reload; if it persists, ' +
            'the match may need setting up again.',
        });
      }
    } catch (e) {
      // `init` awaits four queries and a replay. A throw here used to reject
      // the promise the button fires and forgets, so it reached the console
      // and nowhere else.
      set({ error: userMessage(classifyError(e)) });
    } finally {
      set({ starting: false });
    }
  },

  markRevoked: (revoked) => set({ revoked, mode: revoked ? 'READ_ONLY' : get().mode }),
  dismissError: () => set({ error: null }),

  openWicketSheet: () => {
    const { mode } = get();
    if (mode !== 'READY') return;
    set({ preWicketSheetMode: mode, mode: 'WICKET_SHEET' });
    broadcastSoftLock(get(), 'entering a wicket');
  },
  closeWicketSheet: () => {
    const { preWicketSheetMode } = get();
    set({ mode: preWicketSheetMode ?? 'READY', preWicketSheetMode: null });
  },
  openHistory: () => set({ historyOpen: true }),
  closeHistory: () => set({ historyOpen: false }),
  setScorerTab: (tab) => set({ scorerTab: tab }),
  dismissDuplicateWarning: () => set({ duplicateWarning: false }),

  resolveConflictKeepTheirs: async () => {
    const { matchId, conflict } = get();
    if (!matchId || !conflict) return;
    await discardQueuedForInnings(matchId, conflict.inningsId);
    set({ conflict: null });
    await get().init(matchId);
  },
  resolveConflictKeepMine: async () => {
    const { matchId, conflict } = get();
    if (!matchId || !conflict) return;
    await retryQueuedForInnings(matchId, conflict.inningsId);
    set({ conflict: null });
  },
  dismissSyncError: () => set({ hasSyncError: false, syncErrorMessage: null }),

  retrySync: async () => {
    const { matchId, matchState, inningsIdByNo } = get();
    if (!matchId || !matchState) return;
    const innings = currentInnings(matchState);
    const inningsId = innings ? inningsIdByNo[innings.inningsNo] : undefined;
    if (!inningsId) return;
    set({ hasSyncError: false, syncErrorMessage: null });
    await retryQueuedForInnings(matchId, inningsId);
  },

  dismissShotPrompt: () => set({ shotPrompt: null }),

  attachShot: async (x, y) => {
    const prompt = get().shotPrompt;
    if (!prompt) return;
    set({ shotPrompt: null });
    const patched = await attachShotToPending(prompt.clientDeliveryId, { x, y });
    if (patched) return haptic('select');

    // Already gone to the server. `deliveries_update_by_grant` lets a scorer
    // with rights write this column, so a narrow UPDATE keyed on the
    // idempotency key is honest here — it is not reversing anything, it is
    // filling in a field the insert left null. It is also the *only* place
    // the client touches `deliveries` directly, which is why it is this
    // small and this specific.
    const { error } = await supabase
      .from('deliveries')
      .update({ shot_x: x, shot_y: y })
      .eq('client_delivery_id', prompt.clientDeliveryId);
    // Silent on failure on purpose: the ball itself is safe, and the pad is
    // not the place to explain that an optional coordinate did not stick.
    if (!error) haptic('select');
  },
}));

/**
 * Write the current crease to the local memo.
 *
 * Only ever a no-op or an overwrite of this innings' own entry, so it is safe
 * to call after every picker. Once the first ball is bowled the memo stops
 * being read (`restorableCrease` refuses once deliveries exist) — it is not
 * deleted, because the next innings has a different key and the entry is a
 * few dozen bytes.
 */
function persistCrease(state: ScorerState): void {
  const { matchId, matchState } = state;
  if (!matchId || !matchState) return;
  const innings = currentInnings(matchState);
  if (!innings) return;
  rememberCrease(matchId, innings.inningsNo, {
    strikerId: innings.strikerId,
    nonStrikerId: innings.nonStrikerId,
    bowlerId: innings.bowlerId,
  });
}

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
  if (
    !innings ||
    innings.strikerId === null ||
    innings.nonStrikerId === null ||
    innings.bowlerId === null
  ) {
    return;
  }
  const strikerId = innings.strikerId;
  const nonStrikerId = innings.nonStrikerId;
  const bowlerId = innings.bowlerId;

  const result = applyDelivery(state.matchState, input);
  if (!result.ok) {
    set({ error: result.error });
    haptic('error');
    return;
  }

  // Optimistic: the pad reflects the new state instantly. docs/05 § 2 —
  // "no confirm, no dialog." Everything below this point — the Dexie write
  // and the sync worker it kicks — is durable-but-background: none of it
  // is awaited by anything the UI is waiting on.
  set({
    matchState: result.state,
    deliveries: [...state.deliveries, result.delivery],
    deliveryIds: [...state.deliveryIds, null],
    armedModifier: null,
    error: null,
    lastTap: { key: tapKey, at: Date.now() },
    duplicateWarning: tapGuard === 'warn',
    // Advanced Mode, docs/05 § 8 — "after committing a ball, a small field
    // overlay appears; ignore it and it fades, the ball is already recorded."
    // Only for runs off the bat: a wide has no shot, and a dot is the most
    // common ball there is, so prompting on one would put an overlay in front
    // of the pad most of the time for no data.
    shotPrompt:
      useUiStore.getState().advancedScoring && result.delivery.runsBatter > 0
        ? { clientDeliveryId: input.clientDeliveryId, runs: result.delivery.runsBatter }
        : null,
  });
  fireHaptic(result.delivery, input);
  applyPadEvents(set, result.events);

  const matchId = get().matchId;
  const inningsId = get().inningsIdByNo[innings.inningsNo];
  if (!matchId || !inningsId) {
    set({ error: 'No innings id for the current innings — cannot record this ball' });
    return;
  }

  // **The ball goes in the outbox before the events fire.** Order matters, and
  // getting it wrong quietly undid a fix.
  //
  // INNINGS_COMPLETE's handler flushes the outbox and *then* closes the
  // innings on the server — precisely so the closing ball gets there first.
  // With the enqueue below the event dispatch, that flush
  // ran against an outbox this very ball had not been added to yet: it found
  // nothing, reported success, and `end_innings` beat the ball to the server
  // after all. The server then refused it — `INNINGS_COMPLETE` — and every
  // innings still finished one ball short.
  //
  // Reported again on 2026-08-04, on a match scored *after* the flush shipped:
  // "the last ball did not register. I see still 5 balls bowled, but the game
  // was actually won on the 6th."
  //
  // Nothing about the pad's responsiveness changes: this is a Dexie write, not
  // a request, and the optimistic `set` above has already painted the score.
  const syncedSeq = get().syncedSeq[inningsId] ?? 0;
  await enqueueDelivery(
    matchId,
    inningsId,
    input.clientDeliveryId,
    {
      ...input,
      strikerId,
      nonStrikerId,
      bowlerId,
      commentaryOverride: result.delivery.commentary,
    },
    syncedSeq
  );

  applyInningsEndEvents(set, get, result.events);
  void refreshPendingCount(set, get);
}

function fireHaptic(delivery: Delivery, input: DeliveryInput) {
  if (input.wicket) return haptic('wicket');
  if (delivery.isBoundaryFour || delivery.isBoundarySix) return haptic('boundary');
  if (delivery.runsTotal === 0) return haptic('dot');
  return haptic('runs');
}

/**
 * The mode changes — synchronous, and deliberately so.
 *
 * "Who is the next batter" has to be on screen the instant a wicket falls; a
 * scorer should never watch the pad think. These touch nothing but local
 * state, so they run before the ball is even written to the outbox.
 */
function applyPadEvents(set: (partial: Partial<ScorerState>) => void, events: EngineEvent[]) {
  for (const event of events) {
    if (event.type === 'OVER_COMPLETE') set({ mode: 'AWAITING_BOWLER' });
    if (event.type === 'NEW_BATTER_REQUIRED') set({ mode: 'AWAITING_BATTER' });
  }
}

/**
 * The end of an innings — and this one has to wait.
 *
 * Closing the innings on the server must happen *after* the ball that closed
 * it is in the outbox, or the flush inside `handleInningsComplete` finds an
 * empty queue, reports success, and `end_innings` beats the ball to the
 * server. That is the bug that cost the last ball of every innings twice over.
 * Kept separate from the pad events so the split is impossible to collapse by
 * accident.
 */
function applyInningsEndEvents(
  set: (partial: Partial<ScorerState>) => void,
  get: () => ScorerState,
  events: EngineEvent[]
) {
  for (const event of events) {
    if (event.type === 'INNINGS_COMPLETE') {
      void handleInningsComplete(set, get, event.inningsNo, event.reason);
    }
  }
}

/**
 * Close, on the server, any innings the engine already considers over.
 *
 * The pair to `handleInningsComplete`'s deliberate bail-out. When the closing
 * ball could not be uploaded — offline, or a transient failure — that function
 * leaves the innings open on purpose, because an innings left open is
 * recoverable and a stranded ball is not. Something has to finish the job
 * afterwards, and doing it on `init` covers a reload and a returning app as
 * well as a recovered network.
 *
 * `flushInnings` gates it every time: closing an innings with anything still
 * in the outbox is the original bug, and it must not come back through the
 * repair path.
 */
async function reconcileEndedInnings(
  matchId: string,
  matchState: MatchState,
  inningsIdByNo: Record<number, string>,
  statusByNo: Map<number, string>
): Promise<void> {
  for (const innings of matchState.innings) {
    if (innings.status === 'in_progress') continue;
    if (statusByNo.get(innings.inningsNo) !== 'in_progress') continue;
    const inningsId = inningsIdByNo[innings.inningsNo];
    if (!inningsId) continue;
    if (!(await flushInnings(matchId, inningsId))) continue;
    await supabase.rpc('end_innings', {
      p_innings_id: inningsId,
      p_reason: innings.endReason ?? 'all_out',
    });
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
    // Upload the balls *first*. The delivery that ended the innings is still
    // in the outbox at this point — scoring never awaits the network — so
    // closing the innings here used to beat it to the server, and the ball was
    // then refused forever with `INNINGS_COMPLETE: this innings has already
    // ended`. Every innings lost its last ball that way.
    const flushed = await flushInnings(matchId, inningsId);
    if (!flushed) {
      // Offline, or a ball the server will not take. Closing the innings now
      // would strand it permanently, and an innings left open is recoverable
      // where a stranded ball is not. The scorer sees the sync pill; the next
      // successful drain re-runs this.
      set({ mode: 'INNINGS_BREAK' });
      return;
    }
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
  // `result.text` is the *engine's* sentence, and the engine is pure — it knows
  // team ids and nothing else, so that string reads
  // "de992579-4a81-4c13-8471-d0fa6d361553 won the super over by 1 run". That
  // went into `matches.result_text`, which is now what every screen shows, so
  // a raw UUID was the headline on the audience view. `resultText` has existed
  // since Phase 5 for exactly this and was never wired to the one write that
  // persists the sentence.
  const nameForTeam = (id: string) =>
    (id === teamAId ? get().teamAName : get().teamBName) ?? 'The winners';
  await supabase.rpc('complete_match', {
    p_match_id: matchId,
    p_result_type: result.type,
    p_winner_team_id: result.winnerTeamId,
    p_win_margin_runs: result.marginRuns,
    p_win_margin_wickets: result.marginWickets,
    p_result_text: resultText(result, nameForTeam),
  });
}

// ── Sync worker plumbing ───────────────────────────────────────────────

let onlineListenerAttached = false;
let currentSyncSubscription: {
  matchId: string;
  unsubscribe: () => void;
  detach: () => void;
} | null = null;

/** Idempotent per matchId — re-running `init()` for the same match (undo,
    edit, next innings, ...) doesn't pile up duplicate event listeners. */
function ensureSyncWorkerAttached(
  set: (partial: Partial<ScorerState>) => void,
  get: () => ScorerState,
  matchId: string
) {
  if (!onlineListenerAttached && typeof window !== 'undefined') {
    window.addEventListener('online', () => set({ online: true }));
    window.addEventListener('offline', () => set({ online: false }));
    onlineListenerAttached = true;
  }
  if (currentSyncSubscription?.matchId === matchId) return;
  currentSyncSubscription?.unsubscribe();
  currentSyncSubscription?.detach();
  const detach = attachSyncWorker(matchId);
  const unsubscribe = subscribeSyncEvents(matchId, (event) => handleSyncEvent(set, get, event));
  currentSyncSubscription = { matchId, unsubscribe, detach };
}

async function refreshPendingCount(
  set: (partial: Partial<ScorerState>) => void,
  get: () => ScorerState
) {
  const matchId = get().matchId;
  if (!matchId) return;
  const n = await dexiePendingCount(matchId);
  // `hasSyncError` was in-memory only, so a reload dropped it: the pill went
  // back to "N pending" while the outbox still held balls that had failed and
  // would keep failing. The queue is the durable record of that, and after a
  // reload it is the only one. Never clears the flag here — a live 'synced'
  // event does that, and this runs often enough to race it.
  const errored = await dexieErroredCount(matchId);
  set({ pendingCount: n, ...(errored > 0 ? { hasSyncError: true } : {}) });
}

function handleSyncEvent(
  set: (partial: Partial<ScorerState>) => void,
  get: () => ScorerState,
  event: SyncEvent
) {
  switch (event.type) {
    case 'synced':
    case 'duplicate': {
      const state = get();
      const idx = state.deliveries.findIndex((d) => d.clientDeliveryId === event.clientDeliveryId);
      if (idx !== -1 && state.deliveryIds[idx] == null) {
        const ids = [...state.deliveryIds];
        ids[idx] = event.serverDeliveryId;
        set({ deliveryIds: ids });
      }
      const inningsNo = idx !== -1 ? state.deliveries[idx]?.inningsNo : undefined;
      const inningsId = inningsNo != null ? state.inningsIdByNo[inningsNo] : undefined;
      if (inningsId) {
        set({
          syncedSeq: {
            ...state.syncedSeq,
            [inningsId]: Math.max(state.syncedSeq[inningsId] ?? 0, event.serverSeq),
          },
        });
      }
      set({ hasSyncError: false, syncErrorMessage: null });
      void refreshPendingCount(set, get);
      break;
    }
    case 'rejected':
      void refreshPendingCount(set, get);
      break;
    case 'error':
      set({ hasSyncError: true, syncErrorMessage: event.message });
      break;
    case 'conflict':
      set({ conflict: { inningsId: event.inningsId, pending: event.pending } });
      break;
  }
}

// ── Soft locks between co-scorers (docs/03 § 3.6) ───────────────────────

let currentSoftLockChannel: {
  matchId: string;
  channel: RealtimeChannel;
  unsubscribe: () => void;
} | null = null;

async function loadMyIdentity(set: (partial: Partial<ScorerState>) => void) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', uid)
    .single();
  set({ myProfileId: uid, myDisplayName: profile?.display_name ?? 'A scorer' });
}

/** Idempotent per matchId, same rationale as `ensureSyncWorkerAttached`. */
function ensureSoftLockChannelAttached(
  set: (partial: Partial<ScorerState>) => void,
  get: () => ScorerState,
  matchId: string
) {
  if (currentSoftLockChannel?.matchId === matchId) return;
  currentSoftLockChannel?.unsubscribe();

  const channel = supabase
    .channel(`scorer-soft-lock:${matchId}`)
    .on(
      'broadcast',
      { event: 'soft_lock' },
      ({
        payload,
      }: {
        payload: { profileId: string; displayName: string; action: string; ttl: number };
      }) => {
        if (payload.profileId === get().myProfileId) return; // ignore our own echo
        const until = Date.now() + payload.ttl * 1000;
        set({ softLock: { displayName: payload.displayName, action: payload.action, until } });
        setTimeout(() => {
          if (get().softLock?.until === until) set({ softLock: null });
        }, payload.ttl * 1000);
      }
    );
  channel.subscribe();

  currentSoftLockChannel = {
    matchId,
    channel,
    unsubscribe: () => supabase.removeChannel(channel),
  };
}

function broadcastSoftLock(state: ScorerState, action: string, ttlSeconds = 8) {
  if (!currentSoftLockChannel || !state.myProfileId) return;
  currentSoftLockChannel.channel.send({
    type: 'broadcast',
    event: 'soft_lock',
    payload: {
      profileId: state.myProfileId,
      displayName: state.myDisplayName ?? 'A scorer',
      action,
      ttl: ttlSeconds,
    },
  });
}
