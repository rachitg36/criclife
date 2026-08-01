import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from '@/types/database';

/**
 * The single Supabase client for the whole app.
 *
 * The anon key is safe in the browser — Row Level Security is what protects
 * the data, not key secrecy. See docs/03-ROLES-PERMISSIONS.md § 5.
 *
 * Regenerate `src/types/database.ts` after any migration:
 *   npx supabase gen types typescript --local > src/types/database.ts
 */
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  realtime: {
    // Free tier allows 200 concurrent connections and 2M messages/month.
    // Throttling here keeps a busy match well inside both.
    params: { eventsPerSecond: 10 },
  },
  global: {
    headers: { 'x-client-info': 'criclife-web' },
  },
});

/** Channel name for a match. Scorers and audience share one channel. */
export const matchChannel = (matchId: string) => `match:${matchId}`;

/** Channel name for a user's personal notification stream. */
export const userChannel = (profileId: string) => `user:${profileId}`;
