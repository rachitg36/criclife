import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScorerStore } from '@/features/scoring/store';
import { PadUnavailable } from '@/features/scoring/components/PadUnavailable';

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

/**
 * The Score tab's backstop. Every component in the pad's middle begins
 * `if (!innings) return null`, so without a gate the pad's failure mode is a
 * black rectangle with WICKET and UNDO floating at the bottom — which is what
 * the first real match actually looked like, twice.
 */
function renderIt() {
  return render(
    <MemoryRouter>
      <PadUnavailable />
    </MemoryRouter>
  );
}

describe('PadUnavailable', () => {
  beforeEach(() => {
    useScorerStore.setState({
      matchId: 'match-1',
      matchState: null,
      config: null,
      mode: 'READY',
      error: null,
    });
  });

  it('names the missing piece rather than rendering nothing', () => {
    renderIt();
    expect(screen.getByText(/can.t open this match/i)).toBeInTheDocument();
    expect(screen.getByText(/the match state is missing/i)).toBeInTheDocument();
  });

  it('blames the settings when the state arrived but the config did not', () => {
    useScorerStore.setState({ matchState: { innings: [], currentInningsIndex: 0 } as never });
    renderIt();
    expect(screen.getByText(/the match settings is missing/i)).toBeInTheDocument();
  });

  it('blames the innings when both of those are present', () => {
    useScorerStore.setState({
      matchState: { innings: [], currentInningsIndex: 0 } as never,
      config: { ballsPerOver: 6 } as never,
    });
    renderIt();
    expect(screen.getByText(/the current innings is missing/i)).toBeInTheDocument();
  });

  it('prints the mode, which is the word that makes a bug report specific', () => {
    useScorerStore.setState({ mode: 'AWAITING_BOWLER' });
    renderIt();
    expect(screen.getByText('mode: AWAITING_BOWLER')).toBeInTheDocument();
  });

  it('surfaces a store error alongside, instead of choosing one', () => {
    useScorerStore.setState({ error: 'Both teams need a playing squad' });
    renderIt();
    expect(screen.getByRole('alert')).toHaveTextContent('Both teams need a playing squad');
  });

  it('offers a way out — reload, and match setup', () => {
    renderIt();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /match setup/i })).toHaveAttribute(
      'href',
      '/matches/match-1/setup'
    );
  });
});
