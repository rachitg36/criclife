import { Link } from 'react-router';
import { useScorerStore } from '../store';

/**
 * `NOT_STARTED` — the pad opened on a match with no innings row.
 *
 * There was no state for this. The store fell through to `AWAITING_OPENERS`,
 * `OpenersPicker` returned null because there was no innings to pick openers
 * for, and every other row of the pad reads the same missing innings — so the
 * whole screen went black between the status strip and the action row. That
 * is what the first real match on the first real project looked like.
 *
 * `start_innings` needs `can_manage_match`, and refuses without a toss and
 * a squad for both sides. So the button is offered to everyone and the server is
 * left to say which of those is missing: the alternative is mirroring three
 * server-side conditions client-side and getting them subtly out of step,
 * which is the trap `record_delivery` already fell into once (HANDOFF § 8.14).
 */
export function InningsNotStartedScreen() {
  const matchId = useScorerStore((s) => s.matchId);
  const startNextInnings = useScorerStore((s) => s.startNextInnings);
  const error = useScorerStore((s) => s.error);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="text-[13px] tracking-[0.06em] text-[var(--text-tertiary)] uppercase">
        Not started
      </span>
      <p className="text-[15px] text-[var(--text-secondary)]">
        The first innings hasn&rsquo;t begun. Starting it needs the toss and a squad picked for both
        teams.
      </p>

      {error && (
        <p role="alert" className="text-[var(--text-body-sm)] text-[var(--danger)]">
          {error}
        </p>
      )}

      <button
        type="button"
        className="press mt-1 min-h-14 w-full max-w-xs rounded-[var(--r-md)] bg-[var(--accent)] text-[16px] font-bold text-[var(--accent-fg)]"
        onClick={() => void startNextInnings()}
      >
        Start the innings
      </button>
      {matchId && (
        <Link
          to={`/matches/${matchId}/setup`}
          className="text-[var(--text-body-sm)] text-[var(--accent)] underline"
        >
          Go to match setup
        </Link>
      )}
    </div>
  );
}
