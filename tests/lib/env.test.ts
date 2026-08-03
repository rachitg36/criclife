import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `env.ts` validates at module load and throws, so every case here re-imports
 * the module fresh with different stubs. That exercises the real boot path —
 * including the throw — rather than a helper extracted for the test's benefit.
 *
 * This exists because Phase 7 replaced a Zod schema here with hand-rolled
 * checks (Zod was ~260 kB riding the eager chunk on every route, for five
 * variables). The behaviour has to stay identical, and "the app refuses to
 * boot on a bad `.env.local`" is not something to find out about in production.
 */
const VALID = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_long_enough_key',
  VITE_APP_ENV: 'local',
  VITE_PUBLIC_URL: 'http://localhost:5173',
};

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...VALID, ...overrides })) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
  return import('@/lib/env');
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe('env', () => {
  it('parses a valid configuration', async () => {
    const { env } = await loadEnv({});
    expect(env.VITE_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.VITE_APP_ENV).toBe('local');
  });

  it('defaults VITE_APP_ENV to local and VITE_PUBLIC_URL to localhost', async () => {
    const { env, isLocal } = await loadEnv({
      VITE_APP_ENV: undefined,
      VITE_PUBLIC_URL: undefined,
    });
    expect(env.VITE_APP_ENV).toBe('local');
    expect(env.VITE_PUBLIC_URL).toBe('http://localhost:5173');
    expect(isLocal).toBe(true);
  });

  it('defaults the optional Sentry DSN to an empty string', async () => {
    const { env } = await loadEnv({});
    expect(env.VITE_SENTRY_DSN).toBe('');
  });

  it('rejects a Supabase URL that is not a URL', async () => {
    await expect(loadEnv({ VITE_SUPABASE_URL: 'not-a-url' })).rejects.toThrow(
      /VITE_SUPABASE_URL must be a full URL/
    );
  });

  it('rejects a missing Supabase URL', async () => {
    await expect(loadEnv({ VITE_SUPABASE_URL: undefined })).rejects.toThrow(
      /VITE_SUPABASE_URL must be a full URL/
    );
  });

  it('rejects an anon key that is too short to be real', async () => {
    await expect(loadEnv({ VITE_SUPABASE_ANON_KEY: 'short' })).rejects.toThrow(
      /VITE_SUPABASE_ANON_KEY looks wrong/
    );
  });

  it('rejects an unknown app environment', async () => {
    await expect(loadEnv({ VITE_APP_ENV: 'staging' })).rejects.toThrow(/VITE_APP_ENV/);
  });

  it('rejects a public URL that is not a URL', async () => {
    await expect(loadEnv({ VITE_PUBLIC_URL: 'nope' })).rejects.toThrow(/VITE_PUBLIC_URL/);
  });

  it('reports every problem at once, and says how to fix it', async () => {
    await expect(
      loadEnv({ VITE_SUPABASE_URL: 'x', VITE_SUPABASE_ANON_KEY: 'y' })
    ).rejects.toThrow(/VITE_SUPABASE_URL[\s\S]*VITE_SUPABASE_ANON_KEY[\s\S]*Copy \.env\.example/);
  });

  it('sets isProd only in production', async () => {
    const local = await loadEnv({});
    expect(local.isProd).toBe(false);
    const prod = await loadEnv({ VITE_APP_ENV: 'production' });
    expect(prod.isProd).toBe(true);
    expect(prod.isLocal).toBe(false);
  });
});
