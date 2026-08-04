import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import { LoginPage } from '@/features/auth/LoginPage';
import { AuthContext } from '@/features/auth/authContext';

const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => signInWithOtp(...args),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuth(...args),
    },
  },
}));

/**
 * The Google button only renders when the project reports the provider as
 * enabled — `signInWithOAuth` navigates the browser rather than calling an
 * API, so offering it on a project without Google lands the user on GoTrue's
 * raw "provider is not enabled" JSON with no way back. See `authProviders`.
 */
function stubProviders(google: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ external: { google } }) })
  );
}

beforeEach(() => stubProviders(true));
afterEach(() => vi.unstubAllGlobals());

function renderLoginPage(session: Session | null = null) {
  return render(
    <AuthContext.Provider value={{ session, loading: false }}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('LoginPage', () => {
  it('disables the magic-link button until an email is entered', async () => {
    renderLoginPage();
    const button = screen.getByRole('button', { name: /send magic link/i });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'alice@example.com');
    expect(button).toBeEnabled();
  });

  it('sends a magic link with the email and callback redirect, then shows the sent state', async () => {
    renderLoginPage();
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send magic link/i }));

    await waitFor(() =>
      expect(signInWithOtp).toHaveBeenCalledWith({
        email: 'alice@example.com',
        options: { emailRedirectTo: expect.stringContaining('/auth/callback') },
      })
    );
    expect(await screen.findByText(/check/i)).toBeInTheDocument();
  });

  it('shows an error message when the magic link request fails', async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { message: 'rate limited' } });
    renderLoginPage();
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send magic link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limited');
  });

  it('calls signInWithOAuth with the google provider', async () => {
    renderLoginPage();
    await userEvent.click(await screen.findByRole('button', { name: /continue with google/i }));
    await waitFor(() =>
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: expect.stringContaining('/auth/callback') },
      })
    );
  });

  it('offers no Google button when the project has not enabled it', async () => {
    // The dead end this closes: a phone, a real project, and raw JSON.
    stubProviders(false);
    renderLoginPage();
    // The email form is the path that always works, so it must still be there.
    expect(await screen.findByPlaceholderText('you@example.com')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /continue with google/i })
      ).not.toBeInTheDocument()
    );
  });

  it('redirects away immediately if already signed in', () => {
    const session = { user: { id: 'user-1' } } as Session;
    renderLoginPage(session);
    expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument();
  });
});
