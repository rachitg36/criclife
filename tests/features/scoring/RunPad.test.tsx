import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestMatch } from '../../engine/helpers';
import { useScorerStore } from '@/features/scoring/store';
import { BattersRow } from '@/features/scoring/components/BattersRow';
import { RunPad } from '@/features/scoring/components/RunPad';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: { ok: true, delivery: { id: 'd1' } }, error: null }),
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

describe('RunPad — one tap, no confirm, no dialog (docs/05 § 2)', () => {
  beforeEach(() => {
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
  });

  it('tapping "4" updates the visible score immediately', async () => {
    const user = userEvent.setup();
    render(
      <>
        <BattersRow />
        <RunPad />
      </>
    );

    // Both the striker and non-striker start on 0* — no ball faced yet.
    expect(screen.getAllByText(/0\*/)).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '4' }));

    // The striker moves to 4*; the non-striker stays on 0* (strike doesn't
    // rotate on a boundary).
    expect(screen.getByText(/4\*/)).toBeInTheDocument();
    expect(screen.getByText(/0\*/)).toBeInTheDocument();
  });
});
