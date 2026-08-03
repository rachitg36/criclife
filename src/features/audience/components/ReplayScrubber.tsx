import { Pause, Play, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAudienceStore } from '../store';
import type { AudienceView } from '../useAudienceView';

/**
 * docs/06 § 7 — the completed-match replay scrubber. Drag through the innings
 * and everything above re-renders at that point in time: the score, the
 * batters, the feed, the charts.
 *
 * Purely client-side. It re-folds a prefix of the delivery log through the
 * same engine that produced the live state (see `useAudienceView`), which is
 * exactly the property CLAUDE.md rule 1 and rule 3 buy — there is no separate
 * "historical" code path that could disagree with the live one.
 */
export function ReplayScrubber({ view }: { view: AudienceView }) {
  const deliveries = useAudienceStore((s) => s.deliveries);
  const scrubTo = useAudienceStore((s) => s.scrubTo);
  const setScrubTo = useAudienceStore((s) => s.setScrubTo);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = deliveries.length;
  const position = scrubTo ?? total;

  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      const next = (useAudienceStore.getState().scrubTo ?? total) + 1;
      if (next >= total) {
        setScrubTo(null);
        setPlaying(false);
      } else {
        setScrubTo(next);
      }
    }, 700);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, total, setScrubTo]);

  if (total === 0 || !view.isComplete) return null;

  const atLive = scrubTo === null;

  return (
    <div className="border-y border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="label-overline flex-1">Replay</span>
        <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
          {atLive ? 'Full match' : `Ball ${position} of ${total}`}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? 'Pause replay' : 'Play replay'}
          onClick={() => {
            if (!playing && atLive) setScrubTo(0);
            setPlaying((v) => !v);
          }}
          className="press grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-full)] bg-[var(--accent)] text-[var(--accent-fg)]"
        >
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>

        <input
          type="range"
          min={0}
          max={total}
          value={position}
          aria-label="Scrub through the match"
          onChange={(e) => {
            const next = Number(e.target.value);
            setPlaying(false);
            setScrubTo(next >= total ? null : next);
          }}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-[var(--r-full)] bg-[var(--surface-3)] accent-[var(--accent)]"
        />

        <button
          type="button"
          aria-label="Jump to the end"
          disabled={atLive}
          onClick={() => {
            setPlaying(false);
            setScrubTo(null);
          }}
          className="press grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-full)] text-[var(--text-secondary)] disabled:opacity-40"
        >
          <SkipForward size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
