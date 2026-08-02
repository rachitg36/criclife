import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ScoringRightsMapPage } from '@/features/matches/ScoringRightsMapPage';

const MATCH_ID = '30000000-0000-0000-0000-000000000001';

const rpcMock = vi.fn();
const matchSingleMock = vi.fn().mockResolvedValue({
  data: { id: MATCH_ID, title: 'Season Opener' },
  error: null,
});

const channelMock = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: matchSingleMock }) }) }),
    rpc: (...args: unknown[]) => rpcMock(...args),
    channel: () => channelMock,
    removeChannel: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/matches/${MATCH_ID}/rights`]}>
        <Routes>
          <Route path="/matches/:matchId/rights" element={<ScoringRightsMapPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ScoringRightsMapPage — docs/03 §3.4', () => {
  it('only offers Revoke on an active grant, not a revoked one', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          id: 'grant-active',
          match_id: MATCH_ID,
          grantee_profile_id: 'p1',
          granted_by_profile_id: 'p0',
          status: 'active',
          can_delegate: false,
          scope: 'full',
          granted_at: new Date().toISOString(),
          expires_at: null,
          revoked_at: null,
          transferred_to_grant_id: null,
          note: null,
          grantee_display_name: 'Arjun',
          grantee_avatar_url: null,
          granted_by_display_name: 'Priya',
        },
        {
          id: 'grant-revoked',
          match_id: MATCH_ID,
          grantee_profile_id: 'p2',
          granted_by_profile_id: 'p0',
          status: 'revoked',
          can_delegate: false,
          scope: 'full',
          granted_at: new Date().toISOString(),
          expires_at: null,
          revoked_at: new Date().toISOString(),
          transferred_to_grant_id: null,
          note: null,
          grantee_display_name: 'Dev',
          grantee_avatar_url: null,
          granted_by_display_name: 'Priya',
        },
      ],
      error: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Arjun')).toBeInTheDocument());
    expect(screen.getByText('Dev')).toBeInTheDocument();

    // Exactly one Revoke button — for Arjun's active grant, not Dev's revoked one.
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1);
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });
});
