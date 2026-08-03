import { formatBowlingFigures, economyRate } from '@/lib/format';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 1 — 36px bowler row: O-M-R-W and economy. */
export function BowlerRow() {
  const matchState = useScorerStore((s) => s.matchState);
  const config = useScorerStore((s) => s.config);
  const squadA = useScorerStore((s) => s.squadA);
  const squadB = useScorerStore((s) => s.squadB);

  const innings = matchState?.innings[matchState.currentInningsIndex];
  if (!innings || !config) return null;

  const squad = [...squadA, ...squadB];
  const bowler = innings.bowlerId ? innings.bowlers[innings.bowlerId] : null;
  const name =
    squad.find((p) => p.id === innings.bowlerId)?.short_name ??
    squad.find((p) => p.id === innings.bowlerId)?.full_name ??
    '—';

  if (!bowler) {
    return (
      <div className="flex h-9 shrink-0 items-center border-b border-[var(--border-subtle)] px-3 text-[13px] text-[var(--text-tertiary)]">
        Pick a bowler
      </div>
    );
  }

  const econ = economyRate(bowler.runsConceded, bowler.legalBalls, config.ballsPerOver);

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3 text-[13px] tabular-nums">
      <span className="truncate font-medium">
        {name}{' '}
        <span className="text-[var(--text-secondary)]">
          {formatBowlingFigures(
            bowler.legalBalls,
            bowler.maidens,
            bowler.runsConceded,
            bowler.wickets,
            config.ballsPerOver
          )}
        </span>
      </span>
      <span className="shrink-0 text-[var(--text-secondary)]">
        ECON {econ === null ? '–' : econ.toFixed(2)}
      </span>
    </div>
  );
}
