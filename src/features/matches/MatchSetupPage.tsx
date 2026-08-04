import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { pluralise } from '@/lib/format';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonText } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { classifyError, userMessage } from '@/lib/errors';
import { useSquad, useTeamPermissions } from '@/features/teams/hooks';
import { useMatch, useMatchSquad } from './hooks';
import { setupProgress } from './setupProgress';
import type { MatchConfig } from '@/engine/types';

/**
 * docs/11-SCREENS-AND-ROUTES.md § 5 — `/matches/:matchId/setup`. Toss, then
 * squad selection (captain + keeper) for both teams.
 *
 * Openers and the opening bowler are deliberately NOT here. docs/11 § 5 used
 * to say they were, contradicting docs/05 § 2/5 where `AWAITING_OPENERS` and
 * `AWAITING_BOWLER` are pad modes; settled in favour of the pad on 2026-08-03
 * and docs/11 now says so. Two reasons: openers named at the toss are usually
 * wrong by the first ball, and there is no `innings` row before
 * `start_innings` to hold the answer anyway.
 */
export function MatchSetupPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: match, isLoading } = useMatch(matchId);
  const permsA = useTeamPermissions(match?.team_a_id);
  const permsB = useTeamPermissions(match?.team_b_id);
  // Already-saved squads. `useMatchSquad` has existed since Phase 4 and this
  // screen never read it, so setup could not tell you what it had already
  // stored — reopening it showed two empty lists and no way to know the work
  // was done. That is what made setup feel like it had to be done twice.
  const savedA = useMatchSquad(matchId, match?.team_a_id);
  const savedB = useMatchSquad(matchId, match?.team_b_id);
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
  const teamAName = (match.team_a as unknown as { name?: string } | null)?.name ?? 'Team A';
  const teamBName = (match.team_b as unknown as { name?: string } | null)?.name ?? 'Team B';
  const { aReady, bReady, canStart, blocker } = setupProgress({
    tossWinnerTeamId: match.toss_winner_team_id,
    squadACount: savedA.data?.length ?? 0,
    squadBCount: savedB.data?.length ?? 0,
    teamAName,
    teamBName,
  });

  async function refetchMatch() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['match', matchId] }),
      queryClient.invalidateQueries({ queryKey: ['matchSquad', matchId] }),
    ]);
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('start_innings', { p_match_id: matchId! });
    setBusy(false);
    if (rpcError) return setError(userMessage(classifyError(rpcError)));
    // Straight to the pad. Sending the scorer back to the hub was the other
    // half of the loop: the hub's next button is "Continue setup", which is
    // where they had just come from.
    navigate(`/matches/${matchId}/score`);
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="mb-4 text-[var(--text-heading-lg)] font-bold">Match setup</h1>

      {error && (
        <p role="alert" className="mb-4 text-[var(--danger)]">
          {error}
        </p>
      )}

      {/* Setup is three things and it was never possible to see which were
          done. The squad sections are below the fold on a phone, so somebody
          who filled in Team A reasonably assumed they had finished. */}
      <ul className="panel mb-6 space-y-1 p-3 text-[var(--text-body-sm)]">
        <SetupStep done={tossSet} label="Toss" />
        <SetupStep done={aReady} label={`${teamAName} squad`} />
        <SetupStep done={bReady} label={`${teamBName} squad`} />
      </ul>

      <section className="mb-6">
        <h2 className="label-overline mb-2">Toss</h2>
        {tossSet ? (
          <p className="text-[var(--text-secondary)]">
            {match.toss_winner_team_id === match.team_a_id ? teamAName : teamBName} won the toss and
            chose to {match.toss_decision}.
          </p>
        ) : (
          <TossForm
            matchId={matchId!}
            match={match}
            teamAName={teamAName}
            teamBName={teamBName}
            onDone={refetchMatch}
          />
        )}
      </section>

      <section className="mb-6">
        <h2 className="label-overline mb-2">{teamAName} — playing squad</h2>
        <SquadEditor
          matchId={matchId!}
          teamId={match.team_a_id}
          squadSize={config.playersPerSide}
          onSaved={refetchMatch}
        />
      </section>

      <section className="mb-6">
        <h2 className="label-overline mb-2">{teamBName} — playing squad</h2>
        <SquadEditor
          matchId={matchId!}
          teamId={match.team_b_id}
          squadSize={config.playersPerSide}
          onSaved={refetchMatch}
        />
      </section>

      {/* Gated on all three, not just the toss. The server refuses without
          both squads (XI_REQUIRED) and refusing here says so before the round
          trip — but the server stays the authority, this only mirrors what it
          would answer. */}
      <Button
        variant="primary"
        fullWidth
        disabled={!canStart || busy}
        onClick={handleStart}
        hapticKind="select"
      >
        {busy ? 'Starting…' : 'Start match'}
      </Button>
      {blocker && (
        <p className="mt-2 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          {blocker}
        </p>
      )}
    </div>
  );
}

// Names, not "Team A"/"Team B". A captain at a ground knows who won the toss
// by their club's name; the A/B labelling is a database detail that had leaked
// onto the one screen where two real sides are standing in front of you.
function TossForm({
  matchId,
  match,
  teamAName,
  teamBName,
  onDone,
}: {
  matchId: string;
  match: { team_a_id: string; team_b_id: string };
  teamAName: string;
  teamBName: string;
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
          {teamAName} won
        </Button>
        <Button variant={winner === 'b' ? 'primary' : 'secondary'} onClick={() => setWinner('b')}>
          {teamBName} won
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
  const { data: existing } = useMatchSquad(matchId, teamId);
  const [selected, setSelected] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState('');
  const [keeperId, setKeeperId] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Seed from what is already saved. Without this, reopening setup showed an
  // empty list for a squad that was stored perfectly well, so the only way to
  // "fix" it was to pick everyone again — and saving replaces the whole row
  // set, so a half-remembered re-pick would quietly shrink the squad.
  // Runs once: after that the checkboxes are the user's, not the server's.
  useEffect(() => {
    if (hydrated || !existing || existing.length === 0) return;
    setSelected(existing.map((row) => row.player_id));
    setCaptainId(existing.find((row) => row.is_captain)?.player_id ?? '');
    setKeeperId(existing.find((row) => row.is_wicket_keeper)?.player_id ?? '');
    setHydrated(true);
  }, [existing, hydrated]);
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
    if (rpcError) return setError(userMessage(classifyError(rpcError)));
    setSaved(true);
    onSaved();
  }

  if (isLoading) return <SkeletonText lines={3} />;

  return (
    <div className="space-y-2">
      <p className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        {selected.length} / {squadSize} selected
      </p>
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
      {/* Above the Save button, not above the list. It used to sit under the
          "1 / 2 selected" line, so every tick and untick inserted or removed a
          two-line block and shoved the whole list up and down under the
          reader's thumb. Here it only moves the one button below it. */}
      {selected.length > 0 && selected.length < squadSize && (
        <p className="text-[var(--text-body-sm)] text-[var(--warning)]">
          This match is set up for {squadSize} a side. With {selected.length}, the innings will
          still need {pluralise(squadSize - 1, 'wicket')} to end — change players per side if the
          whole match is smaller.
        </p>
      )}
      {/* Accent while there is something to save, so it reads as the next
          thing to do; a quiet success state once it is done, so it reads as
          "nothing needed here". It used to be `secondary` in both states —
          indistinguishable from the page furniture, and giving no signal that
          a squad had actually been stored. */}
      <Button
        variant={saved ? 'secondary' : 'primary'}
        fullWidth
        disabled={!canSave || busy}
        hapticKind="select"
        onClick={submit}
        className={saved ? 'border border-[var(--success)] text-[var(--success)]' : undefined}
      >
        {busy ? 'Saving…' : saved ? '✓ Squad saved' : 'Save team'}
      </Button>
    </div>
  );
}

function SetupStep({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className={done ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}>
        {done ? '\u2713' : '\u25cb'}
      </span>
      <span className={done ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}>
        {label}
      </span>
      <span className="sr-only">{done ? ' — done' : ' — still to do'}</span>
    </li>
  );
}
