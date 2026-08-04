import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type Match = Database['public']['Tables']['matches']['Row'];
export type MatchSquadRow = Database['public']['Tables']['match_squads']['Row'];
export type MatchGrant = Database['public']['Functions']['get_match_grants']['Returns'][number];

export function useMatch(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)')
        .eq('id', matchId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
  });
}

/**
 * Every match, newest first. `matches_read_public` makes them world-readable
 * (docs/03 § 5 — a live score is public), so this needs no membership filter
 * and works signed out.
 *
 * Capped at 60: there is no pagination on the list screen yet, and a league
 * running for a season would otherwise grow this query without limit.
 */
export function useMatches() {
  return useQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)')
        .order('scheduled_at', { ascending: false, nullsFirst: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });
}

export function useMatchSquad(matchId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ['matchSquad', matchId, teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_squads')
        .select('*, player:players(*)')
        .eq('match_id', matchId!)
        .eq('team_id', teamId!)
        .order('batting_order', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as unknown as (MatchSquadRow & {
        player: Database['public']['Tables']['players']['Row'];
      })[];
    },
    enabled: !!matchId && !!teamId,
  });
}

export function useMatchGrants(matchId: string | undefined) {
  return useQuery({
    queryKey: ['matchGrants', matchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_match_grants', { p_match_id: matchId! });
      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
    // Realtime keeps this fresh; still poll gently as a fallback.
    refetchInterval: 15_000,
  });
}
