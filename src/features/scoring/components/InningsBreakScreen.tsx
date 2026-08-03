import { formatOvers, formatScore } from '@/lib/format';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 5 — INNINGS_BREAK: summary + "Start next
    innings" CTA. Also covers the tied-after-normal-time case, where the
    store has already decided (via `resolveTiedSuperOvers`) that a super
    over is next — same CTA, `start_innings` handles the numbering. */
export function InningsBreakScreen() {
  const matchState = useScorerStore((s) => s.matchState);
  const config = useScorerStore((s) => s.config);
  const matchResult = useScorerStore((s) => s.matchResult);
  const startNextInnings = useScorerStore((s) => s.startNextInnings);
  if (!matchState || !config) return null;

  const justEnded = [...matchState.innings].reverse().find((i) => i.status !== 'in_progress');
  const nextIsSuperOver = matchState.innings.length >= 2 && matchResult !== null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-4 text-center">
      {matchResult && (
        <span className="rounded-full bg-[var(--extra)] px-3 py-1 text-[12px] font-bold text-[var(--text-inverse)] uppercase">
          Match tied
        </span>
      )}
      {justEnded && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[13px] tracking-[0.06em] text-[var(--text-tertiary)] uppercase">
            Innings {justEnded.inningsNo} complete
          </span>
          <span
            className="font-display leading-none font-extrabold tabular-nums"
            style={{ fontSize: 'clamp(32px, 10vw, 48px)' }}
          >
            {formatScore(justEnded.runs, justEnded.wickets)}
          </span>
          <span className="text-[13px] text-[var(--text-secondary)] tabular-nums">
            {formatOvers(justEnded.legalBalls, config.ballsPerOver)} overs
          </span>
        </div>
      )}

      <button
        type="button"
        className="press mt-2 min-h-14 w-full max-w-xs rounded-[var(--r-md)] bg-[var(--accent)] text-[16px] font-bold text-[var(--accent-fg)]"
        onClick={() => void startNextInnings()}
      >
        {nextIsSuperOver ? 'Start Super Over' : 'Start next innings'}
      </button>
    </div>
  );
}
