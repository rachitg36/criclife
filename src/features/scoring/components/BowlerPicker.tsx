import { cn } from '@/lib/cn';
import { resolveMaxOversPerBowler } from '@/engine';
import { formatBowlingFigures } from '@/lib/format';
import { useScorerStore } from '../store';
import { EmptySquadNotice } from './EmptySquadNotice';

/** docs/05-SCORER-VIEW.md § 2/5 — AWAITING_BOWLER: the fielding side as tiles
    showing O-M-R-W. The previous over's bowler and anyone already at their
    over limit are greyed out and unselectable. */
export function BowlerPicker() {
  const matchState = useScorerStore((s) => s.matchState);
  const config = useScorerStore((s) => s.config);
  const teamAId = useScorerStore((s) => s.teamAId);
  const squadA = useScorerStore((s) => s.squadA);
  const squadB = useScorerStore((s) => s.squadB);
  const pickBowler = useScorerStore((s) => s.pickBowler);
  const matchId = useScorerStore((s) => s.matchId);

  const innings = matchState?.innings[matchState.currentInningsIndex];
  if (!innings || !config) return null;

  const fieldingSquad = innings.bowlingTeamId === teamAId ? squadA : squadB;
  if (fieldingSquad.length === 0) return <EmptySquadNotice matchId={matchId} side="fielding" />;

  const maxOvers = resolveMaxOversPerBowler(config);

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
      <span className="text-[13px] font-semibold text-[var(--text-secondary)]">
        Who is bowling?
      </span>
      <div className="grid grid-cols-2 gap-2">
        {fieldingSquad.map((p) => {
          const figures = innings.bowlers[p.id];
          const oversBowled = figures ? figures.legalBalls / config.ballsPerOver : 0;
          const atLimit = oversBowled >= maxOvers;
          const isPrevious = p.id === innings.previousBowlerId;
          const disabled = atLimit || isPrevious;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled}
              className={cn(
                'press panel flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-[var(--r-md)] px-3 text-left',
                'disabled:pointer-events-none disabled:opacity-30'
              )}
              onClick={() => pickBowler(p.id)}
            >
              <span className="text-[14px] font-semibold">{p.short_name ?? p.full_name}</span>
              <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
                {figures
                  ? formatBowlingFigures(
                      figures.legalBalls,
                      figures.maidens,
                      figures.runsConceded,
                      figures.wickets,
                      config.ballsPerOver
                    )
                  : '0.0-0-0-0'}
                {isPrevious && ' · last over'}
                {atLimit && !isPrevious && ` · ${maxOvers}/${maxOvers}`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
