import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/features/auth/authContext';
import { useProfile } from '@/features/auth/useProfile';

/**
 * Convenience only — the real enforcement is RLS in Postgres, which cannot
 * be bypassed from the client. docs/03-ROLES-PERMISSIONS.md § 2.1
 */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  if (authLoading || (session && profileLoading)) {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!profile?.is_super_admin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
