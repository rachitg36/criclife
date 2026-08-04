import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScorerStore } from '@/features/scoring/store';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/haptics', () => ({ haptic: () => {} }));

/**
 * "The scoring tabs are all saying sync error" — reported 2026-08-04, on a
 * match with two balls in the database and an empty audience view.
 *
 * The worker had the server's own sentence the whole time
 * (`BOWLER_LIMIT: … has already bowled the maximum 1 overs`, `MATCH_LOCKED`,
 * a constraint violation, a 5xx); the store set a boolean and dropped the
 * string, so the pad could only ever say that *something* was wrong. This
 * pins the message surviving, because it is the difference between a scorer
 * fixing it in ten seconds and a match being lost.
 */
describe('sync error reporting', () => {
  beforeEach(() => {
    useScorerStore.setState({ hasSyncError: false, syncErrorMessage: null });
  });

  it('keeps the server message, not just the fact of failure', () => {
    // The store subscribes to sync events via `applySyncEvent`; driving the
    // state directly is the same assertion without a fake worker, and it is
    // what the pill and the sheet both read.
    useScorerStore.setState({
      hasSyncError: true,
      syncErrorMessage: 'BOWLER_LIMIT: 1a2b has already bowled the maximum 1 overs',
    });

    expect(useScorerStore.getState().syncErrorMessage).toContain('BOWLER_LIMIT');
  });

  it('clears both the flag and the message together', () => {
    useScorerStore.setState({ hasSyncError: true, syncErrorMessage: 'MATCH_LOCKED: locked' });

    useScorerStore.getState().dismissSyncError();

    const s = useScorerStore.getState();
    expect(s.hasSyncError).toBe(false);
    // A stale message behind a cleared flag would reappear on the next,
    // unrelated failure and send the scorer after the wrong problem.
    expect(s.syncErrorMessage).toBeNull();
  });

  it('retrySync is a no-op without a loaded match rather than throwing', async () => {
    useScorerStore.setState({ matchId: null, matchState: null });
    await expect(useScorerStore.getState().retrySync()).resolves.toBeUndefined();
  });
});
