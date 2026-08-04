import { useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/authContext';
import { classifyError, userMessage } from '@/lib/errors';

/**
 * `/settings/data` — docs/12 Phase 9's "Data export, account deletion".
 *
 * Export gathers everything the signed-in user can legitimately read about
 * themselves and hands it over as JSON. It deliberately runs through the
 * ordinary client, so RLS decides what is in the file — an export that used
 * elevated rights would be a way to read past the policies.
 *
 * Deletion is **not** performed here. Removing an `auth.users` row needs the
 * service role key, which must never reach the browser (docs/01 § 8), and a
 * player's deliveries are referenced by an append-only log that other people's
 * scorecards depend on. So this raises a request and says plainly what will
 * and will not happen, rather than pretending to a one-click erase it cannot
 * deliver. See HANDOFF § 6.1.
 */
export function DataSettings() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [purgeText, setPurgeText] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    void supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', userId)
      .single()
      .then(({ data }) => setIsSuperAdmin(data?.is_super_admin === true));
  }, [userId]);

  async function purgeMatches() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('purge_match_data', { p_confirm: 'DELETE' });
    setBusy(false);
    setPurgeText('');
    // Raw, not classified. This is a super-admin-only debug tool; the whole
    // value of a failure here is the server's exact words, and "something went
    // wrong" has already cost one round trip.
    if (error) return setMessage(`Purge failed: ${error.message}`);
    const summary = data as { matches?: number; deliveries?: number } | null;
    setMessage(
      `Cleared ${summary?.matches ?? 0} matches and ${summary?.deliveries ?? 0} balls. ` +
        'Reload to see the change.'
    );
  }

  async function exportData() {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    try {
      const [profile, players, teams, grants] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('players').select('*').eq('profile_id', userId),
        supabase.from('teams').select('*').eq('owner_id', userId),
        supabase.from('scoring_grants').select('*').eq('grantee_profile_id', userId),
      ]);

      const bundle = {
        exportedAt: new Date().toISOString(),
        note:
          'Everything CricLife holds that this account can read about itself. ' +
          'Match and delivery records are shared data and are not included; they ' +
          'belong to the matches they were scored in.',
        profile: profile.data,
        players: players.data ?? [],
        teamsOwned: teams.data ?? [],
        scoringGrants: grants.data ?? [],
      };

      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `criclife-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Export downloaded.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    if (!userId) return;
    setBusy(true);
    setMessage(null);
    // Was a direct insert into `notifications`, which has no INSERT policy —
    // deny-by-default refused it every time. The missing policy is not the
    // fix: a client that can write notifications can write anything to anyone.
    const { error } = await supabase.rpc('request_account_deletion', { p_reason: null });
    setBusy(false);
    setConfirmText('');
    setMessage(
      error
        ? userMessage(classifyError(error))
        : 'Deletion requested. An administrator will action it.'
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <section className="panel rounded-[var(--r-lg)] p-4">
        <h2 className="text-[var(--text-heading-sm)] font-semibold">Export your data</h2>
        <p className="mt-1 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Downloads your profile, your player records, teams you own and any scoring rights you
          hold, as JSON.
        </p>
        <button
          type="button"
          disabled={busy || !userId}
          onClick={() => void exportData()}
          className="press mt-3 inline-flex items-center gap-2 rounded-[var(--r-full)] bg-[var(--accent)] px-4 py-2 text-[var(--text-body-sm)] font-semibold text-[var(--accent-fg)] disabled:opacity-50"
        >
          <Download size={15} aria-hidden />
          Download export
        </button>
      </section>

      {/* Pre-production only. Once real matches exist, deleting them all is
          not a feature — it is an incident, and `purge_match_data` is meant to
          be dropped before the first club is invited. Shown only to a super
          admin, and the server demands the same typed phrase again. */}
      {isSuperAdmin && (
        <section className="panel rounded-[var(--r-lg)] border border-[var(--danger)] p-4">
          <h2 className="text-[var(--text-heading-sm)] font-semibold text-[var(--danger)]">
            Clear all match data
          </h2>
          <p className="mt-1 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            Deletes every match, ball, scorecard, stat and ranking — a clean slate for testing.
            Teams, players and squads are kept, so you can replay fixtures against the same sides.
            <strong className="text-[var(--danger)]">
              {' '}
              This cannot be undone, and it removes other people&apos;s matches too.
            </strong>{' '}
            It exists only until the app goes into production.
          </p>
          <label className="mt-3 block text-[12px] text-[var(--text-secondary)]">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm
            <input
              value={purgeText}
              onChange={(e) => setPurgeText(e.target.value)}
              className="mt-1 w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-1.5 text-[var(--text-body-sm)]"
            />
          </label>
          <button
            type="button"
            disabled={busy || purgeText !== 'DELETE'}
            onClick={() => void purgeMatches()}
            className="press mt-3 inline-flex items-center gap-2 rounded-[var(--r-full)] bg-[var(--danger)] px-4 py-2 text-[var(--text-body-sm)] font-semibold text-[var(--text-inverse)] disabled:opacity-40"
          >
            <Trash2 size={15} aria-hidden />
            {busy ? 'Clearing…' : 'Clear all match data'}
          </button>
        </section>
      )}

      <section className="panel rounded-[var(--r-lg)] border border-[var(--danger)] p-4">
        <h2 className="text-[var(--text-heading-sm)] font-semibold text-[var(--danger)]">
          Delete your account
        </h2>
        <p className="mt-1 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          This raises a deletion request rather than erasing immediately — and it is worth knowing
          why. Balls you scored live in an append-only log that other players&apos; scorecards and
          rankings are derived from; deleting them would silently change other people&apos;s
          records. Your login and personal details are removed; your cricketing contributions stay,
          attributed to a shadow player.
        </p>
        <label className="mt-3 block text-[12px] text-[var(--text-secondary)]">
          Type <span className="font-mono font-semibold">DELETE</span> to confirm
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-1 w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] px-2 py-1.5 text-[var(--text-body-sm)]"
          />
        </label>
        <button
          type="button"
          disabled={busy || confirmText !== 'DELETE' || !userId}
          onClick={() => void requestDeletion()}
          className="press mt-3 inline-flex items-center gap-2 rounded-[var(--r-full)] bg-[var(--danger)] px-4 py-2 text-[var(--text-body-sm)] font-semibold text-[var(--text-inverse)] disabled:opacity-40"
        >
          <Trash2 size={15} aria-hidden />
          Request deletion
        </button>
      </section>

      {message && (
        <p role="status" className="px-1 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          {message}
        </p>
      )}
    </div>
  );
}
