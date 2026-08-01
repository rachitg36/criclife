import { QueryClient } from '@tanstack/react-query';

/**
 * Query defaults tuned for a live-score app on a phone at a cricket ground:
 * assume flaky connectivity, refetch aggressively on reconnect, and never
 * throw away cached data that might be the only copy the user can see.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error) => {
        // Don't retry a permission failure — the grant was revoked.
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 3;
      },
      refetchOnWindowFocus: true,
      refetchOnReconnect: 'always',
    },
    mutations: { retry: 2 },
  },
});
