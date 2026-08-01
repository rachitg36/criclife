import { z } from 'zod';

/**
 * Fail loudly at startup rather than mysteriously at the first query.
 * Only VITE_-prefixed variables exist in the browser bundle; anything secret
 * must live in Supabase Edge Function secrets. See .env.example.
 */
const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a full URL'),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, 'VITE_SUPABASE_ANON_KEY looks wrong'),
  VITE_SENTRY_DSN: z.string().optional().default(''),
  VITE_APP_ENV: z.enum(['local', 'preview', 'production']).default('local'),
  VITE_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
});

const parsed = EnvSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(
    `Invalid environment configuration:\n${issues}\n\n` +
      `Copy .env.example to .env.local and fill in your Supabase credentials.`
  );
}

export const env = parsed.data;
export const isProd = env.VITE_APP_ENV === 'production';
export const isLocal = env.VITE_APP_ENV === 'local';
