import { Link } from 'react-router';

/**
 * What a picker shows when the squad it is meant to list is empty.
 *
 * Without this, `AWAITING_OPENERS` with no squad rows renders the words "Who
 * is on strike?" above nothing at all — WICKET and UNDO still sit in the
 * action row, so the pad looks like an app whose buttons failed to load rather
 * than a match missing its squad. That is what it looked like the first time
 * anyone opened the pad against a real project.
 *
 * A genuinely empty squad means nobody was picked for that side, which is
 * fixable from match setup — so this says so and links there, rather than
 * apologising. Deliberately says "squad", not "XI": `playersPerSide` is a
 * per-match setting and a side can be any size from two upwards.
 */
export function EmptySquadNotice({ matchId, side }: { matchId: string | null; side: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-[15px] font-semibold">No {side} squad picked</p>
      <p className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        Nobody has been picked for this side, so there is nobody to choose here.
      </p>
      {matchId && (
        <Link to={`/matches/${matchId}/setup`} className="text-[var(--accent)] underline">
          Pick the squad
        </Link>
      )}
    </div>
  );
}
