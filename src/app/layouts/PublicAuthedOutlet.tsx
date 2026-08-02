import { AuthProvider } from '@/features/auth/AuthProvider';
import { PublicLayout } from './PublicLayout';

/**
 * Public-*read* routes (docs/11 § 3, § 4 — team/player pages) still need to
 * know who's looking: a manager sees "+ Add player", the player themself
 * sees a link to their own edit screen. That needs a session, but these
 * routes must stay reachable with none — unlike AuthedOutlet, nothing here
 * gates on RequireAuth. The strict anonymous audience view
 * (`/live/:publicSlug`, `/ranks`) stays on plain PublicLayout and never
 * loads AuthProvider at all — see providers/index.tsx and vite.config.ts for
 * why `@supabase/supabase-js` must not ride along with those.
 */
export function PublicAuthedOutlet() {
  return (
    <AuthProvider>
      <PublicLayout />
    </AuthProvider>
  );
}
