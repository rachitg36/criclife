import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';
import type { FeedItem } from '../feed';
import type { AudienceView } from '../useAudienceView';

const ACCENT_RAIL: Record<string, string> = {
  four: 'border-l-[var(--run-four)]',
  six: 'border-l-[var(--run-six)]',
  wicket: 'border-l-[var(--wicket)]',
  extra: 'border-l-[var(--extra)]',
};

/** One row of the ball-by-ball feed: a ball, an over divider, or an innings break. */
export function FeedRow({
  item,
  view,
  isNewest,
}: {
  item: FeedItem;
  view: AudienceView;
  isNewest: boolean;
}) {
  const calmMode = useUiStore((s) => s.calmMode);

  if (item.kind === 'innings') {
    return (
      <div className="my-1 rounded-[var(--r-md)] bg-[var(--surface-2)] px-3 py-2 text-center text-[12px] font-semibold tracking-[0.04em] text-[var(--text-secondary)]">
        {item.text}
      </div>
    );
  }

  if (item.kind === 'over') {
    return (
      <div className="my-1 flex items-center gap-2 px-1">
        <div className="h-px flex-1 bg-[var(--border-subtle)]" />
        <p className="shrink-0 text-[11px] tabular-nums text-[var(--text-tertiary)]">
          End of over {item.overNumber} · {item.runs} run{item.runs === 1 ? '' : 's'}
          {item.wickets > 0 && ` · ${item.wickets}W`}
          {item.maiden && ' · MAIDEN'} · {item.scoreAfter.runs}-{item.scoreAfter.wickets}
        </p>
        <div className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>
    );
  }

  const emphatic = item.accent === 'six' || item.accent === 'wicket';

  return (
    <motion.div
      // docs/06 § 2 — newest springs in. Only the newest: re-animating the
      // whole list on every ball is the thing that makes a live feed feel
      // broken rather than alive.
      initial={isNewest && !calmMode ? { opacity: 0, y: -12, scale: 0.98 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={cn(
        'panel flex items-start gap-2.5 rounded-[var(--r-md)] border-l-2 border-l-transparent p-2.5',
        item.accent ? ACCENT_RAIL[item.accent] : undefined
      )}
    >
      <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-[var(--text-tertiary)]">
        {item.label}
      </span>
      <p
        className={cn(
          'min-w-0 flex-1 leading-snug',
          emphatic
            ? 'text-[var(--text-heading-sm)] font-semibold'
            : 'text-[var(--text-body-sm)] text-[var(--text-primary)]'
        )}
      >
        {item.text || '—'}
      </p>
      <span className="shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-tertiary)]">
        {view.matchState ? item.runsTotal : ''}
      </span>
    </motion.div>
  );
}
