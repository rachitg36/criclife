import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  __resetSyncWorkerForTests,
  discardQueuedForInnings,
  enqueueDelivery,
  retryQueuedForInnings,
  subscribeSyncEvents,
  type SyncEvent,
} from '@/lib/syncWorker';

const MATCH_ID = 'match-1';
const INNINGS_ID = 'innings-1';

let rpcImpl: (fn: string, args: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: [string, unknown]) => rpcImpl(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: () => Promise.resolve({ data: { seq: 42 }, error: null }) }),
            }),
          }),
        }),
      }),
    }),
  },
}));

/** Default happy-path mock: succeeds every item in the batch. */
function succeedAll() {
  rpcImpl = (_fn, args) => {
    const p = (args as { p: { deliveries: unknown[] } }).p;
    return Promise.resolve({
      data: {
        ok: true,
        results: p.deliveries.map((_, i) => ({ ok: true, delivery: { id: `srv-${i}`, seq: i + 1 } })),
      },
      error: null,
    });
  };
}

/** Never resolves — for asserting Dexie state written *before* any drain
    could possibly settle it, without racing the mock's own timing. */
function hang() {
  rpcImpl = () => new Promise(() => {});
}

function payload(runsOffBat: number) {
  return {
    clientDeliveryId: crypto.randomUUID(),
    runsOffBat,
    extraType: null,
    extraRuns: 0,
    isBoundary: false,
    wicket: null,
    strikerId: 's1',
    nonStrikerId: 'ns1',
    bowlerId: 'b1',
  };
}

function collectEvents(): { events: SyncEvent[]; unsubscribe: () => void } {
  const events: SyncEvent[] = [];
  const unsubscribe = subscribeSyncEvents(MATCH_ID, (e) => events.push(e));
  return { events, unsubscribe };
}

describe('syncWorker — the offline drain path (docs/09 § 5, docs/10 § 3.2)', () => {
  beforeEach(async () => {
    await db.pendingDeliveries.clear();
    succeedAll();
  });

  afterEach(async () => {
    // Belt and suspenders: whatever a test left behind, both the DB and
    // the module's own in-memory maps/timers start the next test clean.
    await db.pendingDeliveries.clear();
    __resetSyncWorkerForTests();
  });

  it('writes a queued row anchored to the given synced seq', async () => {
    hang(); // freeze it before the drain can touch its status
    const p = payload(1);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p.clientDeliveryId, p, 7);

    const row = await db.pendingDeliveries.get(p.clientDeliveryId);
    expect(row).toMatchObject({ expectedSeq: 7, matchId: MATCH_ID, inningsId: INNINGS_ID });
  });

  it("reuses the first queued item's expectedSeq for the rest of the same streak", async () => {
    hang(); // nothing should drain between these two enqueues
    const p1 = payload(1);
    const p2 = payload(2);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p1.clientDeliveryId, p1, 7);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p2.clientDeliveryId, p2, 999); // stale local guess, ignored

    const row2 = await db.pendingDeliveries.get(p2.clientDeliveryId);
    expect(row2?.expectedSeq).toBe(7);
  });

  it('drains a queued ball to record_deliveries_batch and marks it synced', async () => {
    const { events, unsubscribe } = collectEvents();
    const p = payload(4);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p.clientDeliveryId, p, 7);

    await vi.waitFor(async () => {
      const row = await db.pendingDeliveries.get(p.clientDeliveryId);
      expect(row?.status).toBe('synced');
    });
    expect(events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'synced', clientDeliveryId: p.clientDeliveryId })])
    );
    unsubscribe();
  });

  it('STALE_SEQ leaves the item queued and emits a conflict', async () => {
    rpcImpl = () => Promise.resolve({ data: null, error: { message: 'STALE_SEQ: expected 7 but server has 9' } });
    const { events, unsubscribe } = collectEvents();
    const p = payload(1);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p.clientDeliveryId, p, 7);

    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'conflict')).toBe(true);
    });
    const row = await db.pendingDeliveries.get(p.clientDeliveryId);
    expect(row?.status).toBe('queued'); // never marked synced/error — merge screen decides
    unsubscribe();
  });

  it('NO_GRANT moves the ball to rejected (Review Tray), not silently dropped', async () => {
    rpcImpl = () =>
      Promise.resolve({ data: null, error: { message: 'NO_GRANT: you do not hold an active scoring grant' } });
    const { events, unsubscribe } = collectEvents();
    const p = payload(1);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p.clientDeliveryId, p, 7);

    await vi.waitFor(async () => {
      const row = await db.pendingDeliveries.get(p.clientDeliveryId);
      expect(row?.status).toBe('rejected');
    });
    expect(events.some((e) => e.type === 'rejected')).toBe(true);
    unsubscribe();
  });

  it('an item-level rule violation (e.g. ILLEGAL_DISMISSAL) is treated as a conflict, not silently retried', async () => {
    rpcImpl = () =>
      Promise.resolve({
        data: {
          ok: true,
          results: [{ ok: false, error: { code: 'ILLEGAL_DISMISSAL', message: 'ILLEGAL_DISMISSAL: nope' } }],
        },
        error: null,
      });
    const { events, unsubscribe } = collectEvents();
    const p = payload(0);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p.clientDeliveryId, p, 7);

    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'conflict')).toBe(true);
    });
    unsubscribe();
  });

  it('discardQueuedForInnings clears every queued ball for that innings ("Keep theirs")', async () => {
    hang();
    const p1 = payload(1);
    const p2 = payload(2);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p1.clientDeliveryId, p1, 7);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p2.clientDeliveryId, p2, 7);

    await discardQueuedForInnings(MATCH_ID, INNINGS_ID);

    expect(await db.pendingDeliveries.get(p1.clientDeliveryId)).toBeUndefined();
    expect(await db.pendingDeliveries.get(p2.clientDeliveryId)).toBeUndefined();
  });

  it('retryQueuedForInnings re-anchors expectedSeq to the current server seq ("Keep both")', async () => {
    hang();
    const p = payload(1);
    await enqueueDelivery(MATCH_ID, INNINGS_ID, p.clientDeliveryId, p, 7);

    // Let the drain kicked off by enqueueDelivery reach its one-time
    // 'syncing' mark (it then hangs forever on the RPC, per `hang()`) before
    // resolving — otherwise that mark can land *after* this call's own
    // write and clobber it back to 'syncing'. In real usage this ordering
    // can't happen: a drain that hits a conflict has already fully exited
    // (STALE_SEQ's handling returns definitively) before the merge screen
    // ever appears, so there's never a still-in-flight drain to race here.
    await vi.waitFor(async () => {
      const row = await db.pendingDeliveries.get(p.clientDeliveryId);
      expect(row?.status).toBe('syncing');
    });

    await retryQueuedForInnings(MATCH_ID, INNINGS_ID);

    const row = await db.pendingDeliveries.get(p.clientDeliveryId);
    expect(row?.expectedSeq).toBe(42); // from the mocked `.maybeSingle()` above
    expect(row?.status).toBe('queued');
  });
});
