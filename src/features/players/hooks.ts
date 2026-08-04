import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type Player = Database['public']['Tables']['players']['Row'];
export type RoleSuggestion = Database['public']['Tables']['role_change_suggestions']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];

export function usePlayer(playerId: string | undefined) {
  return useQuery({
    queryKey: ['player', playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!playerId,
  });
}

/** Team chips shown on the player profile hero. docs/11 § 4. */
/** Career totals, derived by `rebuild_career_stats` when a match finalises. */
export function usePlayerCareer(playerId: string | undefined) {
  return useQuery({
    queryKey: ['playerCareer', playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_career_stats')
        .select('*')
        .eq('player_id', playerId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!playerId,
  });
}

export function usePlayerTeams(playerId: string | undefined) {
  return useQuery({
    queryKey: ['playerTeams', playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('team_role, teams(*)')
        .eq('player_id', playerId!)
        .is('left_at', null);
      if (error) throw error;
      const rows = data as unknown as { teams: Team | null }[];
      return rows.filter((row) => row.teams).map((row) => row.teams!);
    },
    enabled: !!playerId,
  });
}

/** Pending role-change suggestions the player needs to Accept/Reject. docs/11 § 4. */
export function usePendingSuggestions(playerId: string | undefined) {
  return useQuery({
    queryKey: ['roleSuggestions', playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_change_suggestions')
        .select('*')
        .eq('player_id', playerId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!playerId,
  });
}
