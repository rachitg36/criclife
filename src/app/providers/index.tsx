import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { queryClient } from './queryClient';

/**
 * Deliberately does NOT include AuthProvider. The audience view
 * (docs/03-ROLES-PERMISSIONS.md § 6) is fully anonymous and has its own
 * ≤180KB budget (docs/06-AUDIENCE-VIEW.md) — pulling `@supabase/supabase-js`
 * into every route's eager bundle blew that budget by 30KB the first time
 * this was tried. AuthProvider is scoped in router.tsx to only the routes
 * that actually check a session.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
