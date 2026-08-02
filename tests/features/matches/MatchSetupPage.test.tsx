import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { MatchSetupPage } from '@/features/matches/MatchSetupPage';
import { AuthContext } from '@/features/auth/authContext';

const MATCH_ID = '30000000-0000-0000-0000-000000000001';
const TEAM_A_ID = '10000000-0000-0000-0000-000000000001';
const TEAM_B_ID = '10000000-0000-0000-0000-000000000002';

const matchSingleMock = vi.fn();
const profileSingleMock = vi.fn();
const myPlayerMaybeSingleMock = vi.fn();
const squadOrderMock = vi.fn();

// docs/03 §4 — "Edit match config (pre-toss)" is Super Admin / Team Owner / Admin
// / Captain / VC only, never a plain grant holder or outsider. MatchSetupPage
// checks this client-side via useTeamPermissions before rendering the toss/XI
// forms; the real enforcement is the set_toss/set_playing_xi RPCs' own RLS
// checks (covered by pgTAP), but the UI should not even offer the controls.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'matches') {
        return { select: () => ({ eq: () => ({ single: matchSingleMock }) }) };
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSingleMock }) }) };
      }
      if (table === 'players') {
        return {
          select: () => ({
            eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: myPlayerMaybeSingleMock }) }) }),
          }),
        };
      }
      if (table === 'team_members') {
        return {
          select: () => ({
            eq: () => ({ is: () => ({ order: squadOrderMock }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

function renderSetupPage(session: Session | null) {
  matchSingleMock.mockResolvedValue({
    data: {
      id: MATCH_ID,
      team_a_id: TEAM_A_ID,
      team_b_id: TEAM_B_ID,
      toss_winner_team_id: null,
      config: { playersPerSide: 11 },
    },
    error: null,
  });
  profileSingleMock.mockResolvedValue({ data: { is_super_admin: false }, error: null });
  myPlayerMaybeSingleMock.mockResolvedValue({ data: null, error: null });
  squadOrderMock.mockResolvedValue({ data: [], error: null });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ session, loading: false }}>
        <MemoryRouter initialEntries={[`/matches/${MATCH_ID}/setup`]}>
          <Routes>
            <Route path="/matches/:matchId/setup" element={<MatchSetupPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('MatchSetupPage — permission gate (docs/03 §4)', () => {
  beforeEach(() => {
    matchSingleMock.mockReset();
    profileSingleMock.mockReset();
    myPlayerMaybeSingleMock.mockReset();
    squadOrderMock.mockReset();
  });

  it('blocks a signed-in user who manages neither team', async () => {
    const session = { user: { id: 'outsider-1' } } as Session;
    renderSetupPage(session);

    await waitFor(() =>
      expect(
        screen.getByText(/only a manager of one of these teams can set up this match/i)
      ).toBeInTheDocument()
    );
    expect(screen.queryByText('Toss')).not.toBeInTheDocument();
    expect(screen.queryByText('Start match')).not.toBeInTheDocument();
  });
});
