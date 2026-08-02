import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { TEAM_ROLE_LABEL } from '@/features/players/roleLabels';
import { useSquad, useTeam, useTeamPermissions } from './hooks';
import type { Database } from '@/types/database';

type TeamRole = Database['public']['Enums']['team_role'];

/** docs/11-SCREENS-AND-ROUTES.md § 3 — `/teams/:teamId/settings`, owner/admin only. */
export function TeamSettingsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: team } = useTeam(teamId);
  const { data: squad } = useSquad(teamId);
  const perms = useTeamPermissions(teamId);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [homeGround, setHomeGround] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#06b6d4');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!team) return;
    setName(team.name);
    setCity(team.city ?? '');
    setHomeGround(team.home_ground ?? '');
    setPrimaryColor(team.primary_color ?? '#06b6d4');
  }, [team]);

  if (!perms.isAdmin) {
    return (
      <div className="px-4 pt-8 text-[var(--text-secondary)]">
        Only a team owner or admin can change team settings.
      </div>
    );
  }
  if (!team) return null;

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: updateError } = await supabase
      .from('teams')
      .update({
        name,
        city: city || null,
        home_ground: homeGround || null,
        primary_color: primaryColor,
      })
      .eq('id', teamId!);
    setSaving(false);
    if (updateError) return setError(updateError.message);
    await queryClient.invalidateQueries({ queryKey: ['team', teamId] });
    setSaved(true);
  }

  async function setMemberRole(memberId: string, role: TeamRole) {
    setError(null);
    const { error: updateError } = await supabase
      .from('team_members')
      .update({ team_role: role })
      .eq('id', memberId);
    if (updateError) return setError(updateError.message);
    await queryClient.invalidateQueries({ queryKey: ['squad', teamId] });
  }

  async function transferOwnership(newOwnerProfileId: string) {
    setError(null);
    const { error: rpcError } = await supabase.rpc('transfer_team_ownership', {
      p_team_id: teamId!,
      p_new_owner_profile_id: newOwnerProfileId,
    });
    if (rpcError) return setError(rpcError.message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['team', teamId] }),
      queryClient.invalidateQueries({ queryKey: ['squad', teamId] }),
    ]);
  }

  async function archive(archived: boolean) {
    setError(null);
    const { error: rpcError } = await supabase.rpc('archive_team', {
      p_team_id: teamId!,
      p_archived: archived,
    });
    if (rpcError) return setError(rpcError.message);
    navigate('/teams');
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="mb-4 text-[var(--text-heading-lg)] font-bold">Team settings</h1>

      {error && (
        <p role="alert" className="mb-4 text-[var(--danger)]">
          {error}
        </p>
      )}

      <form onSubmit={saveDetails} className="mb-8 space-y-3">
        <h2 className="label-overline">Details</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
        />
        <input
          value={homeGround}
          onChange={(e) => setHomeGround(e.target.value)}
          placeholder="Home ground"
          className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
        />
        <input
          type="color"
          value={primaryColor}
          onChange={(e) => setPrimaryColor(e.target.value)}
          aria-label="Primary colour"
          className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)]"
        />
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save details'}
        </Button>
      </form>

      <section className="mb-8">
        <h2 className="label-overline mb-2">Member roles</h2>
        <ul className="space-y-2">
          {(squad ?? []).map((row) => (
            <li key={row.id} className="panel flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1 truncate">{row.player.full_name}</span>
              <select
                value={row.team_role}
                onChange={(e) => setMemberRole(row.id, e.target.value as TeamRole)}
                disabled={!perms.isOwner && row.team_role === 'owner'}
                className="h-9 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 text-[14px]"
              >
                {Object.entries(TEAM_ROLE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {perms.isOwner && row.team_role !== 'owner' && row.player.profile_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => transferOwnership(row.player.profile_id!)}
                >
                  Make owner
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {perms.isOwner && (
        <section>
          <h2 className="label-overline mb-2">Danger zone</h2>
          <Button variant="danger" onClick={() => archive(!team.is_archived)}>
            {team.is_archived ? 'Restore team' : 'Archive team'}
          </Button>
        </section>
      )}
    </div>
  );
}
