import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonText } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { useSquad, useTeamPermissions } from '@/features/teams/hooks';
import { useMatch } from './hooks';
import type { MatchConfig } from '@/engine/types';

/**
 * docs/11-SCREENS-AND-ROUTES.md § 5 — `/matches/:matchId/setup`. Toss, then
 * squad selection (captain + keeper) for both teams. Picking openers and the
 * opening bowler stays with Phase 5's scorer pad — the `innings` table has
 * no column to hold that pre-first-ball (see the migration's own note).
 */
export function MatchSetupPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: match, isLoading } = useMatch(matchId);
  const permsA = useTeamPermissions(match?.team_a_id);
  const permsB = useTeamPermissions(match?.team_b_id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isManager = permsA.isManager || permsB.isManager;

  if (isLoading) {
    return (
      <div className="px-4 pt-4 pb-8">
        <SkeletonText lines={5} />
      </div>
    );
  }
  if (!match) {
    return <div className="px-4 pt-8 text-[var(--text-secondary)]">Match not found.</div>;
  }
  if (!isManager) {
    return (
      <div className="px-4 pt-8 text-[var(--text-secondary)]">
        Only a manager of one of these teams can set up this match.
      </div>
    );
  }

  const config = match.config as unknown as MatchConfig;
  const tossSet = !!match.toss_winner_team_id;

  async function refetchMatch() {
    await queryClient.invalidateQueries({ queryKey: ['match', matchId] });
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('start_innings', { p_match_id: matchId! });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    navigate(`/matches/${matchId}`);
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="mb-4 text-[var(--text-heading-lg)] font-bold">Match setup</h1>

      {error && (
        <p role="alert" className="mb-4 text-[var(--danger)]">
          {error}
        </p>
      )}

      <section className="mb-6">
        <h2 className="label-overline mb-2">Toss</h2>
        {tossSet ? (
          <p className="text-[var(--text-secondary)]">
            {match.toss_winner_team_id === match.team_a_id ? 'Team A' : 'Team B'} won the toss and
            chose to {match.toss_decision}.
          </p>
        ) : (
          <TossForm matchId={matchId!} match={match} onDone={refetchMatch} />
        )}
      </section>

      <section className="mb-6">
        <h2 className="label-overline mb-2">Team A — playing squad</h2>
        <SquadEditor
          matchId={matchId!}
          teamId={match.team_a_id}
          squadSize={config.playersPerSide}
          onSaved={refetchMatch}
        />
      </section>

      <section className="mb-6">
        <h2 className="label-overline mb-2">Team B — playing squad</h2>
        <SquadEditor
          matchId={matchId!}
          teamId={match.team_b_id}
          squadSize={config.playersPerSide}
          onSaved={refetchMatch}
        />
      </section>

      <Button variant="primary" fullWidth disabled={!tossSet || busy} onClick={handleStart}>
        {busy ? 'Starting…' : 'Start match'}
      </Button>
    </div>
  );
}

function TossForm({
  matchId,
  match,
  onDone,
}: {
  matchId: string;
  match: { team_a_id: string; team_b_id: string };
  onDone: () => void;
}) {
  const [winner, setWinner] = useState<'a' | 'b' | ''>('');
  const [decision, setDecision] = useState<'bat' | 'bowl'>('bat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!winner) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('set_toss', {
      p_match_id: matchId,
      p_winner_team_id: winner === 'a' ? match.team_a_id : match.team_b_id,
      p_decision: decision,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    onDone();
  }

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex gap-2">
        <Button variant={winner === 'a' ? 'primary' : 'secondary'} onClick={() => setWinner('a')}>
          Team A won
        </Button>
        <Button variant={winner === 'b' ? 'primary' : 'secondary'} onClick={() => setWinner('b')}>
          Team B won
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          variant={decision === 'bat' ? 'primary' : 'secondary'}
          onClick={() => setDecision('bat')}
        >
          Chose to bat
        </Button>
        <Button
          variant={decision === 'bowl' ? 'primary' : 'secondary'}
          onClick={() => setDecision('bowl')}
        >
          Chose to bowl
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      )}
      <Button variant="primary" disabled={!winner || busy} onClick={submit}>
        {busy ? 'Saving…' : 'Confirm toss'}
      </Button>
    </div>
  );
}

function SquadEditor({
  matchId,
  teamId,
  squadSize,
  onSaved,
}: {
  matchId: string;
  teamId: string;
  squadSize: number;
  onSaved: () => void;
}) {
  const { data: squad, isLoading } = useSquad(teamId);
  const [selected, setSelected] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState('');
  const [keeperId, setKeeperId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSave = useMemo(
    () => selected.length > 0 && selected.length <= squadSize,
    [selected, squadSize]
  );

  function toggle(playerId: string) {
    setSaved(false);
    setSelected((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : prev.length < squadSize
          ? [...prev, playerId]
          : prev
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('set_playing_xi', {
      p_match_id: matchId,
      p_team_id: teamId,
      p_player_ids: selected,
      p_captain_id: captainId || null,
      p_keeper_id: keeperId || null,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    setSaved(true);
    onSaved();
  }

  if (isLoading) return <SkeletonText lines={3} />;

  return (
    <div className="space-y-2">
      <p className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        {selected.length} / {squadSize} selected
      </p>
      {/* `squadSize` is the match's own `playersPerSide`, not eleven — a side
          can be any size from two up. Picking fewer than that is allowed,
          because sides do turn up short, but it is worth saying out loud: the
          engine ends an innings at `playersPerSide - 1` wickets, so a side
          picked short cannot actually be bowled out. */}
      {selected.length > 0 && selected.length < squadSize && (
        <p className="text-[var(--text-body-sm)] text-[var(--warning)]">
          This match is set up for {squadSize} a side. With {selected.length}, the innings will
          still need {squadSize - 1} wickets to end — change players per side if the whole match is
          smaller.
        </p>
      )}
      <ul className="space-y-2">
        {(squad ?? []).map((row) => {
          const isSelected = selected.includes(row.player_id);
          return (
            <li key={row.id} className="panel p-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggle(row.player_id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <input type="checkbox" checked={isSelected} readOnly className="h-5 w-5" />
                  <Avatar photoUrl={row.player.photo_url} name={row.player.full_name} size={32} />
                  <span className="min-w-0 flex-1 truncate">{row.player.full_name}</span>
                </button>
                {isSelected && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant={captainId === row.player_id ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setCaptainId(captainId === row.player_id ? '' : row.player_id)}
                    >
                      C
                    </Button>
                    <Button
                      variant={keeperId === row.player_id ? 'primary' : 'ghost'}
                      size="sm"
                      onClick={() => setKeeperId(keeperId === row.player_id ? '' : row.player_id)}
                    >
                      WK
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      )}
      <Button variant="secondary" disabled={!canSave || busy} onClick={submit}>
        {busy ? 'Saving…' : saved ? 'Saved' : 'Save team'}
      </Button>
    </div>
  );
}
