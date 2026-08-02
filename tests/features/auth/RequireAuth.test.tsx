import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from '@/app/guards/RequireAuth';
import { AuthContext } from '@/features/auth/authContext';
import type { Session } from '@supabase/supabase-js';

function renderWithAuth(value: { session: Session | null; loading: boolean }, initialPath = '/protected') {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route
            path="/protected"
            element={
              <RequireAuth>
                <div>Secret content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('RequireAuth', () => {
  it('shows a loading skeleton while the session check is in flight', () => {
    renderWithAuth({ session: null, loading: true });
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('redirects to /login when there is no session', () => {
    renderWithAuth({ session: null, loading: false });
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('renders children once a session exists', () => {
    const session = { user: { id: 'user-1' } } as Session;
    renderWithAuth({ session, loading: false });
    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });
});
