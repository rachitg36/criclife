import { useQuery } from '@tanstack/react-query';
import { useAuth } from './authContext';

/**
 * The signed-in user's own `profiles` row. Self-select is always allowed by RLS.
 *
 * Imports `lib/supabase` dynamically, inside the query function, rather than
 * at module scope: this hook is reachable from `RequireSuperAdmin`, which
 * router.tsx references eagerly (as a wrapping JSX element, not behind
 * `lazy()`), and a top-level import here previously dragged the entire
 * `@supabase/supabase-js` client into the main eager bundle — blowing the
 * audience route's 180KB budget even though the audience view never touches
 * auth. See vite.config.ts's manualChunks comment for the sibling fix.
 */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}
