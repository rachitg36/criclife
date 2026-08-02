import { Outlet } from 'react-router';
import { AuthProvider } from '@/features/auth/AuthProvider';

/**
 * Scopes AuthProvider (and the `@supabase/supabase-js` it pulls in) to only
 * the route branches that actually check a session — login/callback/
 * onboarding, the authed app shell, and admin. The audience view sits
 * outside this and never loads it. See providers/index.tsx.
 */
export function AuthedOutlet() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
