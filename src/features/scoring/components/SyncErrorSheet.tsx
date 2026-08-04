import { useEffect, useState } from 'react';
import { lastQueueError } from '@/lib/db';
import { useScorerStore } from '../store';

/**
 * What "⚠ sync error" actually means.
 *
 * The sync worker has always carried the server's own words —
 * `BOWLER_LIMIT: … has already bowled the maximum 1 overs`,
 * `CONSECUTIVE_OVER`, `MATCH_LOCKED`, a constraint violation, a 5xx — and the
 * store set a boolean and dropped the string. So the pad could say that
 * something was wrong and never what, which is the difference between "pick a
 * different bowler and carry on" and "the match is broken".
 *
 * It matters more here than almost anywhere else in the app, because the
 * scorer is the only person who can act on it and they are standing at a
 * ground with the next ball about to be bowled. Reported on 2026-08-04 as
 * "the scoring tabs are all saying sync error" — with, on the same match,
 * two balls in the database and the audience view empty.
 *
 * Rendered `fixed` rather than `absolute`: it hangs off the 28px status
 * strip, which has no positioned ancestor short of the viewport, and it has
 * to cover whichever scorer tab is open — every one of them shows the pill,
 * which is exactly how the problem was described.
 *
 * Nothing is lost while this is up: the balls are in IndexedDB, and Retry
 * re-anchors them to the server's current seq rather than re-sending a stale
 * one. Dismiss only hides the sheet; the queue is untouched.
 */
export function SyncErrorSheet({ onClose }: { onClose: () => void }) {
  const liveMessage = useScorerStore((s) => s.syncErrorMessage);
  const matchId = useScorerStore((s) => s.matchId);
  const pendingCount = useScorerStore((s) => s.pendingCount);
  const [storedMessage, setStoredMessage] = useState<string | null>(null);

  // The in-memory message does not survive a reload, and a scorer whose app
  // was killed in their pocket is exactly the person who needs to read it.
  // The outbox has kept `lastError` durably all along.
  useEffect(() => {
    if (!matchId) return;
    let alive = true;
    void lastQueueError(matchId).then((m) => {
      if (alive) setStoredMessage(m);
    });
    return () => {
      alive = false;
    };
  }, [matchId]);

  const message = liveMessage ?? storedMessage;
  const retrySync = useScorerStore((s) => s.retrySync);
  const dismissSyncError = useScorerStore((s) => s.dismissSyncError);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 max-h-[60dvh] overflow-y-auto rounded-t-[var(--r-lg)] border-t border-[var(--danger)] bg-[var(--surface-glass-strong)] px-4 pt-3 pb-[calc(3.5rem+var(--sp-3)+var(--safe-b))] backdrop-blur-xl">
      <div className="flex items-center justify-between pb-2">
        <span className="text-[13px] font-bold tracking-[0.04em] text-[var(--danger)] uppercase">
          Balls are not reaching the server
        </span>
        <button
          type="button"
          aria-label="Close"
          className="press flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)]"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <p className="text-[13px] text-[var(--text-secondary)]">
        {pendingCount === 1
          ? '1 ball is waiting on this device.'
          : `${pendingCount} balls are waiting on this device.`}{' '}
        Nothing is lost — keep scoring, and they will go up when this clears.
      </p>

      {message && (
        <pre className="mt-3 overflow-x-auto rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] p-2 text-[12px] whitespace-pre-wrap text-[var(--text-primary)]">
          {message}
        </pre>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void retrySync().then(onClose)}
          className="press flex min-h-11 flex-1 items-center justify-center rounded-[var(--r-md)] bg-[var(--accent)] text-[14px] font-semibold text-[var(--accent-fg)]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => {
            dismissSyncError();
            onClose();
          }}
          className="press flex min-h-11 items-center justify-center rounded-[var(--r-md)] border border-[var(--border-default)] px-4 text-[14px] font-medium text-[var(--text-secondary)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
