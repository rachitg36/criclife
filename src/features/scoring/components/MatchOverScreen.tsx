import { useNavigate, useParams } from 'react-router';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 5 — MATCH_OVER: result card + "Publish". There
    is no separate publish mechanism yet (a match's public slug already
    makes it shareable — the audience view that consumes it is Phase 7), so
    "Publish" is the exit CTA back to the match hub. */
export function MatchOverScreen() {
  const matchResult = useScorerStore((s) => s.matchResult);
  const { matchId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-4 text-center">
      <span className="rounded-full bg-[var(--success)] px-3 py-1 text-[12px] font-bold text-[var(--text-inverse)] uppercase">
        Match complete
      </span>
      <p className="max-w-xs text-[17px] font-semibold text-[var(--text-primary)]">
        {matchResult?.text ?? 'The match has ended.'}
      </p>
      <button
        type="button"
        className="press mt-2 min-h-14 w-full max-w-xs rounded-[var(--r-md)] bg-[var(--accent)] text-[16px] font-bold text-[var(--accent-fg)]"
        onClick={() => navigate(`/matches/${matchId}`)}
      >
        Publish
      </button>
    </div>
  );
}
