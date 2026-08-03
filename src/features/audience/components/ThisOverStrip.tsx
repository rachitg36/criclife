import { CREDIT_TABLE } from '@/engine';
import { cn } from '@/lib/cn';
import type { AudienceDelivery } from '../types';

/** The `· 1 · 4 W ·` strip from docs/06 § 1. */
export function ThisOverStrip({ balls }: { balls: readonly AudienceDelivery[] }) {
  return (
    <div className="flex items-center gap-2 border-y border-[var(--border-subtle)] px-4 py-2.5">
      <span className="label-overline shrink-0">This over</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {balls.length === 0 ? (
          <span className="text-[12px] text-[var(--text-tertiary)]">—</span>
        ) : (
          balls.map((b) => <BallChip key={b.clientDeliveryId} ball={b} />)
        )}
      </div>
    </div>
  );
}

function labelFor(b: AudienceDelivery): string {
  if (b.isWicket && b.wicketType !== null && CREDIT_TABLE[b.wicketType].countsAsWicket) return 'W';
  if (b.extraType === 'wide') return `${b.runsExtras}wd`;
  if (b.extraType === 'no_ball') return `${b.runsTotal}nb`;
  if (b.extraType === 'bye') return `${b.runsExtras}b`;
  if (b.extraType === 'leg_bye') return `${b.runsExtras}lb`;
  if (b.extraType === 'penalty') return `${b.runsExtras}p`;
  return String(b.runsBatter);
}

function toneFor(b: AudienceDelivery): string {
  if (b.isWicket && b.wicketType !== null && CREDIT_TABLE[b.wicketType].countsAsWicket) {
    return 'bg-[var(--wicket)] text-[var(--text-inverse)]';
  }
  if (b.isBoundarySix) return 'bg-[var(--run-six)] text-[var(--text-inverse)]';
  if (b.isBoundaryFour) return 'bg-[var(--run-four)] text-[var(--text-inverse)]';
  if (b.extraType !== null) return 'bg-[var(--extra)] text-[var(--text-inverse)]';
  if (b.runsBatter === 0) return 'bg-[var(--surface-3)] text-[var(--run-dot)]';
  return 'bg-[var(--surface-3)] text-[var(--text-primary)]';
}

function BallChip({ ball }: { ball: AudienceDelivery }) {
  return (
    <span
      className={cn(
        'grid h-7 min-w-7 place-items-center rounded-[var(--r-full)] px-1.5 text-[12px] font-semibold tabular-nums',
        toneFor(ball)
      )}
    >
      {labelFor(ball)}
    </span>
  );
}
