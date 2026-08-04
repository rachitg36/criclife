import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, MoreVertical } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { PLAYER_ROLE_LABEL, TEAM_ROLE_LABEL } from '@/features/players/roleLabels';
import { useSquad, useTeam, useTeamPermissions, type SquadRow } from './hooks';
import { TeamHeader } from './TeamHeader';
import type { Database } from '@/types/database';

type PlayerRole = Database['public']['Enums']['player_role'];

/** docs/11-SCREENS-AND-ROUTES.md § 3 — `/teams/:teamId` and `/teams/:teamId/squad`. */
export function TeamSquadPage() {
  const { teamId } = useParams<{ teamId: string }>();

  const { data: team, isLoading: teamLoading } = useTeam(teamId);
  const { data: squad, isLoading: squadLoading } = useSquad(teamId);
  const perms = useTeamPermissions(teamId);

  if (teamLoading) {
    return (
      <div className="px-4 pt-4 pb-8">
        <SkeletonText lines={4} />
      </div>
    );
  }

  if (!team) {
    return <div className="px-4 pt-8 text-[var(--text-secondary)]">Team not found.</div>;
  }

  const grouped = groupByRole(squad ?? []);

  return (
    <div className="pb-8">
      <TeamHeader team={team} isAdmin={perms.isAdmin} />

      <div className="px-4 pt-4">
        {perms.isManager && (
          <Link to={`/teams/${team.id}/add-player`} className="mb-4 block">
            <Button variant="secondary" fullWidth hapticKind="select">
              <Plus size={16} aria-hidden /> Add player
            </Button>
          </Link>
        )}

        {squadLoading ? (
          <SkeletonText lines={5} />
        ) : squad && squad.length > 0 ? (
          <div className="space-y-6">
            {grouped.map(([role, rows]) => (
              <section key={role}>
                <h2 className="label-overline mb-2">{PLAYER_ROLE_LABEL[role]}</h2>
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <SquadRowItem
                      key={row.id}
                      row={row}
                      teamId={team.id}
                      isManager={perms.isManager}
                      isSelf={row.player_id === perms.myPlayerId}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="panel p-5 text-center text-[var(--text-secondary)]">
            No players on the squad yet.
          </div>
        )}
      </div>
    </div>
  );
}

function groupByRole(rows: SquadRow[]): [PlayerRole, SquadRow[]][] {
  const order: PlayerRole[] = ['wicket_keeper', 'wk_batter', 'batter', 'all_rounder', 'bowler'];
  const map = new Map<PlayerRole, SquadRow[]>();
  for (const row of rows) {
    const role = row.player.primary_role;
    if (!map.has(role)) map.set(role, []);
    map.get(role)!.push(row);
  }
  return order.filter((role) => map.has(role)).map((role) => [role, map.get(role)!]);
}

function SquadRowItem({
  row,
  teamId,
  isManager,
  isSelf,
}: {
  row: SquadRow;
  teamId: string;
  isManager: boolean;
  isSelf: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { player } = row;

  return (
    <li className="panel p-3">
      <div className="flex items-center gap-3">
        <Link to={`/players/${player.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar photoUrl={player.photo_url} name={player.full_name} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">
              {player.full_name}
              {player.jersey_number != null && (
                <span className="ml-1 text-[var(--text-tertiary)]">#{player.jersey_number}</span>
              )}
            </div>
            <div className="flex gap-3 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
              <span>Rank –</span>
              <span>Form –</span>
              {row.team_role !== 'player' && <span>{TEAM_ROLE_LABEL[row.team_role]}</span>}
            </div>
          </div>
        </Link>

        {isSelf ? (
          <Link to={`/players/${player.id}/edit`}>
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          </Link>
        ) : isManager ? (
          <button
            type="button"
            aria-label={`Actions for ${player.full_name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-2)]"
          >
            <MoreVertical size={18} aria-hidden />
          </button>
        ) : null}
      </div>

      {menuOpen && isManager && !isSelf && (
        <ManagerActions teamId={teamId} row={row} onClose={() => setMenuOpen(false)} />
      )}
    </li>
  );
}

function ManagerActions({
  teamId,
  row,
  onClose,
}: {
  teamId: string;
  row: SquadRow;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'menu' | 'suggest' | 'edit' | 'remove'>('menu');
  const [suggestedRole, setSuggestedRole] = useState<PlayerRole>('all_rounder');
  const [note, setNote] = useState('');
  const [fullName, setFullName] = useState(row.player.full_name);
  const [jerseyNumber, setJerseyNumber] = useState(row.player.jersey_number?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['squad', teamId] });
  }

  async function submitSuggestion() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('suggest_role_change', {
      p_player_id: row.player_id,
      p_suggested_role: suggestedRole,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    setDone('Suggestion sent — the player will see it on their profile.');
  }

  async function submitEdit() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('update_player_admin_fields', {
      p_player_id: row.player_id,
      p_full_name: fullName.trim(),
      p_jersey_number: jerseyNumber === '' ? null : Number(jerseyNumber),
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    await invalidate();
    onClose();
  }

  async function submitRemove() {
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('team_members')
      .update({ left_at: new Date().toISOString() })
      .eq('id', row.id);
    setBusy(false);
    if (updateError) return setError(updateError.message);
    await invalidate();
    onClose();
  }

  if (done) {
    return <p className="mt-3 text-[var(--text-body-sm)] text-[var(--success)]">{done}</p>;
  }

  return (
    <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
      {error && (
        <p role="alert" className="mb-2 text-[var(--text-body-sm)] text-[var(--danger)]">
          {error}
        </p>
      )}

      {mode === 'menu' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setMode('suggest')}>
            Suggest role change
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMode('edit')}>
            Edit name / number
          </Button>
          <Button variant="danger" size="sm" onClick={() => setMode('remove')}>
            Remove from team
          </Button>
        </div>
      )}

      {mode === 'suggest' && (
        <div className="space-y-2">
          <select
            value={suggestedRole}
            onChange={(e) => setSuggestedRole(e.target.value as PlayerRole)}
            className="h-10 w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 text-[14px]"
          >
            {Object.entries(PLAYER_ROLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="h-10 w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 text-[14px]"
          />
          <Button variant="primary" size="sm" disabled={busy} onClick={submitSuggestion}>
            {busy ? 'Sending…' : 'Send suggestion'}
          </Button>
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-2">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-10 w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 text-[14px]"
          />
          <input
            value={jerseyNumber}
            onChange={(e) => setJerseyNumber(e.target.value.replace(/\D/g, ''))}
            placeholder="Jersey number"
            className="h-10 w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 text-[14px]"
          />
          <Button variant="primary" size="sm" disabled={busy} onClick={submitEdit}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}

      {mode === 'remove' && (
        <div className="space-y-2">
          <p className="text-[var(--text-body-sm)]">Remove {row.player.full_name} from the team?</p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" disabled={busy} onClick={submitRemove}>
              {busy ? 'Removing…' : 'Confirm remove'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMode('menu')}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
