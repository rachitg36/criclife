import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db, discardStuckDeliveries, lastQueueError } from '@/lib/db';
import type { QueuedDeliveryPayload } from '@/lib/db';

/**
 * The ordering bug that cost a ball on every innings.
 *
 * `handleInningsComplete` fired as soon as the *client engine* decided the
 * innings was over and called `end_innings` straight away — while the ball
 * that ended it was still in the outbox, because scoring never awaits the
 * network. The RPC that closes the innings routinely beat the upload of the
 * very delivery that closed it, and the server then refused that ball forever:
 *
 *     INNINGS_COMPLETE: this innings has already ended
 *
 * Reported 2026-08-04 with exactly one ball stuck, and it explains a cluster
 * of separate-looking complaints: the winning wide missing from the audience
 * view, the last ball missing from the scorecard, the run-rate chart drawn
 * against a short over. All one absent row.
 *
 * These cover the two durable pieces the recovery leans on.
 */
const payload = {
  clientDeliveryId: 'c1',
  runsOffBat: 0,
  extraType: 'wide',
  extraRuns: 0,
  isBoundary: false,
  wicket: null,
  strikerId: 'p1',
  nonStrikerId: 'p2',
  bowlerId: 'b1',
} as unknown as QueuedDeliveryPayload;

async function seed(over: Partial<Record<string, unknown>> = {}) {
  await db.pendingDeliveries.add({
    clientDeliveryId: 'c1',
    matchId: 'm1',
    inningsId: 'i1',
    payload,
    expectedSeq: 5,
    createdAt: 1000,
    status: 'error',
    attempts: 3,
    lastError: 'INNINGS_COMPLETE: this innings has already ended',
    ...over,
  });
}

describe('the stranded-ball recovery', () => {
  beforeEach(async () => {
    await db.pendingDeliveries.clear();
    vi.restoreAllMocks();
  });

  it('keeps the reason readable after a reload', async () => {
    await seed();
    // The in-memory message dies with the tab; this is the copy that does not.
    expect(await lastQueueError('m1')).toContain('INNINGS_COMPLETE');
  });

  it('reports the newest failure, not the first one', async () => {
    await seed();
    await db.pendingDeliveries.add({
      clientDeliveryId: 'c2',
      matchId: 'm1',
      inningsId: 'i1',
      payload,
      expectedSeq: 6,
      createdAt: 2000,
      status: 'error',
      attempts: 1,
      lastError: 'MATCH_LOCKED: this match is locked',
    });
    // A stale failure showing over a current one sends the scorer after the
    // wrong problem.
    expect(await lastQueueError('m1')).toContain('MATCH_LOCKED');
  });

  it('discards only balls that have actually failed', async () => {
    await seed();
    await db.pendingDeliveries.add({
      clientDeliveryId: 'c-queued',
      matchId: 'm1',
      inningsId: 'i1',
      payload,
      expectedSeq: 6,
      createdAt: 3000,
      status: 'queued',
      attempts: 0,
    });

    const dropped = await discardStuckDeliveries('m1');

    expect(dropped).toBe(1);
    // A ball that has not failed yet is not this button's to throw away.
    const left = await db.pendingDeliveries.where('matchId').equals('m1').toArray();
    expect(left.map((r) => r.clientDeliveryId)).toEqual(['c-queued']);
  });

  it('never touches another match', async () => {
    await seed();
    await db.pendingDeliveries.add({
      clientDeliveryId: 'other',
      matchId: 'm2',
      inningsId: 'i9',
      payload,
      expectedSeq: 0,
      createdAt: 1500,
      status: 'error',
      attempts: 1,
      lastError: 'boom',
    });

    await discardStuckDeliveries('m1');

    expect(await db.pendingDeliveries.where('matchId').equals('m2').count()).toBe(1);
  });

  it('returns null when there is nothing wrong', async () => {
    expect(await lastQueueError('m1')).toBeNull();
  });
});
