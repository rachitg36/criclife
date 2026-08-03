import { useState } from 'react';
import { cn } from '@/lib/cn';
import { useScorerStore } from '../store';

const GRID: (number | '7+')[] = [0, 1, 2, 3, 4, 6, 5, '7+'];
const MORE_VALUES = [7, 8, 9, 10];

/** docs/05-SCORER-VIEW.md § 1/2/4 — the run pad: 2 rows × 4, 56px min
    targets in the thumb zone. One tap commits; `7+` opens a rare overlay
    for the handful of overthrow values not already on the grid. */
export function RunPad() {
  const recordRun = useScorerStore((s) => s.recordRun);
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="relative flex flex-1 items-center justify-center px-3 py-2">
      <div className="grid w-full max-w-sm grid-cols-4 gap-2">
        {GRID.map((v) => (
          <button
            key={v}
            type="button"
            className={cn(
              'press min-h-14 min-w-14 rounded-[var(--r-md)] text-[20px] font-bold tabular-nums transition-colors',
              v === 4
                ? 'bg-[var(--run-four)] text-white'
                : v === 6
                  ? 'bg-[var(--run-six)] text-white'
                  : 'panel text-[var(--text-primary)]'
            )}
            onClick={() => (v === '7+' ? setMoreOpen(true) : void recordRun(v))}
          >
            {v}
          </button>
        ))}
      </div>

      {moreOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--r-lg)] bg-[var(--surface-glass-strong)] backdrop-blur-xl">
          <div className="grid grid-cols-3 gap-2 p-3">
            {MORE_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                className="press min-h-14 min-w-14 rounded-[var(--r-md)] panel text-[20px] font-bold tabular-nums"
                onClick={() => {
                  void recordRun(v);
                  setMoreOpen(false);
                }}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              className="press min-h-14 min-w-14 rounded-[var(--r-md)] text-[15px] text-[var(--text-secondary)]"
              onClick={() => setMoreOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
