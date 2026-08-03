import { Link } from 'react-router';
import { ChevronUp, ChevronDown, Minus } from 'lucide-react';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { RankRow } from '../types';

/**
 * docs/07 § 3.1 — a dense ranking row, and the podium variant for the top
 * three. One component for both so a medal position can never drift from the
 * row below it in what it actually reports.
 */
export function RankRowItem({
  row,
  podium,
  teamLabel,
  ghost,
}: {
  row: RankRow;
  podium?: boolean;
  teamLabel: string | null;
  /** Show the global rank alongside — only meaningful on a filtered board. */
  ghost: boolean;
}) {
  const medal = podium ? ['rim-gold', 'rim-silver', 'rim-bronze'][row.rank - 1] : undefined;

  return (
    <Link
      to={`/players/${row.player.playerId}`}
      className={cn(
        'press flex items-center gap-3 px-3',
        podium
          ? cn('panel rounded-[var(--r-lg)] py-3', medal)
          : 'border-b border-[var(--border-subtle)] py-2.5 last:border-b-0'
      )}
    >
      <span
        className={cn(
          'shrink-0 text-right tabular-nums',
          podium ? 'w-8 text-[var(--text-heading-md)] font-semibold' : 'w-6 text-[13px]'
        )}
      >
        {row.rank}
      </span>

      <Movement value={row.movement} />

      <span
        aria-hidden
        className={cn(
          'grid shrink-0 place-items-center overflow-hidden rounded-[var(--r-full)] bg-[var(--surface-3)] text-[11px] font-semibold text-[var(--text-secondary)]',
          podium ? 'h-10 w-10' : 'h-7 w-7'
        )}
      >
        {row.player.photoUrl ? (
          <img
            src={row.player.photoUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          initials(row.player.displayName)
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate font-medium',
            podium ? 'text-[var(--text-heading-sm)]' : 'text-[var(--text-body-sm)]'
          )}
        >
          {row.player.displayName}
        </span>
        <span className="block truncate text-[11px] capitalize text-[var(--text-tertiary)]">
          {[teamLabel, row.player.role?.replace(/_/g, ' ')].filter(Boolean).join(' · ') || '—'}
          {ghost && row.globalRank !== null && (
            <span className="ml-1.5 tabular-nums opacity-70">(#{row.globalRank} global)</span>
          )}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end">
        <span
          className={cn(
            'font-semibold tabular-nums',
            podium ? 'text-[var(--text-heading-md)]' : 'text-[var(--text-body-sm)]',
            // docs/07 § 2.4 — a thin sample reads lighter, rather than being hidden.
            row.confidence < 0.5 && 'font-normal opacity-70'
          )}
        >
          {row.rating.toFixed(1)}
        </span>
        <ConfidenceBars value={row.confidence} />
      </span>
    </Link>
  );
}

function Movement({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="w-8 shrink-0" aria-hidden />;
  }
  if (value === 0) {
    return (
      <span className="flex w-8 shrink-0 items-center justify-center text-[var(--text-tertiary)]">
        <Minus size={12} aria-hidden />
        <span className="sr-only">no change</span>
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={cn(
        'flex w-8 shrink-0 items-center justify-center gap-0.5 text-[11px] tabular-nums',
        up ? 'text-[var(--success)]' : 'text-[var(--danger)]'
      )}
    >
      {up ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
      {Math.abs(value)}
      <span className="sr-only">
        {up ? 'up' : 'down'} {Math.abs(value)} places
      </span>
    </span>
  );
}

/** docs/07 § 2.4 — a subtle 3-bar indicator derived from sample size. */
function ConfidenceBars({ value }: { value: number }) {
  const filled = value >= 0.99 ? 3 : value >= 0.66 ? 2 : value >= 0.33 ? 1 : 0;
  return (
    <span
      className="mt-0.5 flex items-end gap-px"
      title={`Confidence ${Math.round(value * 100)}% — based on matches played`}
    >
      <span className="sr-only">Confidence {Math.round(value * 100)}%</span>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            'w-1 rounded-[1px]',
            i === 1 ? 'h-1' : i === 2 ? 'h-1.5' : 'h-2',
            i <= filled ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)]'
          )}
        />
      ))}
    </span>
  );
}
