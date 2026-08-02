import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { RequireSuperAdmin } from '@/app/guards/RequireSuperAdmin';
import { AuthContext } from '@/features/auth/authContext';

const singleMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: singleMock,
        }),
      }),
    }),
  },
}));

function renderWithProviders(session: Session | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ session, loading: false }}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/login" element={<div>Login page</div>} />
            <Route path="/" element={<div>Home page</div>} />
            <Route
              path="/admin"
              element={
                <RequireSuperAdmin>
                  <div>Admin content</div>
                </RequireSuperAdmin>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

describe('RequireSuperAdmin', () => {
  it('redirects to /login with no session at all', () => {
    renderWithProviders(null);
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('redirects home when the profile is not a super admin', async () => {
    singleMock.mockResolvedValue({ data: { is_super_admin: false }, error: null });
    const session = { user: { id: 'user-1' } } as Session;
    renderWithProviders(session);
    await waitFor(() => expect(screen.getByText('Home page')).toBeInTheDocument());
  });

  it('renders children for an actual super admin', async () => {
    singleMock.mockResolvedValue({ data: { is_super_admin: true }, error: null });
    const session = { user: { id: 'user-1' } } as Session;
    renderWithProviders(session);
    await waitFor(() => expect(screen.getByText('Admin content')).toBeInTheDocument());
  });
});
