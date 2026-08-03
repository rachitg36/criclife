import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestMatch, currentInnings } from '../../engine/helpers';
import { useScorerStore } from '@/features/scoring/store';
import { db, pendingCount } from '@/lib/db';
import { __resetSyncWorkerForTests } from '@/lib/syncWorker';

// Several tests fire-and-forget a `recordRun`/`recordWicket` call to assert
// the synchronous optimistic-apply guarantee. Its background Dexie write +
// sync-worker drain (including a real backoff `setTimeout` retry on a
// transient error) still runs after the test body returns; without this, it
// can straggle into the next test (which clears Dexie mid-flight) or past
// the file's own teardown, producing flaky, unrelated failures.
afterEach(async () => {
  await vi.waitFor(
    async () => {
      expect(await pendingCount('test-match')).toBe(0);
    },
    { timeout: 4000 }
  );
  __resetSyncWorkerForTests();
});

let nextServerSeq = 1;

const rpcMock = vi.fn().mockImplementation((fn: string, args: unknown) => {
  if (fn === 'record_deliveries_batch') {
    const p = (args as { p: { deliveries: unknown[] } }).p;
    const results = p.deliveries.map(() => ({
      ok: true,
      delivery: { id: `srv-${nextServerSeq}`, seq: nextServerSeq++ },
    }));
    return Promise.resolve({ data: { ok: true, results }, error: null });
  }
  return Promise.resolve({ data: { ok: true, delivery: { id: 'd1' } }, error: null });
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}));

vi.mock('@/lib/haptics', () => ({ haptic: () => {} }));

function seedReadyMatch() {
  const matchState = createTestMatch();
  useScorerStore.setState({
    matchId: 'test-match',
    config: matchState.config,
    matchState,
    deliveries: [],
    deliveryIds: [],
    inningsIdByNo: { 1: 'innings-1' },
    syncedSeq: { 'innings-1': 0 },
    mode: 'READY',
    armedModifier: null,
    error: null,
    revoked: false,
    lastTap: null,
    duplicateWarning: false,
    conflict: null,
    hasSyncError: false,
  });
}

describe('useScorerStore — the one-tap path (docs/05 § 2, CLAUDE.md rule 4)', () => {
  beforeEach(async () => {
    rpcMock.mockClear();
    await db.pendingDeliveries.clear();
    seedReadyMatch();
  });

  it('applies a run optimistically before the network call resolves', async () => {
    // Captured but not awaited yet — this is the guarantee under test: the
    // pad must reflect the new score synchronously, without waiting on
    // Supabase. It's awaited at the end of the test purely so the
    // background Dexie/sync work doesn't leak into the next test.
    const committed = useScorerStore.getState().recordRun(1);

    const innings = currentInnings(useScorerStore.getState().matchState!);
    expect(innings.runs).toBe(1);
    expect(innings.batters.s1?.balls).toBe(1);

    await committed;
    await vi.waitFor(async () => {
      expect(await db.pendingDeliveries.toArray()).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: 'synced' })])
      );
    });
  });

  it('writes the ball to Dexie first, then drains it to record_deliveries_batch in the background', async () => {
    await useScorerStore.getState().recordRun(4);

    await vi.waitFor(() => {
      const batchCalls = rpcMock.mock.calls.filter(([fn]) => fn === 'record_deliveries_batch');
      expect(batchCalls.length).toBeGreaterThan(0);
      const lastCall = batchCalls[batchCalls.length - 1]![1] as { p: { deliveries: { runsOffBat: number }[] } };
      const lastItem = lastCall.p.deliveries[lastCall.p.deliveries.length - 1];
      expect(lastItem).toMatchObject({ runsOffBat: 4, isBoundary: true });
    });
    await vi.waitFor(async () => {
      expect(await db.pendingDeliveries.toArray()).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: 'synced' })])
      );
    });
  });

  it('routes runs through the armed modifier instead of the bat', async () => {
    useScorerStore.getState().armModifier('wide');
    await useScorerStore.getState().recordRun(2);

    const innings = currentInnings(useScorerStore.getState().matchState!);
    // 1 auto wide run (DEFAULT_CONFIG.wideRuns) + 2 armed extra runs, 0 off the bat.
    expect(innings.extras.wides).toBe(3);
    expect(innings.batters.s1?.balls).toBe(0);
    // The modifier auto-clears after the ball (docs/05 § 2).
    expect(useScorerStore.getState().armedModifier).toBeNull();
  });
});

describe('useScorerStore — the accidental-tap guard (docs/05 § 4)', () => {
  beforeEach(async () => {
    rpcMock.mockClear();
    await db.pendingDeliveries.clear();
    seedReadyMatch();
  });

  it('swallows an identical second tap inside 250ms as one ball', () => {
    void useScorerStore.getState().recordRun(1);
    void useScorerStore.getState().recordRun(1); // same button, same instant

    const innings = currentInnings(useScorerStore.getState().matchState!);
    expect(innings.runs).toBe(1);
    expect(innings.legalBalls).toBe(1);
  });

  it('does not swallow two different buttons tapped back to back', () => {
    void useScorerStore.getState().recordRun(1);
    void useScorerStore.getState().recordRun(4);

    const innings = currentInnings(useScorerStore.getState().matchState!);
    expect(innings.runs).toBe(5);
    expect(innings.legalBalls).toBe(2);
  });

  it('commits a 250–600ms repeat of the same button but raises duplicateWarning', () => {
    vi.useFakeTimers();
    try {
      void useScorerStore.getState().recordRun(1);
      vi.advanceTimersByTime(300);
      void useScorerStore.getState().recordRun(1);

      const innings = currentInnings(useScorerStore.getState().matchState!);
      expect(innings.legalBalls).toBe(2); // both committed — not swallowed
      expect(innings.runs).toBe(2);
      expect(useScorerStore.getState().duplicateWarning).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not raise duplicateWarning once the gap is comfortably past 600ms', () => {
    vi.useFakeTimers();
    try {
      void useScorerStore.getState().recordRun(1);
      vi.advanceTimersByTime(1000);
      void useScorerStore.getState().recordRun(1);

      expect(useScorerStore.getState().duplicateWarning).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useScorerStore — wicket sheet mode transitions (no network involved)', () => {
  beforeEach(async () => {
    rpcMock.mockClear();
    await db.pendingDeliveries.clear();
    seedReadyMatch();
  });

  it('opens only from READY and restores the prior mode on cancel', () => {
    const { openWicketSheet, closeWicketSheet } = useScorerStore.getState();

    openWicketSheet();
    expect(useScorerStore.getState().mode).toBe('WICKET_SHEET');

    closeWicketSheet();
    expect(useScorerStore.getState().mode).toBe('READY');
  });

  it('is a no-op outside READY (e.g. mid AWAITING_BOWLER)', () => {
    useScorerStore.setState({ mode: 'AWAITING_BOWLER' });
    useScorerStore.getState().openWicketSheet();
    expect(useScorerStore.getState().mode).toBe('AWAITING_BOWLER');
  });
});

describe('useScorerStore — recording a wicket', () => {
  beforeEach(async () => {
    rpcMock.mockClear();
    await db.pendingDeliveries.clear();
    seedReadyMatch();
  });

  it('increments wickets and moves to AWAITING_BATTER', () => {
    void useScorerStore.getState().recordWicket({ type: 'bowled', dismissedPlayerId: 's1' });

    const innings = currentInnings(useScorerStore.getState().matchState!);
    expect(innings.wickets).toBe(1);
    expect(useScorerStore.getState().mode).toBe('AWAITING_BATTER');
  });
});
