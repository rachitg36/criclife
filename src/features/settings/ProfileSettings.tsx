import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { classifyError, userMessage } from '@/lib/errors';
import { useAuth } from '@/features/auth/authContext';
import { useProfile } from '@/features/auth/useProfile';
import { useMyPlayer } from '@/features/teams/hooks';

/**
 * `/settings/profile` — who you are to the app, as opposed to who you are on
 * the field.
 *
 * It was a `<Placeholder>` reading "Your profile ships in Phase 3", and it is
 * the *first* row of the Settings list, so it was the most-tapped dead end in
 * the app.
 *
 * The split matters and the screen says it out loud: your **profile** is the
 * account (name, photo, email), your **player** is the cricketer (role,
 * batting hand, bowling style). They are separate rows in separate tables
 * precisely because one person can be a scorer with no player record, and
 * because docs/03 § 2.3 gives only the player themself the right to set their
 * playing role. So role editing lives on `/players/:id/edit` and this page
 * links to it rather than duplicating it.
 *
 * A photo upload is deliberately absent: it needs a Supabase Storage bucket
 * that does not exist yet. Google sign-in already carries a picture through
 * `handle_new_user`, which is why an avatar can appear here with nothing to
 * upload it.
 */
export function ProfileSettings() {
  const { session } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { data: myPlayer } = useMyPlayer();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setHandle(profile.handle ?? '');
  }, [profile]);

  if (isLoading) {
    return (
      <div className="p-3">
        <SkeletonText lines={5} />
      </div>
    );
  }
  if (!profile || !session) {
    return <div className="px-4 pt-8 text-[var(--text-secondary)]">Not signed in.</div>;
  }

  const dirty =
    displayName.trim() !== profile.display_name || handle.trim() !== (profile.handle ?? '');

  async function save() {
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        // Empty means "no handle", not an empty string — `handle` is unique,
        // and two people saving '' would collide on the index.
        handle: handle.trim() || null,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (error) return setMessage(userMessage(classifyError(error)));
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <section className="panel rounded-[var(--r-lg)] p-4">
        <div className="flex items-center gap-4">
          <Avatar name={profile.display_name} photoUrl={profile.avatar_url} size={56} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[var(--text-heading-sm)] font-semibold">
              {profile.display_name}
            </div>
            <div className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
              {profile.email ?? session.user.email ?? 'No email on file'}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">
          Your photo comes from your sign-in provider. Uploading your own needs a storage bucket
          that is not set up yet.
        </p>
      </section>

      <section className="panel rounded-[var(--r-lg)] p-4">
        <h2 className="text-[var(--text-heading-sm)] font-semibold">Details</h2>
        <label className="mt-3 block text-[12px] text-[var(--text-secondary)]">
          Display name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            className="mt-1 w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-2 text-[var(--text-body)]"
          />
        </label>
        <label className="mt-3 block text-[12px] text-[var(--text-secondary)]">
          Handle <span className="text-[var(--text-tertiary)]">(optional, must be unique)</span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={30}
            placeholder="e.g. rachit"
            className="mt-1 w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-2 text-[var(--text-body)]"
          />
        </label>
        <div className="mt-4">
          <Button
            variant={dirty ? 'primary' : 'secondary'}
            fullWidth
            hapticKind="select"
            disabled={saving || !dirty || displayName.trim() === ''}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </Button>
        </div>
        {message && (
          <p className="mt-2 text-[var(--text-body-sm)] text-[var(--danger)]">{message}</p>
        )}
      </section>

      <section className="panel overflow-hidden rounded-[var(--r-lg)] p-0">
        <h2 className="px-4 pt-4 text-[var(--text-heading-sm)] font-semibold">
          Your player record
        </h2>
        <p className="px-4 pt-1 pb-3 text-[11px] text-[var(--text-tertiary)]">
          Separate from your account on purpose — only you can set your own playing role.
        </p>
        {myPlayer ? (
          <ul>
            <RowLink to={`/players/${myPlayer.id}`} label="View your player profile" />
            <RowLink
              to={`/players/${myPlayer.id}/edit`}
              label="Role, batting hand, bowling style"
            />
          </ul>
        ) : (
          <ul>
            <RowLink
              to="/players/claim"
              label="Claim your player — you don't have one linked yet"
            />
          </ul>
        )}
      </section>
    </div>
  );
}

function RowLink({ to, label }: { to: string; label: string }) {
  return (
    <li>
      <Link
        to={to}
        className="press flex items-center gap-3 border-t border-[var(--border-subtle)] px-4 py-3"
      >
        <span className="min-w-0 flex-1 text-[var(--text-body)]">{label}</span>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-[var(--text-tertiary)]" />
      </Link>
    </li>
  );
}
