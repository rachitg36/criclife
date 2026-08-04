import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestMatch } from '../../engine/helpers';
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
 * Answering one of the pad's questions must not claim the others are answered.
 *
 * A run out on the last ball of an over raises **both** NEW_BATTER_REQUIRED
 * and OVER_COMPLETE. `pickBatter` hardcoded `mode: 'READY'`, so answering the
 * batter question left the pad ready with no bowler at the crease: the run pad
 * rendered, every tap hit `commitDelivery`'s bowler guard, and the guard
 * returned in silence.
 *
 * Reported 2026-08-04 — "the score pad is not doing anything when I click on
 * runs, or wickets… it says pick a bowler but there is no option to pick" —
 * and it survived a reload, because the reload restored the same wrong mode.
 */
function seed() {
  const matchState = createTestMatch();
  useScorerStore.setState({
    matchId: 'm1',
    config: matchState.config,
    matchState,
    deliveries: [],
    deliveryIds: [],
    inningsIdByNo: { 1: 'i1' },
    mode: 'READY',
    error: null,
    revoked: false,
    lastTap: null,
  });
  return matchState;
}

function innings() {
  const s = useScorerStore.getState().matchState!;
  return s.innings[s.currentInningsIndex]!;
}

describe('pad mode after a picker is answered', () => {
  beforeEach(() => seed());

  it('asks for a bowler when the batter is picked but the over has turned', () => {
    // Both ends empty and no bowler: the shape a run out at the end of an over
    // leaves behind.
    const s = useScorerStore.getState().matchState!;
    const i = s.innings[s.currentInningsIndex]!;
    const striker = i.strikerId!;
    const nonStriker = i.nonStrikerId!;
    useScorerStore.setState({
      matchState: {
        ...s,
        innings: s.innings.map((x, idx) =>
          idx === s.currentInningsIndex
            ? { ...x, strikerId: null, nonStrikerId: nonStriker, bowlerId: null }
            : x
        ),
      },
      mode: 'AWAITING_BATTER',
    });

    useScorerStore.getState().pickBatter(striker);

    // Not READY. The bowler is still missing, and the pad has to say so.
    expect(useScorerStore.getState().mode).toBe('AWAITING_BOWLER');
  });

  it('is ready once the bowler completes the picture', () => {
    const s = useScorerStore.getState().matchState!;
    const i = s.innings[s.currentInningsIndex]!;
    const bowler = i.bowlerId!;
    useScorerStore.setState({
      matchState: {
        ...s,
        innings: s.innings.map((x, idx) =>
          idx === s.currentInningsIndex ? { ...x, bowlerId: null } : x
        ),
      },
      mode: 'AWAITING_BOWLER',
    });

    useScorerStore.getState().pickBowler(bowler);

    expect(useScorerStore.getState().mode).toBe('READY');
    expect(innings().bowlerId).toBe(bowler);
  });

  it('refuses a ball with no bowler, and says why instead of nothing', async () => {
    const s = useScorerStore.getState().matchState!;
    useScorerStore.setState({
      matchState: {
        ...s,
        innings: s.innings.map((x, idx) =>
          idx === s.currentInningsIndex ? { ...x, bowlerId: null } : x
        ),
      },
      // The wrong mode the old `pickBatter` produced.
      mode: 'READY',
    });

    await useScorerStore.getState().recordRun(1);

    expect(useScorerStore.getState().deliveries).toHaveLength(0);
    expect(useScorerStore.getState().error).toContain('No bowler');
    // And it puts the pad back where it can be fixed.
    expect(useScorerStore.getState().mode).toBe('AWAITING_BOWLER');
  });
});
