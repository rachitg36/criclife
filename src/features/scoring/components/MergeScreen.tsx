import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 6.6 — a co-scorer recorded conflicting balls
    while this device was offline. Blocks the whole pad until resolved: with
    the ball order genuinely uncertain, nothing else is safe to show.

    Simplified from the full "both sequences side by side, ball by ball"
    spec: this resolves the conflict at the level of "this device's whole
    run of unsynced balls for the innings," not a per-ball diff view. A true
    ball-by-ball diff needs to fetch and render the server's own sequence
    alongside this device's queue; that's real additional work deferred
    rather than half-built here. */
export function MergeScreen() {
  const conflict = useScorerStore((s) => s.conflict);
  const resolveConflictKeepTheirs = useScorerStore((s) => s.resolveConflictKeepTheirs);
  const resolveConflictKeepMine = useScorerStore((s) => s.resolveConflictKeepMine);

  if (!conflict) return null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-5 py-4 text-center">
      <span className="rounded-full bg-[var(--warning)] px-3 py-1 text-[12px] font-bold text-[var(--text-inverse)] uppercase">
        Scoring conflict
      </span>
      <p className="max-w-xs text-[15px] text-[var(--text-primary)]">
        Another scorer recorded a ball here while this device was offline.
      </p>
      <p className="max-w-xs text-[13px] text-[var(--text-secondary)]">
        {conflict.pending.length === 1
          ? "This device has 1 ball that hasn't synced yet."
          : `This device has ${conflict.pending.length} balls that haven't synced yet.`}
      </p>

      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          className="press min-h-14 rounded-[var(--r-md)] bg-[var(--accent)] text-[15px] font-bold text-[var(--accent-fg)]"
          onClick={() => void resolveConflictKeepMine()}
        >
          Keep both — add mine after theirs
        </button>
        <button
          type="button"
          className="press panel min-h-14 rounded-[var(--r-md)] text-[15px] font-semibold"
          onClick={() => void resolveConflictKeepTheirs()}
        >
          Keep theirs — discard mine
        </button>
      </div>
    </div>
  );
}
