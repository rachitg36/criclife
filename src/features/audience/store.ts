import { create } from 'zustand';
import { applyLoggedDelivery, createInitialMatchState, replay } from '@/engine';
import type { MatchConfig, MatchState, MatchStatus } from '@/engine/types';
import type { InningsSeed } from '@/engine/replay';
import { toEngineDelivery, type DeliveryRow } from '@/lib/deliveryRow';
import { PublicApiError, selectAll, selectMany, selectOne } from '@/lib/publicApi';
import { setTeamAccent } from '@/lib/theme';
import type { ConnectionState } from '@/components/ui/LivePill';
import { detectMoments, type Moment } from './moments';
import type {
  AudienceDelivery,
  AudienceInningsRow,
  AudienceMatch,
  AudiencePlayer,
  AudienceTeam,
} from './types';

/**
 * The audience view's read-only state. docs/06-AUDIENCE-VIEW.md.
 *
 * Two rules shape everything here:
 *
 * 1. **Nothing a spectator sees on load waits for `@supabase/supabase-js`.**
 *    The snapshot comes from `@/lib/publicApi` (plain fetch); the real client
 *    is dynamically imported afterwards, only for the Realtime socket. See
 *    that file for the measured reason.
 * 2. **One ball in, one ball applied.** A new delivery is folded onto the
 *    existing `MatchState` with `applyLoggedDelivery`, not by re-replaying the
 *    innings — an O(n) re-fold on every ball is a visible hitch on a phone by
 *    the death overs. Corrections (an undo or an edit, both of which mutate an
 *    existing row) *do* re-replay from ball one, because that is the only
 *    honest way to rebuild state the append-only log no longer implies.
 */

export type AudienceTab = 'live' | 'scorecard' | 'charts' | 'squads';

type SnapshotRow = {
  id: string;
  public_slug: string | null;
  title: string | null;
  venue: string | null;
  status: MatchStatus;
  is_locked: boolean;
  config: unknown;
  scheduled_at: string | null;
  team_a_id: string;
  team_b_id: string;
  team_a: TeamRow;
  team_b: TeamRow;
  innings: InningsRow[];
};

type TeamRow = {
  id: string;
  name: string;
  short_code: string;
  primary_color: string;
  secondary_color: string | null;
  logo_url: string | null;
};

type InningsRow = {
  id: string;
  innings_no: number;
  batting_team_id: string;
  bowling_team_id: string;
  is_super_over: boolean;
  status: string;
  target: number | null;
  revised_target: number | null;
  revised_overs: number | null;
};

type SquadRow = {
  team_id: string;
  is_captain: boolean;
  is_wicket_keeper: boolean;
  batting_order: number | null;
  player: {
    id: string;
    full_name: string;
    short_name: string | null;
    photo_url: string | null;
    primary_role: string | null;
    batting_hand: string | null;
    bowling_style: string | null;
  };
};

/** How long the tab may sit hidden before the socket is closed. docs/06 § 3. */
const BACKGROUND_CLOSE_MS = 5 * 60 * 1000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

type AudienceState = {
  slug: string | null;
  status: 'idle' | 'loading' | 'ready' | 'not_found' | 'error';
  error: string | null;
  connection: ConnectionState;

  match: AudienceMatch | null;
  innings: AudienceInningsRow[];
  players: AudiencePlayer[];
  deliveries: AudienceDelivery[];
  matchState: MatchState | null;

  tab: AudienceTab;
  /** Moments waiting to be played, oldest first. The overlay drains this. */
  momentQueue: Moment[];
  /** docs/06 § 3 — "you missed 18 balls" after a long background. */
  missedBalls: number | null;
  /**
   * Completed-match replay scrubber (docs/06 § 7). `null` = showing the live
   * / final state; a number is how many deliveries of the log to fold.
   */
  scrubTo: number | null;

  load: (slug: string) => Promise<void>;
  teardown: () => void;
  setTab: (tab: AudienceTab) => void;
  consumeMoment: (key: string) => void;
  dismissMissed: () => void;
  setScrubTo: (index: number | null) => void;
  /** Manual "tap to resume" from the paused pill. */
  resume: () => void;
};

/* ── module-scope side channels ────────────────────────────────────────────
   Deliberately not in the store: a websocket, a timer id and an AbortController
   are not state anything renders, and putting them in the store would make
   every subscriber re-render when a reconnect timer is rescheduled. */
type Unsubscribe = () => void;
let channelTeardown: Unsubscribe | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityTeardown: Unsubscribe | null = null;
let reconnectAttempt = 0;
let loadAbort: AbortController | null = null;
/** Generation counter — an in-flight load for an old slug must not win. */
let generation = 0;

function toTeam(row: TeamRow): AudienceTeam {
  return {
    id: row.id,
    name: row.name,
    shortCode: row.short_code,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    logoUrl: row.logo_url,
  };
}

function toInnings(row: InningsRow): AudienceInningsRow {
  return {
    id: row.id,
    inningsNo: row.innings_no,
    battingTeamId: row.batting_team_id,
    bowlingTeamId: row.bowling_team_id,
    isSuperOver: row.is_super_over,
    status: row.status,
    target: row.target,
    revisedTarget: row.revised_target,
    revisedOvers: row.revised_overs,
  };
}

function toAudienceDelivery(row: DeliveryRow, inningsNo: number): AudienceDelivery {
  return {
    ...toEngineDelivery(row),
    inningsNo,
    id: row.id,
    seq: row.seq,
    shot: row.shot_x !== null && row.shot_y !== null ? { x: row.shot_x, y: row.shot_y } : null,
    pitch: row.pitch_x !== null && row.pitch_y !== null ? { x: row.pitch_x, y: row.pitch_y } : null,
  };
}

function seedsFrom(innings: AudienceInningsRow[]): InningsSeed[] {
  return innings.map((i) => ({
    inningsNo: i.inningsNo,
    battingTeamId: i.battingTeamId,
    bowlingTeamId: i.bowlingTeamId,
    isSuperOver: i.isSuperOver,
  }));
}

const MATCH_QUERY =
  'select=id,public_slug,title,venue,status,is_locked,config,scheduled_at,team_a_id,team_b_id,' +
  'team_a:teams!matches_team_a_id_fkey(id,name,short_code,primary_color,secondary_color,logo_url),' +
  'team_b:teams!matches_team_b_id_fkey(id,name,short_code,primary_color,secondary_color,logo_url),' +
  'innings(id,innings_no,batting_team_id,bowling_team_id,is_super_over,status,target,revised_target,revised_overs)';

const SQUAD_QUERY =
  'select=team_id,is_captain,is_wicket_keeper,batting_order,' +
  'player:players(id,full_name,short_name,photo_url,primary_role,batting_hand,bowling_style)';

async function fetchDeliveries(
  matchId: string,
  innings: AudienceInningsRow[],
  signal: AbortSignal
): Promise<AudienceDelivery[]> {
  const rows = await selectAll<DeliveryRow>(
    `deliveries?match_id=eq.${matchId}&is_deleted=is.false&select=*&order=seq.asc`,
    signal
  );
  const noById = new Map(innings.map((i) => [i.id, i.inningsNo]));
  return rows.map((r) => toAudienceDelivery(r, noById.get(r.innings_id) ?? 0));
}

export const useAudienceStore = create<AudienceState>((set, get) => ({
  slug: null,
  status: 'idle',
  error: null,
  connection: 'reconnecting',
  match: null,
  innings: [],
  players: [],
  deliveries: [],
  matchState: null,
  tab: 'live',
  momentQueue: [],
  missedBalls: null,
  scrubTo: null,

  load: async (slug) => {
    get().teardown();
    const gen = ++generation;
    const abort = new AbortController();
    loadAbort = abort;
    set({ slug, status: 'loading', error: null, connection: 'reconnecting' });

    try {
      const matchRow = await selectOne<SnapshotRow>(
        `matches?public_slug=eq.${encodeURIComponent(slug)}&${MATCH_QUERY}`,
        abort.signal
      );
      if (gen !== generation) return;
      if (!matchRow) {
        set({ status: 'not_found', error: null });
        return;
      }

      const config = matchRow.config as MatchConfig;
      const innings = (matchRow.innings ?? [])
        .map(toInnings)
        .sort((a, b) => a.inningsNo - b.inningsNo);

      const [squadRows, deliveries] = await Promise.all([
        selectMany<SquadRow>(
          `match_squads?match_id=eq.${matchRow.id}&is_playing_xi=is.true&${SQUAD_QUERY}`,
          abort.signal
        ),
        fetchDeliveries(matchRow.id, innings, abort.signal),
      ]);
      if (gen !== generation) return;

      const players: AudiencePlayer[] = squadRows
        .filter((r) => r.player)
        .map((r) => ({
          id: r.player.id,
          teamId: r.team_id,
          displayName: r.player.short_name || r.player.full_name,
          photoUrl: r.player.photo_url,
          battingStyle: r.player.batting_hand,
          bowlingStyle: r.player.bowling_style,
          playingRole: r.player.primary_role,
          isCaptain: r.is_captain,
          isWicketKeeper: r.is_wicket_keeper,
          battingOrder: r.batting_order,
        }))
        .sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99));

      const match: AudienceMatch = {
        id: matchRow.id,
        publicSlug: matchRow.public_slug,
        title: matchRow.title,
        venue: matchRow.venue,
        status: matchRow.status,
        isLocked: matchRow.is_locked,
        config,
        teamA: toTeam(matchRow.team_a),
        teamB: toTeam(matchRow.team_b),
        scheduledAt: matchRow.scheduled_at,
      };

      let matchState: MatchState;
      try {
        matchState =
          innings.length > 0
            ? replay(matchRow.id, config, deliveries, seedsFrom(innings))
            : createInitialMatchState(matchRow.id, config);
      } catch (e) {
        set({
          status: 'error',
          error: e instanceof Error ? e.message : 'This match could not be replayed.',
        });
        return;
      }

      set({ match, innings, players, deliveries, matchState, status: 'ready' });
      applyBattingTeamTint(get);
      attachRealtime(set, get, matchRow.id, gen);
      attachVisibility(set, get);
    } catch (e) {
      if (gen !== generation) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      const message =
        e instanceof PublicApiError
          ? `Could not load this match (${e.status}).`
          : e instanceof Error
            ? e.message
            : 'Could not load this match.';
      set({ status: 'error', error: message, connection: 'paused' });
    }
  },

  teardown: () => {
    generation += 1;
    loadAbort?.abort();
    loadAbort = null;
    channelTeardown?.();
    channelTeardown = null;
    visibilityTeardown?.();
    visibilityTeardown = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (backgroundTimer) clearTimeout(backgroundTimer);
    backgroundTimer = null;
    reconnectAttempt = 0;
    setTeamAccent(null);
  },

  setTab: (tab) => set({ tab }),
  consumeMoment: (key) => set((s) => ({ momentQueue: s.momentQueue.filter((m) => m.key !== key) })),
  dismissMissed: () => set({ missedBalls: null }),
  setScrubTo: (scrubTo) => set({ scrubTo }),
  resume: () => {
    const { match } = get();
    if (!match) return;
    reconnectAttempt = 0;
    attachRealtime(set, get, match.id, generation);
    void refetchAndReconcile(set, get, { countMissed: true });
  },
}));

type Setter = (partial: Partial<AudienceState>) => void;
type Getter = () => AudienceState;

/**
 * docs/08 § 2 "Team tinting" — the whole UI leans toward whoever is batting.
 * Reset by `teardown`, so leaving the route doesn't leave the rest of the app
 * wearing a team's colours.
 */
function applyBattingTeamTint(get: Getter): void {
  const { matchState, match } = get();
  if (!matchState || !match) return;
  const innings = matchState.innings[matchState.currentInningsIndex];
  if (!innings) {
    setTeamAccent(null);
    return;
  }
  const team = innings.battingTeamId === match.teamA.id ? match.teamA : match.teamB;
  setTeamAccent(team.primaryColor);
}

/**
 * Folds one newly-arrived ball onto the current state and queues whatever it
 * celebrates. Returns silently if the ball is one we already hold — Realtime
 * can and does redeliver, and a re-delivered six must not celebrate twice.
 */
function applyIncoming(set: Setter, get: Getter, row: DeliveryRow): void {
  const state = get();
  const { matchState, innings, deliveries } = state;
  if (!matchState) return;
  if (deliveries.some((d) => d.id === row.id)) return;

  const inningsNo = innings.find((i) => i.id === row.innings_id)?.inningsNo;
  if (inningsNo === undefined) {
    // A ball for an innings we don't know about yet — the `innings` INSERT
    // event has not landed. Refetch rather than guess a seed.
    void refetchAndReconcile(set, get, { countMissed: false });
    return;
  }

  const delivery = toAudienceDelivery(row, inningsNo);
  // Out-of-order arrival: seq must be monotonic for a fold to be meaningful.
  const lastSeq = deliveries[deliveries.length - 1]?.seq ?? 0;
  if (delivery.seq <= lastSeq) {
    void refetchAndReconcile(set, get, { countMissed: false });
    return;
  }

  const result = applyLoggedDelivery(matchState, delivery, seedsFrom(innings));
  if (!result.ok) {
    // The client's view and the server's have diverged. The log is the truth.
    void refetchAndReconcile(set, get, { countMissed: false });
    return;
  }

  const moments = detectMoments({
    delivery,
    events: result.events,
    before: matchState,
    after: result.state,
    config: matchState.config,
  });

  set({
    deliveries: [...deliveries, delivery],
    matchState: result.state,
    momentQueue: [...state.momentQueue, ...moments],
  });
  applyBattingTeamTint(get);
}

/**
 * The correctness fallback. Anything that isn't "one more ball on the end"
 * lands here: an undo, an edit, a gap in the sequence, a socket that has been
 * away long enough to have missed something.
 */
async function refetchAndReconcile(
  set: Setter,
  get: Getter,
  opts: { countMissed: boolean }
): Promise<void> {
  const { match } = get();
  if (!match) return;
  const gen = generation;
  const abort = new AbortController();

  try {
    const inningsRows = await selectMany<InningsRow>(
      `innings?match_id=eq.${match.id}&select=id,innings_no,batting_team_id,bowling_team_id,is_super_over,status,target,revised_target,revised_overs&order=innings_no.asc`,
      abort.signal
    );
    if (gen !== generation) return;
    const innings = inningsRows.map(toInnings);
    const deliveries = await fetchDeliveries(match.id, innings, abort.signal);
    if (gen !== generation) return;

    const before = get().deliveries.length;
    const matchState =
      innings.length > 0
        ? replay(match.id, match.config, deliveries, seedsFrom(innings))
        : createInitialMatchState(match.id, match.config);

    const missed = deliveries.length - before;
    set({
      innings,
      deliveries,
      matchState,
      connection: 'live',
      // A reconciliation is not a celebration: catching up on eighteen balls
      // must not fire eighteen overlays. The catch-up card says so instead.
      ...(opts.countMissed && missed > 0 ? { missedBalls: missed } : {}),
    });
    applyBattingTeamTint(get);
  } catch {
    if (gen !== generation) return;
    set({ connection: 'reconnecting' });
  }
}

/** Reloads just the match row — status, lock and result change without a ball. */
async function refetchMatchRow(set: Setter, get: Getter): Promise<void> {
  const { match } = get();
  if (!match) return;
  const gen = generation;
  try {
    const row = await selectOne<{ status: MatchStatus; is_locked: boolean }>(
      `matches?id=eq.${match.id}&select=status,is_locked`
    );
    if (gen !== generation || !row) return;
    set({ match: { ...get().match!, status: row.status, isLocked: row.is_locked } });
  } catch {
    /* the next reconcile will pick it up */
  }
}

/**
 * Brings up the Realtime socket. `@supabase/supabase-js` is imported here and
 * nowhere else on this route, so it downloads *after* the page has already
 * rendered a score — see `@/lib/publicApi`.
 */
function attachRealtime(set: Setter, get: Getter, matchId: string, gen: number): void {
  channelTeardown?.();
  channelTeardown = null;

  void (async () => {
    const { supabase } = await import('@/lib/supabase');
    if (gen !== generation) return;

    const channel = supabase
      .channel(`audience:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deliveries',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => applyIncoming(set, get, payload.new as DeliveryRow)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deliveries',
          filter: `match_id=eq.${matchId}`,
        },
        // An undo (soft delete) or an edit. Both rewrite history, so replay.
        () => void refetchAndReconcile(set, get, { countMissed: false })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'innings', filter: `match_id=eq.${matchId}` },
        () => void refetchAndReconcile(set, get, { countMissed: false })
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        () => void refetchMatchRow(set, get)
      )
      .subscribe((status) => {
        if (gen !== generation) return;
        if (status === 'SUBSCRIBED') {
          reconnectAttempt = 0;
          set({ connection: 'live' });
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          set({ connection: 'reconnecting' });
          scheduleReconnect(set, get, matchId);
        }
      });

    channelTeardown = () => {
      void supabase.removeChannel(channel);
    };
  })();
}

/** docs/06 § 3 — exponential backoff, then a full refetch on recovery. */
function scheduleReconnect(set: Setter, get: Getter, matchId: string): void {
  if (reconnectTimer) return;
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt);
  reconnectAttempt += 1;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (get().status !== 'ready') return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      set({ connection: 'offline' });
      scheduleReconnect(set, get, matchId);
      return;
    }
    if (reconnectAttempt * RECONNECT_BASE_MS > RECONNECT_MAX_MS * 2) {
      // Given up automatically; the pill becomes "tap to resume".
      set({ connection: 'paused' });
      return;
    }
    attachRealtime(set, get, matchId, generation);
    void refetchAndReconcile(set, get, { countMissed: true });
  }, delay);
}

/**
 * docs/06 § 3 — "when the tab is backgrounded for >5 min the socket closes; on
 * return the app refetches and plays a short catch-up summary card." Holding a
 * websocket open for a tab nobody is looking at is exactly the kind of thing
 * that eats a free tier's connection budget for no benefit.
 */
function attachVisibility(set: Setter, get: Getter): void {
  if (typeof document === 'undefined') return;
  visibilityTeardown?.();

  const onVisibility = () => {
    if (document.hidden) {
      if (backgroundTimer) clearTimeout(backgroundTimer);
      backgroundTimer = setTimeout(() => {
        channelTeardown?.();
        channelTeardown = null;
        set({ connection: 'paused' });
      }, BACKGROUND_CLOSE_MS);
      return;
    }

    if (backgroundTimer) clearTimeout(backgroundTimer);
    backgroundTimer = null;
    const { match, connection } = get();
    if (!match) return;
    if (connection === 'paused') {
      reconnectAttempt = 0;
      attachRealtime(set, get, match.id, generation);
      void refetchAndReconcile(set, get, { countMissed: true });
    }
  };

  document.addEventListener('visibilitychange', onVisibility);
  visibilityTeardown = () => document.removeEventListener('visibilitychange', onVisibility);
}
