import type { ReactNode } from 'react';

/**
 * PHASE 0 STUB.
 *
 * Phase 4 replaces this with a live `scoring_grants` subscription so that a
 * revoked grant flips the pad to read-only within ~2 seconds, even mid-over.
 * The server-side truth is `can_score(match_id, auth.uid())` in RLS.
 *
 * docs/03-ROLES-PERMISSIONS.md § 3
 */
export function RequireScoringGrant({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
