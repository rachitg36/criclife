import { cn } from '@/lib/cn';

export type ConnectionState = 'live' | 'reconnecting' | 'paused' | 'offline';

const LABELS: Record<ConnectionState, string> = {
  live: 'LIVE',
  reconnecting: 'RECONNECTING',
  paused: 'PAUSED',
  offline: 'OFFLINE',
};

const COLOURS: Record<ConnectionState, string> = {
  live: 'text-[var(--live)]',
  reconnecting: 'text-[var(--warning)]',
  paused: 'text-[var(--text-tertiary)]',
  offline: 'text-[var(--text-tertiary)]',
};

export function LivePill({ state = 'live' }: { state?: ConnectionState }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em]',
        COLOURS[state]
      )}
      role="status"
      aria-live="polite"
    >
      {state === 'live' ? (
        <span className="live-dot" aria-hidden />
      ) : (
        <span
          className="inline-block h-2 w-2 rounded-full bg-current opacity-60"
          aria-hidden
        />
      )}
      {LABELS[state]}
    </span>
  );
}
