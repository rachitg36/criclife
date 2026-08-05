import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/authContext';
import { useProfile } from '@/features/auth/useProfile';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type Team = Database['public']['Tables']['teams']['Row'];
export type Player = Database['public']['Tables']['players']['Row'];
export type TeamRole = Database['public']['Enums']['team_role'];
export type SquadRow = Database['public']['Tables']['team_members']['Row'] & { player: Player };

/** The signed-in user's own `players` row, if one exists. docs/03 § 2.3. */
export function useMyPlayer() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['myPlayer', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('profile_id', userId!)
        .order('created_at')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

/** Teams the signed-in user belongs to, with their role on each. */
export function useMyTeams() {
  const { data: myPlayer } = useMyPlayer();

  return useQuery({
    queryKey: ['myTeams', myPlayer?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('team_role, teams(*)')
        .eq('player_id', myPlayer!.id)
        .is('left_at', null);
      if (error) throw error;
      const rows = data as unknown as { team_role: TeamRole; teams: Team | null }[];
      return rows
        .filter((row) => row.teams)
        .map((row) => ({ ...row.teams!, myRole: row.team_role }));
    },
    enabled: !!myPlayer?.id,
  });
}

export function useAllTeams(search: string) {
  return useQuery({
    queryKey: ['allTeams', search.trim()],
    queryFn: async () => {
      let query = supabase.from('teams').select('*').eq('is_archived', false).order('created_at', { ascending: false });
      if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
      
      const searchLimit = search.trim() ? 30 : 5;
      const { data, error } = await query.limit(searchLimit);
      
      if (error) throw error;
      return data;
    },
  });
}

export function useTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').eq('id', teamId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!teamId,
  });
}

export function useSquad(teamId: string | undefined) {
  return useQuery({
    queryKey: ['squad', teamId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*, player:players(*)')
        .eq('team_id', teamId!)
        .is('left_at', null)
        .order('squad_number', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as unknown as SquadRow[];
    },
    enabled: !!teamId,
  });
}

const MANAGER_ROLES: TeamRole[] = ['owner', 'admin', 'captain', 'vice_captain'];
const ADMIN_ROLES: TeamRole[] = ['owner', 'admin'];

/** Combines identity role (docs/03 § 2.2) with Super Admin override for one team. */
export function useTeamPermissions(teamId: string | undefined) {
  const { data: profile } = useProfile();
  const { data: myPlayer } = useMyPlayer();
  const { data: squad } = useSquad(teamId);

  const myRow = squad?.find((row) => row.player_id === myPlayer?.id);
  const role = myRow?.team_role ?? null;
  const isSuperAdmin = !!profile?.is_super_admin;

  return {
    role,
    myPlayerId: myPlayer?.id ?? null,
    isMember: !!myRow,
    isManager: isSuperAdmin || (!!role && MANAGER_ROLES.includes(role)),
    isAdmin: isSuperAdmin || (!!role && ADMIN_ROLES.includes(role)),
    isOwner: isSuperAdmin || role === 'owner',
    isSuperAdmin,
  };
}
