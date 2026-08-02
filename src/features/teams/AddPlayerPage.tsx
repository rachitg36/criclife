import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { supabase } from '@/lib/supabase';
import { PLAYER_ROLE_LABEL } from '@/features/players/roleLabels';
import { useTeam, useTeamPermissions } from './hooks';
import type { Database } from '@/types/database';

type PlayerRole = Database['public']['Enums']['player_role'];
type ProfileMatch = {
  id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
};

/** docs/11-SCREENS-AND-ROUTES.md § 3 — `/teams/:teamId/add-player`. */
export function AddPlayerPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: team } = useTeam(teamId);
  const perms = useTeamPermissions(teamId);
  const [tab, setTab] = useState<'shadow' | 'invite'>('shadow');

  if (!perms.isManager) {
    return (
      <div className="px-4 pt-8 text-[var(--text-secondary)]">
        Only a manager of {team?.name ?? 'this team'} can add players.
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="mb-4 text-[var(--text-heading-lg)] font-bold">Add a player</h1>

      <div className="mb-4 flex gap-2">
        <Button
          variant={tab === 'shadow' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setTab('shadow')}
        >
          Create a shadow player
        </Button>
        <Button
          variant={tab === 'invite' ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setTab('invite')}
        >
          Invite an existing user
        </Button>
      </div>

      {tab === 'shadow' ? (
        <ShadowPlayerForm teamId={teamId!} />
      ) : (
        <InviteExistingForm teamId={teamId!} />
      )}
    </div>
  );
}

function ShadowPlayerForm({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<PlayerRole>('batter');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ fullName: string; claimCode: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setBusy(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('create_shadow_player', {
      p_team_id: teamId,
      p_full_name: fullName.trim(),
      p_primary_role: role,
    });

    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    await queryClient.invalidateQueries({ queryKey: ['squad', teamId] });
    setCreated({ fullName: data.full_name, claimCode: data.claim_code! });
    setFullName('');
  }

  if (created) {
    const link = `${window.location.origin}/onboarding?claimCode=${created.claimCode}`;
    return (
      <div className="panel space-y-3 p-4">
        <p>
          <strong>{created.fullName}</strong> was added to the squad.
        </p>
        <p className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Share this claim code or link so they can take ownership of the record:
        </p>
        <div className="rounded-[var(--r-sm)] bg-[var(--surface-2)] p-3 font-mono text-[15px]">
          {created.claimCode}
        </div>
        <div className="truncate rounded-[var(--r-sm)] bg-[var(--surface-2)] p-3 text-[13px] text-[var(--text-secondary)]">
          {link}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setCreated(null)}>
          Add another player
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Full name"
        className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
        required
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as PlayerRole)}
        className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px]"
      >
        {Object.entries(PLAYER_ROLE_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" fullWidth disabled={busy || !fullName.trim()}>
        {busy ? 'Creating…' : 'Create shadow player + claim code'}
      </Button>
    </form>
  );
}

function InviteExistingForm({ teamId }: { teamId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('search_profiles', {
      p_query: query.trim(),
    });
    setSearching(false);
    if (rpcError) return setError(rpcError.message);
    setResults(data ?? []);
  }

  async function handleAdd(profileId: string) {
    setAdding(profileId);
    setError(null);
    const { error: rpcError } = await supabase.rpc('add_existing_profile_to_team', {
      p_team_id: teamId,
      p_profile_id: profileId,
    });
    setAdding(null);
    if (rpcError) return setError(rpcError.message);
    await queryClient.invalidateQueries({ queryKey: ['squad', teamId] });
    navigate(`/teams/${teamId}/squad`);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by handle or email"
          className="h-11 flex-1 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
        />
        <Button type="submit" variant="secondary" disabled={searching || !query.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      )}

      {results.length === 0 ? (
        <p className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          No matches yet. Search finds people by their exact handle or email.
        </p>
      ) : (
        <ul className="space-y-2">
          {results.map((profile) => (
            <li key={profile.id} className="panel flex items-center gap-3 p-3">
              <Avatar photoUrl={profile.avatar_url} name={profile.display_name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{profile.display_name}</div>
                {profile.handle && (
                  <div className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
                    @{profile.handle}
                  </div>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={adding === profile.id}
                onClick={() => handleAdd(profile.id)}
              >
                {adding === profile.id ? 'Adding…' : 'Add'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
        Can't find them? Use the "Create a shadow player" tab instead — they can claim it later.
      </p>
    </div>
  );
}
