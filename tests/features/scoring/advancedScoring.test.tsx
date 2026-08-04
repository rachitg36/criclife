import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestMatch } from '../../engine/helpers';
import { useScorerStore } from '@/features/scoring/store';
import { useUiStore } from '@/stores/uiStore';
import { RunPad } from '@/features/scoring/components/RunPad';

/**
 * Advanced Mode — docs/05 § 8.
 *
 * The toggle existed in two settings screens from Phase 5 and *nothing read
 * it*: `advancedScoring` was set, persisted to localStorage, and never
 * consulted. Reported from a phone as "advanced scoring is enabled but the
 * extra overlay is not coming" and, separately, "there is an option for
 * advanced scoring but nothing happens".
 *
 * These tests pin the two properties that make it safe rather than the
 * pixels: the ball commits regardless, and the prompt only appears when it
 * has something to capture.
 */
const update = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: { ok: true, delivery: { id: 'd1' } }, error: null }),
    from: () => ({
      update: (...args: unknown[]) => ({ eq: () => update(...args) }),
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

function seedPad() {
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
    shotPrompt: null,
  });
}

describe('Advanced Mode', () => {
  beforeEach(() => {
    seedPad();
    update.mockClear();
  });

  it('stays out of the way entirely when the toggle is off', async () => {
    useUiStore.setState({ advancedScoring: false });
    const user = userEvent.setup();
    render(<RunPad />);

    await user.click(screen.getByRole('button', { name: '4' }));

    expect(useScorerStore.getState().shotPrompt).toBeNull();
    expect(screen.queryByLabelText('Tap where the ball went')).not.toBeInTheDocument();
  });

  it('asks where a scoring shot went, with the ball already recorded', async () => {
    useUiStore.setState({ advancedScoring: true });
    const user = userEvent.setup();
    render(<RunPad />);

    await user.click(screen.getByRole('button', { name: '4' }));

    // The ball is committed *first*. The prompt is an afterthought, so the
    // score must already have moved before it is on screen.
    expect(useScorerStore.getState().deliveries).toHaveLength(1);
    expect(useScorerStore.getState().shotPrompt?.runs).toBe(4);
    expect(screen.getByLabelText('Tap where the ball went')).toBeInTheDocument();
  });

  it('does not prompt on a dot — most balls are dots and have no shot', async () => {
    useUiStore.setState({ advancedScoring: true });
    const user = userEvent.setup();
    render(<RunPad />);

    await user.click(screen.getByRole('button', { name: '0' }));

    expect(useScorerStore.getState().deliveries).toHaveLength(1);
    expect(useScorerStore.getState().shotPrompt).toBeNull();
  });

  it('Skip clears the prompt and leaves the ball exactly as it was', async () => {
    useUiStore.setState({ advancedScoring: true });
    const user = userEvent.setup();
    render(<RunPad />);

    await user.click(screen.getByRole('button', { name: '4' }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(useScorerStore.getState().shotPrompt).toBeNull();
    expect(useScorerStore.getState().deliveries).toHaveLength(1);
    expect(useScorerStore.getState().deliveries[0]!.runsBatter).toBe(4);
  });

  it('falls back to a narrow UPDATE when the ball has already synced', async () => {
    useUiStore.setState({ advancedScoring: true });
    useScorerStore.setState({ shotPrompt: { clientDeliveryId: 'gone', runs: 4 } });

    // Nothing with that id is in the outbox, so `attachShotToPending` misses
    // and the direct-update path is the only way the coordinate lands.
    await useScorerStore.getState().attachShot(0.5, -0.5);

    expect(useScorerStore.getState().shotPrompt).toBeNull();
    expect(update).toHaveBeenCalledWith({ shot_x: 0.5, shot_y: -0.5 });
  });
});
