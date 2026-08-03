/**
 * Fail loudly at startup rather than mysteriously at the first query.
 * Only VITE_-prefixed variables exist in the browser bundle; anything secret
 * must live in Supabase Edge Function secrets. See .env.example.
 *
 * This was a Zod schema until Phase 7. Zod was imported here and *nowhere else*
 * in the app, and `env` is reached from the eager app shell, so all ~260 kB of
 * it rode the main chunk on every route — including `/live/:publicSlug`, whose
 * budget is 180 kB for the whole initial load (docs/06 § 8). Five variables and
 * four rules do not need a schema library; the error messages and the exported
 * shape are unchanged. If a real schema need turns up later (form validation is
 * the obvious one), import Zod *there*, where it can be code-split.
 */

type AppEnv = 'local' | 'preview' | 'production';

export type Env = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  VITE_SENTRY_DSN: string;
  VITE_APP_ENV: AppEnv;
  VITE_PUBLIC_URL: string;
};

const APP_ENVS: readonly AppEnv[] = ['local', 'preview', 'production'];

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function parse(raw: Record<string, unknown>): Env {
  const issues: string[] = [];
  const str = (key: string): string => (typeof raw[key] === 'string' ? (raw[key] as string) : '');

  const supabaseUrl = str('VITE_SUPABASE_URL');
  if (!isUrl(supabaseUrl)) {
    issues.push('VITE_SUPABASE_URL: VITE_SUPABASE_URL must be a full URL');
  }

  const anonKey = str('VITE_SUPABASE_ANON_KEY');
  if (anonKey.length < 20) {
    issues.push('VITE_SUPABASE_ANON_KEY: VITE_SUPABASE_ANON_KEY looks wrong');
  }

  const appEnvRaw = str('VITE_APP_ENV');
  const appEnv = (appEnvRaw || 'local') as AppEnv;
  if (!APP_ENVS.includes(appEnv)) {
    issues.push(
      `VITE_APP_ENV: Invalid option: expected one of ${APP_ENVS.map((e) => `"${e}"`).join('|')}`
    );
  }

  const publicUrl = str('VITE_PUBLIC_URL') || 'http://localhost:5173';
  if (!isUrl(publicUrl)) {
    issues.push('VITE_PUBLIC_URL: Invalid URL');
  }

  if (issues.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${issues.map((i) => `  • ${i}`).join('\n')}\n\n` +
        `Copy .env.example to .env.local and fill in your Supabase credentials.`
    );
  }

  return {
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_ANON_KEY: anonKey,
    VITE_SENTRY_DSN: str('VITE_SENTRY_DSN'),
    VITE_APP_ENV: appEnv,
    VITE_PUBLIC_URL: publicUrl,
  };
}

export const env = parse(import.meta.env as unknown as Record<string, unknown>);
export const isProd = env.VITE_APP_ENV === 'production';
export const isLocal = env.VITE_APP_ENV === 'local';
