import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestMatch, currentInnings } from '../../engine/helpers';
import { useScorerStore } from '@/features/scoring/store';

const rpcMock = vi.fn().mockResolvedValue({ data: { ok: true, delivery: { id: 'd1' } }, error: null });

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
    mode: 'READY',
    armedModifier: null,
    error: null,
    revoked: false,
    lastTap: null,
    duplicateWarning: false,
  });
}

describe('useScorerStore — the one-tap path (docs/05 § 2, CLAUDE.md rule 4)', () => {
  beforeEach(() => {
    rpcMock.mockClear();
    seedReadyMatch();
  });

  it('applies a run optimistically before the network call resolves', () => {
    // Deliberately not awaited — this is the guarantee under test: the pad
    // must reflect the new score synchronously, without waiting on Supabase.
    void useScorerStore.getState().recordRun(1);

    const innings = currentInnings(useScorerStore.getState().matchState!);
    expect(innings.runs).toBe(1);
    expect(innings.batters.s1?.balls).toBe(1);
  });

  it('still fires the record_delivery RPC in the background', async () => {
    await useScorerStore.getState().recordRun(4);
    expect(rpcMock).toHaveBeenCalledWith(
      'record_delivery',
      expect.objectContaining({ p: expect.objectContaining({ runsOffBat: 4, isBoundary: true }) })
    );
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
  beforeEach(() => {
    rpcMock.mockClear();
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
  beforeEach(() => {
    rpcMock.mockClear();
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
  beforeEach(() => {
    rpcMock.mockClear();
    seedReadyMatch();
  });

  it('increments wickets and moves to AWAITING_BATTER', () => {
    void useScorerStore.getState().recordWicket({ type: 'bowled', dismissedPlayerId: 's1' });

    const innings = currentInnings(useScorerStore.getState().matchState!);
    expect(innings.wickets).toBe(1);
    expect(useScorerStore.getState().mode).toBe('AWAITING_BATTER');
  });
});
