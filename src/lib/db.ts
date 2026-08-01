import Dexie, { type EntityTable } from 'dexie';

/**
 * Offline store. A scorer must be able to record an entire match with no
 * network, so every delivery is written HERE FIRST, then optimistically to
 * the in-memory match store, then queued for the server.
 *
 * docs/09-ARCHITECTURE.md § 5
 */

export type SyncStatus = 'queued' | 'syncing' | 'synced' | 'rejected' | 'error';

export type PendingDelivery = {
  /** Client-generated idempotency key — makes replays safe. */
  clientDeliveryId: string;
  matchId: string;
  inningsId: string;
  /** Full DeliveryInput payload; typed properly once the engine lands. */
  payload: Record<string, unknown>;
  createdAt: number;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  /** Set once the server assigns the authoritative sequence number. */
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

export { db };

/** How many balls are waiting to reach the server. Drives the sync pill. */
export async function pendingCount(matchId?: string): Promise<number> {
  const base = db.pendingDeliveries.where('status').anyOf('queued', 'syncing', 'error');
  if (!matchId) return base.count();
  return base.filter((d) => d.matchId === matchId).count();
}

/** Balls the server refused (e.g. scoring rights revoked while offline). */
export async function rejectedDeliveries(matchId: string): Promise<PendingDelivery[]> {
  return db.pendingDeliveries
    .where('status')
    .equals('rejected')
    .and((d) => d.matchId === matchId)
    .toArray();
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
