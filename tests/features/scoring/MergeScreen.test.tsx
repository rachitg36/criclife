import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScorerStore } from '@/features/scoring/store';
import { MergeScreen } from '@/features/scoring/components/MergeScreen';

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

describe('MergeScreen — docs/05 § 6.6', () => {
  beforeEach(() => {
    useScorerStore.setState({ conflict: null });
  });

  it('renders nothing when there is no conflict', () => {
    const { container } = render(<MergeScreen />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the pending-ball count and both resolution actions', () => {
    useScorerStore.setState({
      conflict: {
        inningsId: 'innings-1',
        pending: [
          { clientDeliveryId: 'a' } as never,
          { clientDeliveryId: 'b' } as never,
          { clientDeliveryId: 'c' } as never,
        ],
      },
    });

    render(<MergeScreen />);

    expect(screen.getByText('Scoring conflict')).toBeInTheDocument();
    expect(screen.getByText("This device has 3 balls that haven't synced yet.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Keep both/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Keep theirs/ })).toBeInTheDocument();
  });

  it('singular-cases the count for exactly one pending ball', () => {
    useScorerStore.setState({
      conflict: { inningsId: 'innings-1', pending: [{ clientDeliveryId: 'a' } as never] },
    });

    render(<MergeScreen />);

    expect(screen.getByText("This device has 1 ball that hasn't synced yet.")).toBeInTheDocument();
  });

  it('"Keep both" calls resolveConflictKeepMine', async () => {
    const user = userEvent.setup();
    const resolveConflictKeepMine = vi.fn().mockResolvedValue(undefined);
    useScorerStore.setState({
      conflict: { inningsId: 'innings-1', pending: [{ clientDeliveryId: 'a' } as never] },
      resolveConflictKeepMine,
    });

    render(<MergeScreen />);
    await user.click(screen.getByRole('button', { name: /Keep both/ }));

    expect(resolveConflictKeepMine).toHaveBeenCalledTimes(1);
  });

  it('"Keep theirs" calls resolveConflictKeepTheirs', async () => {
    const user = userEvent.setup();
    const resolveConflictKeepTheirs = vi.fn().mockResolvedValue(undefined);
    useScorerStore.setState({
      conflict: { inningsId: 'innings-1', pending: [{ clientDeliveryId: 'a' } as never] },
      resolveConflictKeepTheirs,
    });

    render(<MergeScreen />);
    await user.click(screen.getByRole('button', { name: /Keep theirs/ }));

    expect(resolveConflictKeepTheirs).toHaveBeenCalledTimes(1);
  });
});
