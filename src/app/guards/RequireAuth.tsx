import type { ReactNode } from 'react';

/**
 * PHASE 0 STUB — passes everything through.
 *
 * Phase 2 replaces this with a real session check:
 *   const { session, loading } = useSession();
 *   if (loading) return <AuthSkeleton />;
 *   if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
 *
 * docs/03-ROLES-PERMISSIONS.md
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
