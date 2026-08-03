import { cn } from '@/lib/cn';
import type { Delivery } from '@/engine/types';
import { useScorerStore } from '../store';

function ballLabel(d: Delivery): string {
  if (d.isWicket) return 'W';
  if (d.extraType === 'wide') return d.runsTotal > 1 ? `wd+${d.runsTotal - 1}` : 'wd';
  if (d.extraType === 'no_ball') return d.runsTotal > 1 ? `nb+${d.runsTotal - 1}` : 'nb';
  if (d.extraType === 'bye') return `${d.runsTotal}b`;
  if (d.extraType === 'leg_bye') return `${d.runsTotal}lb`;
  return `${d.runsTotal}`;
}

function ballTone(d: Delivery): string {
  if (d.isWicket) return 'bg-[var(--wicket)] text-white';
  if (d.isBoundarySix) return 'bg-[var(--run-six)] text-white';
  if (d.isBoundaryFour) return 'bg-[var(--run-four)] text-white';
  if (d.extraType) return 'bg-[var(--extra)] text-[var(--text-inverse)]';
  if (d.runsTotal === 0) return 'bg-[var(--surface-2)] text-[var(--text-tertiary)]';
  return 'bg-[var(--surface-3)] text-[var(--text-primary)]';
}

/** docs/05-SCORER-VIEW.md § 1 — 40px "THIS OVER" dot strip. Shows the most
    recently started over; stays put through OVER_COMPLETE until the first
    ball of the next over lands, matching the layout diagram's intent. */
export function OverStrip() {
  const matchState = useScorerStore((s) => s.matchState);
  const deliveries = useScorerStore((s) => s.deliveries);
  const innings = matchState?.innings[matchState.currentInningsIndex];
  if (!innings) return null;

  const inningsBalls = deliveries.filter((d) => d.inningsNo === innings.inningsNo);
  const lastOverNo = inningsBalls.length
    ? inningsBalls[inningsBalls.length - 1]!.overNo
    : 0;
  const thisOver = inningsBalls.filter((d) => d.overNo === lastOverNo);

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
      <span className="shrink-0 text-[10px] font-semibold tracking-[0.08em] text-[var(--text-tertiary)] uppercase">
        This over
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {thisOver.length === 0 && (
          <span className="text-[12px] text-[var(--text-tertiary)]">—</span>
        )}
        {thisOver.map((d, i) => (
          <span
            key={i}
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
              ballTone(d)
            )}
          >
            {ballLabel(d)}
          </span>
        ))}
      </div>
    </div>
  );
}
