import { cn } from '@/lib/cn';

export type ConnectionState = 'live' | 'reconnecting' | 'paused' | 'offline' | 'final';

const LABELS: Record<ConnectionState, string> = {
  live: 'LIVE',
  reconnecting: 'RECONNECTING',
  paused: 'PAUSED',
  offline: 'OFFLINE',
  // Not a connection state at all, and that is the point: a finished match is
  // finished whether the socket is up or not, and a pulsing LIVE badge over a
  // week-old game is simply a lie. Carried here rather than in a second
  // component so no caller can render the wrong one.
  final: 'FINAL',
};

const COLOURS: Record<ConnectionState, string> = {
  live: 'text-[var(--live)]',
  reconnecting: 'text-[var(--warning)]',
  paused: 'text-[var(--text-tertiary)]',
  offline: 'text-[var(--text-tertiary)]',
  final: 'text-[var(--text-secondary)]',
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
        <span className="inline-block h-2 w-2 rounded-full bg-current opacity-60" aria-hidden />
      )}
      {LABELS[state]}
    </span>
  );
}
