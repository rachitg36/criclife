import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { WinProbability } from '../winProbability';
import type { AudienceTeam } from '../types';

/**
 * docs/06 § 5 — win probability, "a transparent heuristic, clearly labelled
 * *estimate* — not a black box". Three things follow from that and are not
 * negotiable in this component:
 *
 *   1. the word "estimate" is always on screen, not hidden in the tooltip;
 *   2. the tooltip always explains the inputs, in words;
 *   3. in the first innings the label says *par comparison*, because that is
 *      what it is — calling it a win probability before a target exists would
 *      be a claim the maths never made.
 */
export function WinProbabilityBar({
  probability,
  battingTeam,
  bowlingTeam,
}: {
  probability: WinProbability;
  battingTeam: AudienceTeam | null;
  bowlingTeam: AudienceTeam | null;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  if (probability.mode === 'unknown' || probability.battingTeamProbability === null) return null;

  const pct = Math.round(probability.battingTeamProbability * 100);
  const label =
    probability.mode === 'par'
      ? 'Par comparison'
      : probability.mode === 'settled'
        ? 'Final'
        : 'Win probability';

  return (
    <div className="px-4 pb-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label-overline">
          {label}
          {probability.mode !== 'settled' && (
            <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--text-tertiary)]">
              estimate
            </span>
          )}
        </span>
        <button
          type="button"
          aria-label="How this is calculated"
          aria-expanded={open}
          aria-controls={tooltipId}
          onClick={() => setOpen((v) => !v)}
          className="press grid h-6 w-6 place-items-center rounded-[var(--r-full)] text-[var(--text-tertiary)]"
        >
          <Info size={14} aria-hidden />
        </button>
      </div>

      <div
        className="relative h-2.5 overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-3)]"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${battingTeam?.name ?? 'Batting side'} ${pct}%`}
      >
        <div
          className="h-full rounded-[var(--r-full)] bg-[var(--accent)] transition-[width] duration-[var(--dur-slow)] ease-[var(--ease-out)]"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums">
        <span className="font-semibold text-[var(--accent)]">
          {battingTeam?.name ?? '—'} {pct}%
        </span>
        <span className="text-[var(--text-tertiary)]">
          {bowlingTeam?.name ?? '—'} {100 - pct}%
        </span>
      </div>

      <p
        id={tooltipId}
        className={cn(
          'mt-2 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2.5 text-[12px] leading-snug text-[var(--text-secondary)]',
          open ? 'block' : 'hidden'
        )}
      >
        {probability.explanation}
      </p>
    </div>
  );
}
