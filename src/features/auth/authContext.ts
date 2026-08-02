import type { Session } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

export type AuthContextValue = {
  session: Session | null;
  /** True until the initial session check resolves. */
  loading: boolean;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
