import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';
import {
  db,
  inningsIdsWithPending,
  queuedForInnings,
  unresolvedForInnings,
  type PendingDelivery,
  type QueuedDeliveryPayload,
} from '@/lib/db';

/**
 * Drains `db.pendingDeliveries` against `record_deliveries_batch` whenever
 * online. docs/09-ARCHITECTURE.md § 5, docs/05-SCORER-VIEW.md § 6.
 *
 * This module never touches Zustand directly — `store.ts` subscribes via
 * `subscribeSyncEvents` instead, so the sync engine stays testable (and
 * reusable) without a React/Zustand dependency.
 */

export type SyncEvent =
  | { type: 'synced'; clientDeliveryId: string; serverDeliveryId: string; serverSeq: number }
  | { type: 'duplicate'; clientDeliveryId: string; serverDeliveryId: string; serverSeq: number }
  | { type: 'rejected'; clientDeliveryId: string; message: string }
  /** A hard, unresolvable-by-retry error (MATCH_LOCKED, INNINGS_COMPLETE, or
      a genuine server exception) surfaced for the error banner/sync pill —
      distinct from `conflict`, which needs the merge screen. */
  | { type: 'error'; clientDeliveryId: string | null; message: string }
  /** STALE_SEQ, or a business-rule violation (e.g. ILLEGAL_DISMISSAL) that
      only makes sense if someone else scored differently while this device
      was offline. Needs a human decision — see the merge screen. */
  | { type: 'conflict'; inningsId: string; pending: PendingDelivery[] }
  | { type: 'drainStart' }
  | { type: 'drainEnd' };

type Listener = (e: SyncEvent) => void;
const listeners = new Map<string, Set<Listener>>();

function emit(matchId: string, event: SyncEvent) {
  listeners.get(matchId)?.forEach((fn) => fn(event));
}

export function subscribeSyncEvents(matchId: string, handler: Listener): () => void {
  if (!listeners.has(matchId)) listeners.set(matchId, new Set());
  listeners.get(matchId)!.add(handler);
  return () => listeners.get(matchId)?.delete(handler);
}

const draining = new Set<string>();
const backoffMs = new Map<string, number>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const periodicTimers = new Map<string, ReturnType<typeof setInterval>>();
let onlineListenerAttached = false;
const attachedMatches = new Set<string>();

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const BATCH_SIZE = 50;
const DRAIN_INTERVAL_MS = 5000;

/** Test-only: cancels every pending retry/periodic timer and clears all
    module-level state. Without this, a real backoff `setTimeout` scheduled
    by one test file can fire after that file's mocks are torn down and
    crash as an unhandled rejection in whichever file happens to be running
    when it goes off. Not used by production code — the app never "resets"
    the sync worker, it just keeps running for the life of the tab. */
export function __resetSyncWorkerForTests(): void {
  for (const t of retryTimers.values()) clearTimeout(t);
  for (const t of periodicTimers.values()) clearInterval(t);
  retryTimers.clear();
  periodicTimers.clear();
  backoffMs.clear();
  draining.clear();
  attachedMatches.clear();
  listeners.clear();
  onlineListenerAttached = false;
}

/** Call once per scoring session (from the store's `init`). Idempotent per
    match — safe to call again on remount. */
export function attachSyncWorker(matchId: string): () => void {
  if (!onlineListenerAttached && typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      for (const id of attachedMatches) kickSync(id);
    });
    onlineListenerAttached = true;
  }
  attachedMatches.add(matchId);
  if (!periodicTimers.has(matchId)) {
    periodicTimers.set(
      matchId,
      setInterval(() => kickSync(matchId), DRAIN_INTERVAL_MS)
    );
  }
  kickSync(matchId); // catch up on anything left queued from a previous session

  return () => {
    attachedMatches.delete(matchId);
    const t = periodicTimers.get(matchId);
    if (t) clearInterval(t);
    periodicTimers.delete(matchId);
  };
}

export function kickSync(matchId: string): void {
  // A drain is fire-and-forget by design (docs/05 § 6.1 — never awaited by
  // the caller), so any failure here — including one this module didn't
  // anticipate — must not become an unhandled rejection. Leaving the
  // affected rows queued and retrying on the next tick/online event is
  // always safe; losing track of the failure mode entirely is not.
  drainMatch(matchId).catch((err: unknown) => {
    draining.delete(matchId);
    emit(matchId, {
      type: 'error',
      clientDeliveryId: null,
      message: err instanceof Error ? err.message : 'Sync failed unexpectedly',
    });
  });
}

/** Writes the ball durably, then kicks a drain attempt. Never awaited by
    the caller's optimistic UI update — docs/05 § 6.1. */
export async function enqueueDelivery(
  matchId: string,
  inningsId: string,
  clientDeliveryId: string,
  payload: QueuedDeliveryPayload,
  syncedSeq: number
): Promise<void> {
  const existingStreak = await unresolvedForInnings(matchId, inningsId);
  const expectedSeq = existingStreak[0]?.expectedSeq ?? syncedSeq;

  await db.pendingDeliveries.add({
    clientDeliveryId,
    matchId,
    inningsId,
    payload,
    expectedSeq,
    createdAt: Date.now(),
    status: 'queued',
    attempts: 0,
  });
  kickSync(matchId);
}

function parseCode(message: string): string {
  const idx = message.indexOf(':');
  return idx === -1 ? 'ERROR' : message.slice(0, idx);
}

async function drainMatch(matchId: string): Promise<void> {
  if (draining.has(matchId)) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  draining.add(matchId);
  emit(matchId, { type: 'drainStart' });
  try {
    const inningsIds = await inningsIdsWithPending(matchId);
    for (const inningsId of inningsIds) {
      await drainInnings(matchId, inningsId);
    }
    backoffMs.delete(matchId); // a fully clean pass resets backoff
  } finally {
    draining.delete(matchId);
    emit(matchId, { type: 'drainEnd' });
  }
}

async function drainInnings(matchId: string, inningsId: string): Promise<void> {
  const items = await queuedForInnings(matchId, inningsId);
  if (items.length === 0) return;
  const batch = items.slice(0, BATCH_SIZE);

  await Promise.all(
    batch.map((item) => db.pendingDeliveries.update(item.clientDeliveryId, { status: 'syncing' }))
  );

  const { data, error } = await supabase.rpc('record_deliveries_batch', {
    p: {
      inningsId,
      expectedSeq: batch[0]!.expectedSeq,
      deliveries: batch.map((b) => ({ ...b.payload, clientDeliveryId: b.clientDeliveryId })),
    } as unknown as Json,
  });

  if (error) {
    await handleBatchLevelError(matchId, batch, error.message);
    return;
  }

  const response = data as {
    results: Array<{
      ok: boolean;
      duplicate?: boolean;
      delivery?: { id: string; seq: number };
      error?: { code: string; message: string };
    }>;
  };

  for (let i = 0; i < response.results.length; i++) {
    const item = batch[i];
    const result = response.results[i];
    if (!item || !result) continue;

    if (result.ok && result.delivery) {
      await db.pendingDeliveries.update(item.clientDeliveryId, {
        status: 'synced',
        serverDeliveryId: result.delivery.id,
        serverSeq: result.delivery.seq,
      });
      emit(matchId, {
        type: result.duplicate ? 'duplicate' : 'synced',
        clientDeliveryId: item.clientDeliveryId,
        serverDeliveryId: result.delivery.id,
        serverSeq: result.delivery.seq,
      });
    } else if (result.error) {
      await handleItemError(matchId, item, result.error.code, result.error.message);
    }
  }

  // "Stops at first hard error" (docs/10 § 3.2) means `results` can be
  // shorter than `batch` — items past it were never attempted. Left as
  // 'syncing' they'd be stuck forever; put them back in the queue so the
  // next drain picks them up.
  if (response.results.length < batch.length) {
    await Promise.all(
      batch
        .slice(response.results.length)
        .map((item) => db.pendingDeliveries.update(item.clientDeliveryId, { status: 'queued' }))
    );
  }

  // The batch was capped — if there's more, keep draining this innings now
  // rather than waiting for the next periodic tick.
  if (items.length > batch.length) await drainInnings(matchId, inningsId);
}

async function handleBatchLevelError(
  matchId: string,
  batch: PendingDelivery[],
  message: string
): Promise<void> {
  const code = parseCode(message);
  const inningsId = batch[0]!.inningsId;

  if (code === 'STALE_SEQ') {
    // Revert the 'syncing' mark this same drain attempt just set — the
    // merge screen decides what actually happens to these items next
    // (docs/05 § 6.6), but they need to land back in 'queued' so
    // `discardQueuedForInnings`/`retryQueuedForInnings` (both of which,
    // like the drain itself, only look at unresolved rows) can find them.
    await Promise.all(
      batch.map((item) => db.pendingDeliveries.update(item.clientDeliveryId, { status: 'queued' }))
    );
    emit(matchId, { type: 'conflict', inningsId, pending: batch });
    return;
  }

  if (code === 'NO_GRANT') {
    await Promise.all(
      batch.map((item) =>
        db.pendingDeliveries.update(item.clientDeliveryId, {
          status: 'rejected',
          lastError: message,
        })
      )
    );
    for (const item of batch)
      emit(matchId, { type: 'rejected', clientDeliveryId: item.clientDeliveryId, message });
    return;
  }

  // MATCH_LOCKED, INNINGS_COMPLETE, NOT_FOUND, or a genuine network/5xx
  // failure — not resolvable by just retrying blindly, but also not the
  // scorer's fault to lose the ball over. Stays queued, surfaced as an error.
  await Promise.all(
    batch.map((item) =>
      db.pendingDeliveries.update(item.clientDeliveryId, {
        status: 'error',
        attempts: item.attempts + 1,
        lastError: message,
      })
    )
  );
  emit(matchId, { type: 'error', clientDeliveryId: null, message });
  scheduleRetry(matchId);
}

async function handleItemError(
  matchId: string,
  item: PendingDelivery,
  code: string,
  message: string
): Promise<void> {
  if (code === 'NO_GRANT') {
    await db.pendingDeliveries.update(item.clientDeliveryId, {
      status: 'rejected',
      lastError: message,
    });
    emit(matchId, { type: 'rejected', clientDeliveryId: item.clientDeliveryId, message });
    return;
  }

  if (
    code === 'ILLEGAL_DISMISSAL' ||
    code === 'CONSECUTIVE_OVER' ||
    code === 'BOWLER_LIMIT' ||
    code === 'INNINGS_COMPLETE'
  ) {
    // This device's own offline sequence disagrees with what the server now
    // considers legal — almost always because a co-scorer's balls landed in
    // between. Only a human can decide what to do with it. Revert the
    // 'syncing' mark this drain attempt just set so the merge-resolution
    // helpers (which only look at unresolved rows) can find it.
    await db.pendingDeliveries.update(item.clientDeliveryId, { status: 'queued' });
    emit(matchId, { type: 'conflict', inningsId: item.inningsId, pending: [item] });
    return;
  }

  await db.pendingDeliveries.update(item.clientDeliveryId, {
    status: 'error',
    attempts: item.attempts + 1,
    lastError: message,
  });
  emit(matchId, { type: 'error', clientDeliveryId: item.clientDeliveryId, message });
  scheduleRetry(matchId);
}

function scheduleRetry(matchId: string): void {
  if (retryTimers.has(matchId)) return;
  const delay = backoffMs.get(matchId) ?? BASE_BACKOFF_MS;
  const timer = setTimeout(() => {
    retryTimers.delete(matchId);
    backoffMs.set(matchId, Math.min(delay * 2, MAX_BACKOFF_MS));
    kickSync(matchId);
  }, delay);
  retryTimers.set(matchId, timer);
}

/** Merge resolution: drop this device's queued balls for the innings and
    let the caller resync from server truth (docs/05 § 6.6 "Keep theirs"). */
export async function discardQueuedForInnings(matchId: string, inningsId: string): Promise<void> {
  const items = await unresolvedForInnings(matchId, inningsId);
  await db.pendingDeliveries.bulkDelete(items.map((i) => i.clientDeliveryId));
}

/** Merge resolution: re-anchor this device's queued balls to the current
    server seq and retry — they land as new balls appended after whatever
    the other scorer wrote (docs/05 § 6.6 "Keep both"). True "Keep mine"
    (discarding the other scorer's already-committed ball) is not offered:
    it would mean silently overwriting another scorer's confirmed work, and
    is left to the "undo back and re-enter" pattern the rest of the app
    already relies on for corrections. */
export async function retryQueuedForInnings(matchId: string, inningsId: string): Promise<void> {
  const { data } = await supabase
    .from('deliveries')
    .select('seq')
    .eq('innings_id', inningsId)
    .eq('is_deleted', false)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const freshSeq = data?.seq ?? 0;

  const items = await unresolvedForInnings(matchId, inningsId);
  await Promise.all(
    items.map((item) =>
      db.pendingDeliveries.update(item.clientDeliveryId, {
        expectedSeq: freshSeq,
        status: 'queued',
      })
    )
  );
  kickSync(matchId);
}
