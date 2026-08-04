import Dexie, { type EntityTable } from 'dexie';
import type { DeliveryInput, PlayerId } from '@/engine/types';

/**
 * Offline store. A scorer must be able to record an entire match with no
 * network, so every delivery is written HERE FIRST, then optimistically to
 * the in-memory match store, then queued for the server.
 *
 * docs/09-ARCHITECTURE.md § 5
 */

export type SyncStatus = 'queued' | 'syncing' | 'synced' | 'rejected' | 'error';

/** Everything `record_deliveries_batch` needs for one item, beyond the
    innings-level `inningsId`/`expectedSeq` the batch call carries once. */
export type QueuedDeliveryPayload = DeliveryInput & {
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
  bowlerId: PlayerId;
};

export type PendingDelivery = {
  /** Client-generated idempotency key — makes replays safe. */
  clientDeliveryId: string;
  matchId: string;
  inningsId: string;
  payload: QueuedDeliveryPayload;
  /** The last server seq known for this innings when this ball was applied.
      Shared by every ball queued in the same unbroken offline streak for
      this innings — nothing else can have written in between, so they all
      have the same "seq before me". See the batch RPC's own header comment
      for why only the group's first item's value is ever actually checked. */
  expectedSeq: number;
  createdAt: number;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  /** Set once the server confirms the row and assigns its real id/seq. */
  serverDeliveryId?: string;
  serverSeq?: number;
};

export type CachedRow = {
  id: string;
  data: Record<string, unknown>;
  updatedAt: number;
};

export type CachedDelivery = {
  id: string;
  matchId: string;
  seq: number;
  data: Record<string, unknown>;
};

const db = new Dexie('criclife') as Dexie & {
  pendingDeliveries: EntityTable<PendingDelivery, 'clientDeliveryId'>;
  cachedMatches: EntityTable<CachedRow, 'id'>;
  cachedDeliveries: EntityTable<CachedDelivery, 'id'>;
  cachedPlayers: EntityTable<CachedRow, 'id'>;
  cachedTeams: EntityTable<CachedRow, 'id'>;
};

db.version(1).stores({
  pendingDeliveries: 'clientDeliveryId, matchId, createdAt, status',
  cachedMatches: 'id, updatedAt',
  cachedDeliveries: 'id, matchId, seq, [matchId+seq]',
  cachedPlayers: 'id',
  cachedTeams: 'id',
});

// v2 — Phase 6 wires this schema into the real write path. Adds the
// [matchId+inningsId] index the sync worker groups its drain queries by,
// and [matchId+status] for the sync-pill/Review-Tray counts. Dexie carries
// existing rows forward untouched; nothing here needs a data migration.
db.version(2).stores({
  pendingDeliveries:
    'clientDeliveryId, matchId, createdAt, status, [matchId+inningsId], [matchId+status]',
});

export { db };

/** How many balls are waiting to reach the server. Drives the sync pill. */
export async function pendingCount(matchId?: string): Promise<number> {
  const base = db.pendingDeliveries.where('status').anyOf('queued', 'syncing', 'error');
  if (!matchId) return base.count();
  return base.filter((d) => d.matchId === matchId).count();
}

/** Queued balls that have failed at least once, for the sync pill's `error` state. */
export async function erroredCount(matchId: string): Promise<number> {
  return db.pendingDeliveries.where('[matchId+status]').equals([matchId, 'error']).count();
}

/**
 * The most recent `lastError` still sitting in this match's outbox.
 *
 * `syncErrorMessage` in the store is in memory, so a reload — or an installed
 * PWA being backgrounded long enough to be killed — loses the one sentence
 * explaining why balls stopped going up. The queue has held it durably all
 * along; nothing read it. For a scorer at a ground trying to tell someone what
 * is wrong, surviving a reload is most of the value.
 */
export async function lastQueueError(matchId: string): Promise<string | null> {
  const rows = await db.pendingDeliveries.where('matchId').equals(matchId).toArray();
  const withError = rows.filter((r) => r.lastError);
  if (withError.length === 0) return null;
  // Newest first: an old failure that has since been superseded is noise.
  withError.sort((a, b) => b.createdAt - a.createdAt);
  return withError[0]!.lastError ?? null;
}

/** Balls the server refused (e.g. scoring rights revoked while offline). */
export async function rejectedDeliveries(matchId: string): Promise<PendingDelivery[]> {
  return db.pendingDeliveries.where('[matchId+status]').equals([matchId, 'rejected']).toArray();
}

/** Queued/erroring balls for one innings, oldest first — what the sync
    worker actually drains. */
export async function queuedForInnings(
  matchId: string,
  inningsId: string
): Promise<PendingDelivery[]> {
  const rows = await db.pendingDeliveries
    .where('[matchId+inningsId]')
    .equals([matchId, inningsId])
    .and((d) => d.status === 'queued' || d.status === 'error')
    .toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** Everything not yet resolved (synced or rejected) for one innings,
    including rows a drain attempt currently has marked 'syncing' — used to
    decide whether a new ball is starting a fresh streak or joining one
    already in flight. `queuedForInnings` deliberately excludes 'syncing'
    (it's "what to drain next"); this is "is anything still unresolved". */
export async function unresolvedForInnings(
  matchId: string,
  inningsId: string
): Promise<PendingDelivery[]> {
  const rows = await db.pendingDeliveries
    .where('[matchId+inningsId]')
    .equals([matchId, inningsId])
    .and((d) => d.status === 'queued' || d.status === 'error' || d.status === 'syncing')
    .toArray();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** Every distinct innings with something still queued for this match, in
    the order they should be drained (oldest first). */
export async function inningsIdsWithPending(matchId: string): Promise<string[]> {
  const rows = await db.pendingDeliveries
    .where('matchId')
    .equals(matchId)
    .and((d) => d.status === 'queued' || d.status === 'error')
    .toArray();
  const firstSeenAt = new Map<string, number>();
  for (const r of rows) {
    if (!firstSeenAt.has(r.inningsId)) firstSeenAt.set(r.inningsId, r.createdAt);
  }
  return [...firstSeenAt.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/**
 * Attach a wagon-wheel coordinate to a ball that has already been committed.
 *
 * Advanced Mode (docs/05 § 8) captures the shot *after* the ball is recorded —
 * the pad must never make a scorer wait, so the score moves on the tap and the
 * overlay is an afterthought that can be ignored. That leaves two cases:
 *
 * - the ball is still in the outbox → patch the payload in place, and the
 *   coordinates ride along on the same `record_deliveries_batch` call. No
 *   extra request, and it works with no signal at all, which is the case that
 *   matters at a village ground.
 * - the ball has already synced → return false, and let the caller decide.
 *
 * `status === 'syncing'` counts as gone: the RPC may already be in flight with
 * the old payload, and patching it would silently do nothing.
 */
export async function attachShotToPending(
  clientDeliveryId: string,
  shot: { x: number; y: number }
): Promise<boolean> {
  const row = await db.pendingDeliveries.get(clientDeliveryId);
  if (!row || row.status !== 'queued') return false;
  await db.pendingDeliveries.update(clientDeliveryId, {
    payload: { ...row.payload, shot },
  });
  return true;
}

/** Housekeeping: drop synced rows older than 24h. Never touches unsynced work. */
export async function pruneSynced(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  return db.pendingDeliveries
    .where('status')
    .equals('synced')
    .and((d) => d.createdAt < cutoff)
    .delete();
}
