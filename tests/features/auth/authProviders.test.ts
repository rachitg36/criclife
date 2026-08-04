import { describe, expect, it, vi } from 'vitest';
import { fetchAuthProviders, readProviders } from '@/features/auth/authProviders';

/**
 * Written after a real sign-in attempt on a phone landed here:
 *
 *   {"code":400,"error_code":"validation_failed",
 *    "msg":"Unsupported provider: provider is not enabled"}
 *
 * `signInWithOAuth` navigates rather than calling an API, so there is no error
 * to catch and no way back. The only fix is to not offer the button.
 */
describe('readProviders', () => {
  it('trusts only an explicit true', () => {
    expect(readProviders({ external: { google: true } }).google).toBe(true);
    expect(readProviders({ external: { google: false } }).google).toBe(false);
    // A truthy string is not the same as enabled, and GoTrue's shape is not
    // a contract this app controls.
    expect(readProviders({ external: { google: 'yes' } }).google).toBe(false);
  });

  it('says no when the provider is absent, or the shape is unexpected', () => {
    expect(readProviders({ external: {} }).google).toBe(false);
    expect(readProviders({}).google).toBe(false);
    expect(readProviders(null).google).toBe(false);
    expect(readProviders('nonsense').google).toBe(false);
  });
});

describe('fetchAuthProviders', () => {
  it('reads the project settings and sends the anon key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ external: { google: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAuthProviders('https://p.supabase.co', 'anon-key')).resolves.toEqual({
      google: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://p.supabase.co/auth/v1/settings',
      expect.objectContaining({ headers: { apikey: 'anon-key' } })
    );
    vi.unstubAllGlobals();
  });

  it('shows the button when the probe fails — a failed probe is not a verdict', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    // Offering nothing looked safe and cost a working sign-in method: Google
    // was enabled on both projects and the button was simply absent, with
    // nothing on screen to explain it. An unreachable probe means "unknown".
    await expect(fetchAuthProviders('https://p.supabase.co', 'k')).resolves.toEqual({
      google: true,
      probeFailed: true,
    });
    vi.unstubAllGlobals();
  });

  it('shows the button on a non-OK response, flagged as unverified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    await expect(fetchAuthProviders('https://p.supabase.co', 'k')).resolves.toEqual({
      google: true,
      probeFailed: true,
    });
    vi.unstubAllGlobals();
  });
});
