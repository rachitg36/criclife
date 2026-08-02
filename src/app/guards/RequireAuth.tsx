import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/features/auth/authContext';

/**
 * docs/03-ROLES-PERMISSIONS.md — the real enforcement is always RLS in
 * Postgres; this guard only decides what the client renders, so a user isn't
 * dropped into an authed screen that will just fail every query.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
