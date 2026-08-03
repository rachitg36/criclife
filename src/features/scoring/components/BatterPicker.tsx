import { cn } from '@/lib/cn';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 2/5 — AWAITING_BATTER: the remaining batting
    order as a tappable list, next-in-order pre-highlighted at the top.
    The full-squad "Change order" reveal from the mockup isn't built — the
    engine already tracks batting order via `yetToBat`, and reordering it
    isn't a Phase 5 roadmap bullet. */
export function BatterPicker() {
  const matchState = useScorerStore((s) => s.matchState);
  const squadA = useScorerStore((s) => s.squadA);
  const squadB = useScorerStore((s) => s.squadB);
  const teamAId = useScorerStore((s) => s.teamAId);
  const pickBatter = useScorerStore((s) => s.pickBatter);

  const innings = matchState?.innings[matchState.currentInningsIndex];
  if (!innings) return null;

  const battingSquad = innings.battingTeamId === teamAId ? squadA : squadB;
  const nameFor = (id: string) =>
    battingSquad.find((p) => p.id === id)?.short_name ??
    battingSquad.find((p) => p.id === id)?.full_name ??
    '—';

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-2">
      <span className="text-[13px] font-semibold text-[var(--text-secondary)]">
        Next batter
      </span>
      <div className="flex flex-col gap-1.5">
        {innings.yetToBat.map((id, i) => (
          <button
            key={id}
            type="button"
            className={cn(
              'press flex min-h-14 items-center justify-between rounded-[var(--r-md)] px-3 text-[15px] font-semibold',
              i === 0 ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'panel'
            )}
            onClick={() => pickBatter(id)}
          >
            {nameFor(id)}
            {i === 0 && <span className="text-[11px] font-normal opacity-80">up next</span>}
          </button>
        ))}
        {innings.yetToBat.length === 0 && (
          <span className="text-[13px] text-[var(--text-tertiary)]">No batters remaining.</span>
        )}
      </div>
    </div>
  );
}
