import { cn } from '@/lib/cn';
import type { ExtraType } from '@/engine/types';
import { useScorerStore } from '../store';

const MODIFIERS: { key: ExtraType; label: string }[] = [
  { key: 'wide', label: 'WIDE' },
  { key: 'no_ball', label: 'NO-B' },
  { key: 'bye', label: 'BYE' },
  { key: 'leg_bye', label: 'LB' },
];

/** docs/05-SCORER-VIEW.md § 2 — modifiers are toggles, not modes. Tapping a
    lit modifier again commits it immediately with 0 extra runs (e.g.
    `WIDE` `WIDE` = a plain wide). */
export function ModifierRow() {
  const armedModifier = useScorerStore((s) => s.armedModifier);
  const config = useScorerStore((s) => s.config);
  const armModifier = useScorerStore((s) => s.armModifier);
  const recordExtra = useScorerStore((s) => s.recordExtra);
  if (!config) return null;

  const enabled: Record<ExtraType, boolean> = {
    wide: true,
    no_ball: true,
    bye: config.byesEnabled,
    leg_bye: config.legByesEnabled,
    penalty: config.penaltyRunsEnabled,
  };

  return (
    <div className="grid h-14 shrink-0 grid-cols-4 gap-2 px-3 pb-2">
      {MODIFIERS.map(({ key, label }) => {
        const armed = armedModifier === key;
        return (
          <button
            key={key}
            type="button"
            disabled={!enabled[key]}
            className={cn(
              'press rounded-[var(--r-md)] text-[13px] font-bold tracking-[0.04em] transition-colors',
              'disabled:pointer-events-none disabled:opacity-30',
              armed
                ? 'bg-[var(--extra)] text-[var(--text-inverse)]'
                : 'panel text-[var(--text-secondary)]'
            )}
            onClick={() => (armed ? void recordExtra(0) : armModifier(key))}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
