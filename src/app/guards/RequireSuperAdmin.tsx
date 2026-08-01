import type { ReactNode } from 'react';

/**
 * PHASE 0 STUB.
 *
 * Phase 2 replaces this with a `profiles.is_super_admin` check. Note that this
 * guard is convenience only — the real enforcement is RLS in Postgres, which
 * cannot be bypassed from the client.
 *
 * docs/03-ROLES-PERMISSIONS.md § 2.1
 */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
