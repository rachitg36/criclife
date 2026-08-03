import { useState } from 'react';
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

/** docs/05-SCORER-VIEW.md § 2 — long-press UNDO or the ⋯ overflow opens this.
    Only run corrections are editable here; `edit_delivery` also supports
    replacing the wicket, but that UI isn't built (disclosed simplification —
    not a named Phase 5 roadmap bullet beyond "edit a previous ball", and a
    full re-dismissal picker would duplicate WicketSheet's flow). Legality
    can never change — undo back past the ball and re-enter instead. */
export function BallHistorySheet() {
  const historyOpen = useScorerStore((s) => s.historyOpen);
  const closeHistory = useScorerStore((s) => s.closeHistory);
  const matchState = useScorerStore((s) => s.matchState);
  const deliveries = useScorerStore((s) => s.deliveries);
  const deliveryIds = useScorerStore((s) => s.deliveryIds);
  const editDelivery = useScorerStore((s) => s.editDelivery);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  if (!historyOpen) return null;
  const innings = matchState?.innings[matchState.currentInningsIndex];
  if (!innings) return null;

  const items = deliveries
    .map((delivery, index) => ({ delivery, id: deliveryIds[index] ?? null, index }))
    .filter((item) => item.delivery.inningsNo === innings.inningsNo)
    .reverse();

  const editing = editingIndex !== null ? items.find((i) => i.index === editingIndex) : null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex max-h-[60dvh] flex-col rounded-t-[var(--r-lg)] border-t border-[var(--border-default)] bg-[var(--surface-glass-strong)] px-3 pt-3 pb-[calc(var(--sp-3)+var(--safe-b))] backdrop-blur-xl">
      <div className="flex shrink-0 items-center justify-between pb-2">
        <span className="text-[13px] font-bold tracking-[0.04em] text-[var(--text-primary)] uppercase">
          Ball history
        </span>
        <button
          type="button"
          aria-label="Close"
          className="press flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-secondary)]"
          onClick={() => {
            setEditingIndex(null);
            closeHistory();
          }}
        >
          ✕
        </button>
      </div>

      {editing ? (
        <RunEditor
          delivery={editing.delivery}
          onCancel={() => setEditingIndex(null)}
          onSave={async (changes) => {
            if (editing.id) await editDelivery(editing.id, changes);
            setEditingIndex(null);
          }}
        />
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto">
          {items.length === 0 && (
            <span className="py-4 text-center text-[13px] text-[var(--text-tertiary)]">
              No balls recorded yet this innings.
            </span>
          )}
          {items.map(({ delivery, id, index }) => (
            <button
              key={index}
              type="button"
              disabled={!id || delivery.isWicket}
              className={cn(
                'press flex min-h-11 items-center justify-between rounded-[var(--r-md)] px-3 text-[13px]',
                'panel disabled:pointer-events-none disabled:opacity-50'
              )}
              onClick={() => setEditingIndex(index)}
            >
              <span className="tabular-nums text-[var(--text-secondary)]">
                {delivery.overNo}.{delivery.ballInOver}
              </span>
              <span className="font-semibold tabular-nums">{ballLabel(delivery)}</span>
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {!id ? 'syncing…' : delivery.isWicket ? 'not editable here' : 'edit'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RunEditor({
  delivery,
  onSave,
  onCancel,
}: {
  delivery: Delivery;
  onSave: (changes: { runsOffBat?: number; extraRuns?: number }) => void;
  onCancel: () => void;
}) {
  const isExtra = delivery.extraType !== null;
  const [value, setValue] = useState(isExtra ? delivery.runsExtras : delivery.runsBatter);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto py-2">
      <span className="text-[13px] text-[var(--text-secondary)]">
        Ball {delivery.overNo}.{delivery.ballInOver} — correct{' '}
        {isExtra ? 'extra runs' : 'runs off the bat'}
      </span>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((v) => (
          <button
            key={v}
            type="button"
            className={cn(
              'press min-h-12 rounded-[var(--r-md)] text-[16px] font-bold tabular-nums',
              value === v ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'panel'
            )}
            onClick={() => setValue(v)}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="mt-auto flex gap-2">
        <button
          type="button"
          className="press panel min-h-12 flex-1 rounded-[var(--r-md)] text-[14px] text-[var(--text-secondary)]"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="press min-h-12 flex-1 rounded-[var(--r-md)] bg-[var(--accent)] text-[14px] font-semibold text-[var(--accent-fg)]"
          onClick={() => onSave(isExtra ? { extraRuns: value } : { runsOffBat: value })}
        >
          Save correction
        </button>
      </div>
    </div>
  );
}
