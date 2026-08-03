import { useState } from 'react';
import { useScorerStore } from '../store';

/** docs/05-SCORER-VIEW.md § 7 — ball-by-ball commentary, editable inline. */
export function FeedTab() {
  const deliveries = useScorerStore((s) => s.deliveries);
  const deliveryIds = useScorerStore((s) => s.deliveryIds);
  const editDelivery = useScorerStore((s) => s.editDelivery);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const items = deliveries.map((delivery, index) => ({
    delivery,
    id: deliveryIds[index] ?? null,
    index,
  }));

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      {items.length === 0 && (
        <p className="py-6 text-center text-[13px] text-[var(--text-tertiary)]">
          No commentary yet — the feed fills in as balls are bowled.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {[...items].reverse().map(({ delivery, id, index }) => (
          <div key={index} className="panel flex items-start gap-2 rounded-[var(--r-md)] p-2.5">
            <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-[var(--text-tertiary)]">
              {delivery.inningsNo}·{delivery.overNo}.{delivery.ballInOver}
            </span>
            {editingIndex === index ? (
              <div className="flex flex-1 flex-col gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--surface-1)] p-2 text-[13px]"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="press rounded-[var(--r-sm)] bg-[var(--accent)] px-3 py-1 text-[12px] font-semibold text-[var(--accent-fg)]"
                    onClick={async () => {
                      if (id) await editDelivery(id, { commentaryOverride: draft });
                      setEditingIndex(null);
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="press rounded-[var(--r-sm)] px-3 py-1 text-[12px] text-[var(--text-secondary)]"
                    onClick={() => setEditingIndex(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!id}
                className="flex-1 text-left text-[13px] leading-snug text-[var(--text-primary)] disabled:opacity-70"
                onClick={() => {
                  setDraft(delivery.commentary);
                  setEditingIndex(index);
                }}
              >
                {delivery.commentary || '—'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
