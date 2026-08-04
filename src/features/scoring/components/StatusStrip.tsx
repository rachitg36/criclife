import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useWakeLock } from '@/lib/wakeLock';
import { useUiStore } from '@/stores/uiStore';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 1/4 — 28px status strip: innings label, wake-lock
    indicator, sync pill. The wake lock itself lives here since this is the
    one component mounted for every mode the scorer route renders. */
export function StatusStrip() {
  const matchState = useScorerStore((s) => s.matchState);
  const matchId = useScorerStore((s) => s.matchId);
  const pendingCount = useScorerStore((s) => s.pendingCount);
  const revoked = useScorerStore((s) => s.revoked);
  const online = useScorerStore((s) => s.online);
  const hasSyncError = useScorerStore((s) => s.hasSyncError);
  const keepScreenAwake = useUiStore((s) => s.keepScreenAwake);
  const awake = useWakeLock(keepScreenAwake);

  const innings = matchState?.innings[matchState.currentInningsIndex];

  return (
    <div className="flex h-7 shrink-0 items-center justify-between px-3 text-[11px] tracking-[0.04em]">
      <span className="flex min-w-0 items-center gap-1 truncate font-semibold text-[var(--text-secondary)] uppercase">
        {/* The only way out. ScoringLayout hides the app's tab bar on purpose
            (docs/11's navigation model), and the scorer's own tabs all stay
            inside the pad — so until this existed there was no route off this
            screen at all except the browser's back button. Reported as "I am
            stuck in the game and not able to come out." */}
        {matchId && (
          <Link
            to={`/matches/${matchId}`}
            aria-label="Leave the scorer and go to the match"
            className="press -ml-1 flex h-7 w-6 items-center justify-center text-[var(--text-secondary)]"
          >
            <ChevronLeft size={16} aria-hidden />
          </Link>
        )}
        {innings?.isSuperOver ? 'Super Over' : innings ? `Innings ${innings.inningsNo}` : '—'}
        {awake && (
          <span aria-label="Screen kept awake" title="Screen kept awake" className="opacity-70">
            ☀
          </span>
        )}
      </span>
      <SyncPill
        revoked={revoked}
        online={online}
        hasSyncError={hasSyncError}
        pendingCount={pendingCount}
      />
    </div>
  );
}

/** docs/05-SCORER-VIEW.md § 6.3 — synced / pending / offline / error, in
    that priority order (revoked pre-empts all of them; it's not one of
    the documented four but needs to win over "synced" too). */
function SyncPill({
  revoked,
  online,
  hasSyncError,
  pendingCount,
}: {
  revoked: boolean;
  online: boolean;
  hasSyncError: boolean;
  pendingCount: number;
}) {
  if (revoked) {
    return <span className="font-semibold text-[var(--danger)]">⚠ rights revoked</span>;
  }
  if (!online) {
    return <span className="text-[var(--text-tertiary)]">⚠ offline</span>;
  }
  if (hasSyncError) {
    return <span className="font-semibold text-[var(--danger)]">⚠ sync error</span>;
  }
  if (pendingCount > 0) {
    return <span className="text-[var(--warning)]">⟳ {pendingCount} pending</span>;
  }
  return (
    <span className={cn('flex items-center gap-1 text-[var(--success)]')}>
      <span aria-hidden>●</span> synced
    </span>
  );
}
