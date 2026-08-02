import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { OnboardingPage } from '@/features/auth/OnboardingPage';
import { AuthContext } from '@/features/auth/authContext';

const singleMock = vi.fn().mockResolvedValue({ data: { display_name: '' }, error: null });
const updateEqMock = vi.fn().mockResolvedValue({ error: null });
const insertMock = vi.fn().mockResolvedValue({ error: null });
const rpcMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      update: () => ({ eq: (...args: unknown[]) => updateEqMock(table, ...args) }),
      insert: (...args: unknown[]) => insertMock(table, ...args),
    }),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

const SESSION = { user: { id: 'user-1', email: 'alice@example.com' } } as Session;

function renderOnboarding(initialPath = '/onboarding') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ session: SESSION, loading: false }}>
        <MemoryRouter initialEntries={[initialPath]}>
          <OnboardingPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('OnboardingPage', () => {
  it('step 1 saves the display name then advances to step 2', async () => {
    renderOnboarding();
    await waitFor(() => expect(screen.getByText('What should we call you?')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Your name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Alice');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(updateEqMock).toHaveBeenCalledWith('profiles', 'id', 'user-1'));
    expect(await screen.findByText('Are you a player?')).toBeInTheDocument();
  });

  it("step 2 'not yet' skips straight to step 3 without creating a player row", async () => {
    renderOnboarding();
    await userEvent.type(screen.getByPlaceholderText('Your name'), 'Alice');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' })); // step 1 -> 2
    await screen.findByText('Are you a player?');

    await userEvent.click(screen.getByRole('button', { name: 'Not yet' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Join or create a team')).toBeInTheDocument();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("step 2 'yes' creates a players row with the chosen role", async () => {
    renderOnboarding();
    await userEvent.type(screen.getByPlaceholderText('Your name'), 'Alice');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' })); // step 1 -> 2
    await screen.findByText('Are you a player?');

    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(insertMock).toHaveBeenCalledWith(
        'players',
        expect.objectContaining({ profile_id: 'user-1', primary_role: 'batter', batting_hand: 'right' })
      )
    );
    expect(await screen.findByText('Join or create a team')).toBeInTheDocument();
  });

  it('claims a player record via the claimCode query param', async () => {
    renderOnboarding('/onboarding?claimCode=CLAIM-001');
    await waitFor(() => expect(screen.getByText('Is this player record you?')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /that's me/i }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('claim_player', { p_claim_code: 'CLAIM-001' }));
    expect(await screen.findByText(/claimed/i)).toBeInTheDocument();
  });
});
