import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { useAudienceStore } from '../store';

/**
 * docs/06 § 3 — "on return the app refetches and plays a short 'you missed 18
 * balls' catch-up summary card". This is also why a reconcile never fires
 * moments: eighteen celebrations replaying at once is not a catch-up, it's a
 * seizure. The card stands in for all of them.
 */
export function CatchUpCard() {
  const missed = useAudienceStore((s) => s.missedBalls);
  const dismiss = useAudienceStore((s) => s.dismissMissed);

  if (missed === null || missed <= 0) return null;

  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-3 mt-3 flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--border-glow)] bg-[var(--surface-2)] px-3 py-2.5"
    >
      <p className="min-w-0 flex-1 text-[var(--text-body-sm)]">
        <span className="font-semibold">
          You missed {missed} ball{missed === 1 ? '' : 's'}.
        </span>{' '}
        <span className="text-[var(--text-secondary)]">
          Caught up — scroll the feed to see them.
        </span>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="press grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-full)] text-[var(--text-tertiary)]"
      >
        <X size={15} aria-hidden />
      </button>
    </motion.div>
  );
}
