import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { PlayerEditPage } from '@/features/players/PlayerEditPage';
import { AuthContext } from '@/features/auth/authContext';

const PLAYER_ID = '20000000-0000-0000-0000-000000000001';

const playerSingleMock = vi.fn();
const profileSingleMock = vi.fn();
const suggestionsOrderMock = vi.fn().mockResolvedValue({ data: [], error: null });
const updateSingleMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'players') {
        return {
          select: () => ({ eq: () => ({ single: playerSingleMock }) }),
          update: () => ({ eq: () => ({ select: () => ({ single: updateSingleMock }) }) }),
        };
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSingleMock }) }) };
      }
      if (table === 'role_change_suggestions') {
        return { select: () => ({ eq: () => ({ eq: () => ({ order: suggestionsOrderMock }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

function basePlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_ID,
    profile_id: 'owner-1',
    full_name: 'Arjun Rao',
    short_name: null,
    jersey_number: 7,
    primary_role: 'batter',
    secondary_role: null,
    batting_hand: 'right',
    bowling_style: 'none',
    bio: null,
    role_locked_by_admin: false,
    claim_code: null,
    claimed_at: null,
    ...overrides,
  };
}

function renderEditPage(session: Session | null, isSuperAdmin = false) {
  playerSingleMock.mockResolvedValue({ data: basePlayer(), error: null });
  profileSingleMock.mockResolvedValue({ data: { is_super_admin: isSuperAdmin }, error: null });
  updateSingleMock.mockResolvedValue({ data: basePlayer({ primary_role: 'all_rounder' }), error: null });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ session, loading: false }}>
        <MemoryRouter initialEntries={[`/players/${PLAYER_ID}/edit`]}>
          <Routes>
            <Route path="/players/:playerId/edit" element={<PlayerEditPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('PlayerEditPage — E2E flow 2 & 3 (docs/09 §9)', () => {
  beforeEach(() => {
    playerSingleMock.mockReset();
    profileSingleMock.mockReset();
    updateSingleMock.mockReset();
    rpcMock.mockReset();
  });

  it('flow 2: the player edits their own role and it persists', async () => {
    const session = { user: { id: 'owner-1' } } as Session;
    renderEditPage(session);

    await waitFor(() => expect(screen.getByText('Edit your profile')).toBeInTheDocument());

    const select = screen.getByLabelText('Primary role') as HTMLSelectElement;
    await userEvent.selectOptions(select, 'all_rounder');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateSingleMock).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeInTheDocument();
  });

  it("flow 3: a team admin cannot open another player's role editor — offered suggest instead", async () => {
    const session = { user: { id: 'admin-1' } } as Session;
    renderEditPage(session, false);

    await waitFor(() =>
      expect(screen.getByText(/can't edit Arjun Rao's profile/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/suggest role change/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Primary role')).not.toBeInTheDocument();
    expect(updateSingleMock).not.toHaveBeenCalled();
  });

  it('a Super Admin can edit a role that is not their own', async () => {
    const session = { user: { id: 'super-1' } } as Session;
    renderEditPage(session, true);

    await waitFor(() => expect(screen.getByLabelText('Primary role')).toBeInTheDocument());
  });

  it("role_locked_by_admin blocks the player's own save button", async () => {
    playerSingleMock.mockResolvedValue({ data: basePlayer({ role_locked_by_admin: true }), error: null });
    profileSingleMock.mockResolvedValue({ data: { is_super_admin: false }, error: null });

    const session = { user: { id: 'owner-1' } } as Session;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={{ session, loading: false }}>
          <MemoryRouter initialEntries={[`/players/${PLAYER_ID}/edit`]}>
            <Routes>
              <Route path="/players/:playerId/edit" element={<PlayerEditPage />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    expect(await screen.findByText(/role is locked by an administrator/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });
});
