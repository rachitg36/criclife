import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/authContext';
import { useProfile } from '@/features/auth/useProfile';
import {
  BATTING_HAND_LABEL,
  BOWLING_STYLE_LABEL,
  PLAYER_ROLE_LABEL,
} from '@/features/players/roleLabels';
import { usePendingSuggestions, usePlayer } from './hooks';
import type { Database } from '@/types/database';

type PlayerRole = Database['public']['Enums']['player_role'];
type BattingHand = Database['public']['Enums']['batting_hand'];
type BowlingStyle = Database['public']['Enums']['bowling_style'];

/**
 * docs/11-SCREENS-AND-ROUTES.md § 4 — `/players/:playerId/edit`, self or
 * Super Admin only. docs/03 § 2.3 — the screen that satisfies "players
 * should have permissions to update their own roles."
 */
export function PlayerEditPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const { data: player, isLoading } = usePlayer(playerId);
  const { data: suggestions } = usePendingSuggestions(playerId);
  const queryClient = useQueryClient();

  const [primaryRole, setPrimaryRole] = useState<PlayerRole>('batter');
  const [secondaryRole, setSecondaryRole] = useState<PlayerRole | ''>('');
  const [battingHand, setBattingHand] = useState<BattingHand>('right');
  const [bowlingStyle, setBowlingStyle] = useState<BowlingStyle>('none');
  const [shortName, setShortName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!player) return;
    setPrimaryRole(player.primary_role);
    setSecondaryRole(player.secondary_role ?? '');
    setBattingHand(player.batting_hand);
    setBowlingStyle(player.bowling_style ?? 'none');
    setShortName(player.short_name ?? '');
    setBio(player.bio ?? '');
  }, [player]);

  if (isLoading) {
    return (
      <div className="px-4 pt-4 pb-8">
        <SkeletonText lines={5} />
      </div>
    );
  }

  if (!player) {
    return <div className="px-4 pt-8 text-[var(--text-secondary)]">Player not found.</div>;
  }

  const isSelf = !!session && player.profile_id === session.user.id;
  const isSuperAdmin = !!profile?.is_super_admin;
  const canEdit = isSelf || isSuperAdmin;
  const isLocked = player.role_locked_by_admin && !isSuperAdmin;

  if (!canEdit) {
    return (
      <div className="px-4 pt-8">
        <p className="text-[var(--text-secondary)]">
          You can't edit {player.full_name}'s profile — only they can set their own playing role.
        </p>
        <p className="mt-2 text-[var(--text-secondary)]">
          If you manage a team {player.full_name} belongs to, open the squad page and use{' '}
          <strong>Suggest role change</strong> instead.
        </p>
        <Link to={`/players/${player.id}`} className="mt-4 inline-block underline">
          Back to profile
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const { data, error: updateError } = await supabase
      .from('players')
      .update({
        primary_role: primaryRole,
        secondary_role: secondaryRole || null,
        batting_hand: battingHand,
        bowling_style: bowlingStyle,
        short_name: shortName.trim() || null,
        bio: bio.trim() || null,
      })
      .eq('id', playerId!)
      .select()
      .single();

    setSaving(false);
    if (updateError) return setError(updateError.message);
    if (!data) return setError("This role is locked and couldn't be changed.");
    await queryClient.invalidateQueries({ queryKey: ['player', playerId] });
    setSaved(true);
  }

  async function respond(suggestionId: string, accept: boolean) {
    setRespondingTo(suggestionId);
    setError(null);
    const { error: rpcError } = await supabase.rpc('respond_to_role_suggestion', {
      p_suggestion_id: suggestionId,
      p_accept: accept,
    });
    setRespondingTo(null);
    if (rpcError) return setError(rpcError.message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['player', playerId] }),
      queryClient.invalidateQueries({ queryKey: ['roleSuggestions', playerId] }),
    ]);
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="mb-4 text-[var(--text-heading-lg)] font-bold">Edit your profile</h1>

      {suggestions && suggestions.length > 0 && (
        <section className="mb-6 space-y-2">
          <h2 className="label-overline">Pending suggestions</h2>
          {suggestions.map((s) => (
            <div key={s.id} className="panel p-3">
              <p>
                Suggested role: <strong>{PLAYER_ROLE_LABEL[s.suggested_role!]}</strong>
              </p>
              {s.note && (
                <p className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">{s.note}</p>
              )}
              <div className="mt-2 flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={respondingTo === s.id}
                  onClick={() => respond(s.id, true)}
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={respondingTo === s.id}
                  onClick={() => respond(s.id, false)}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {isLocked && (
        <div className="panel mb-4 flex items-start gap-2 p-3 text-[var(--warning)]">
          <Lock size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Your role is locked by an administrator. Only a Super Admin can change it while it's
            locked.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <fieldset disabled={isLocked} className="space-y-3 disabled:opacity-50">
          <Field label="Primary role">
            <select
              value={primaryRole}
              onChange={(e) => setPrimaryRole(e.target.value as PlayerRole)}
              className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
            >
              {Object.entries(PLAYER_ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Secondary role">
            <select
              value={secondaryRole}
              onChange={(e) => setSecondaryRole(e.target.value as PlayerRole | '')}
              className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
            >
              <option value="">None</option>
              {Object.entries(PLAYER_ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Batting hand">
            <select
              value={battingHand}
              onChange={(e) => setBattingHand(e.target.value as BattingHand)}
              className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
            >
              {Object.entries(BATTING_HAND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Bowling style">
            <select
              value={bowlingStyle}
              onChange={(e) => setBowlingStyle(e.target.value as BowlingStyle)}
              className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
            >
              {Object.entries(BOWLING_STYLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Short name">
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder="R. Sharma"
              className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
            />
          </Field>

          <Field label="Bio">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] px-3 text-[15px] outline-none focus:border-[var(--accent)]"
            />
          </Field>
        </fieldset>

        {error && (
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" fullWidth disabled={saving || isLocked}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </Button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}
