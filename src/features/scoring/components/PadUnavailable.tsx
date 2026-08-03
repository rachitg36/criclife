import { Link } from 'react-router';
import { useScorerStore } from '../store';

/**
 * The pad's backstop: what shows when the Score tab has nothing to render.
 *
 * Every component in the score stack — ScoreBlock, BattersRow, BowlerRow,
 * OverStrip, and both pickers — begins `if (!innings) return null`. Each of
 * those is correct on its own, and together they mean the pad's failure mode
 * is a black rectangle with WICKET and UNDO floating at the bottom. That is
 * not a hypothetical: it is what the first real match looked like, twice, and
 * the second time it cost a round trip to work out which of three states it
 * was in.
 *
 * So the Score tab is gated on the data it needs, and when that data is not
 * there this says which piece is missing instead of rendering nine nulls.
 * `mode` is on screen deliberately — it is the one word that turns "the app is
 * broken" into a specific bug report.
 *
 * This should be unreachable. If it ever shows, something upstream is wrong
 * and the point is to find out what, not to hide it.
 */
export function PadUnavailable() {
  const matchState = useScorerStore((s) => s.matchState);
  const config = useScorerStore((s) => s.config);
  const matchId = useScorerStore((s) => s.matchId);
  const mode = useScorerStore((s) => s.mode);
  const error = useScorerStore((s) => s.error);

  const missing = !matchState
    ? 'the match state'
    : !config
      ? 'the match settings'
      : 'the current innings';

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[15px] font-semibold">The pad can&rsquo;t open this match</p>
      <p className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        It loaded, but {missing} is missing. Reloading usually fixes it; if it doesn&rsquo;t, the
        match needs setting up again.
      </p>
      {error && (
        <p role="alert" className="text-[var(--text-body-sm)] text-[var(--danger)]">
          {error}
        </p>
      )}
      <p className="font-mono text-[11px] text-[var(--text-tertiary)]">mode: {mode}</p>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-[var(--accent)] underline"
        >
          Reload
        </button>
        {matchId && (
          <Link to={`/matches/${matchId}/setup`} className="text-[var(--accent)] underline">
            Match setup
          </Link>
        )}
      </div>
    </div>
  );
}
