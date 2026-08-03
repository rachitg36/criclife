import { formatBattingScore } from '@/lib/format';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 1 — 44px batters row: striker marked, non-striker alongside. */
export function BattersRow() {
  const matchState = useScorerStore((s) => s.matchState);
  const squadA = useScorerStore((s) => s.squadA);
  const squadB = useScorerStore((s) => s.squadB);

  const innings = matchState?.innings[matchState.currentInningsIndex];
  if (!innings) return null;

  const squad = [...squadA, ...squadB];
  const nameFor = (id: string | null) =>
    squad.find((p) => p.id === id)?.short_name ?? squad.find((p) => p.id === id)?.full_name ?? '—';

  const striker = innings.strikerId ? innings.batters[innings.strikerId] : null;
  const nonStriker = innings.nonStrikerId ? innings.batters[innings.nonStrikerId] : null;

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-3 text-[14px] tabular-nums">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span aria-hidden className="text-[var(--accent)]">
          ●
        </span>
        <span className="truncate font-semibold">{nameFor(innings.strikerId)}</span>
        <span className="shrink-0 text-[var(--text-secondary)]">
          {striker ? formatBattingScore(striker.runs, false) : '0'} ({striker?.balls ?? 0})
        </span>
      </div>
      <span aria-hidden className="text-[var(--border-strong)]">
        ┃
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate">{nameFor(innings.nonStrikerId)}</span>
        <span className="shrink-0 text-[var(--text-secondary)]">
          {nonStriker ? formatBattingScore(nonStriker.runs, false) : '0'} ({nonStriker?.balls ?? 0})
        </span>
      </div>
    </div>
  );
}
