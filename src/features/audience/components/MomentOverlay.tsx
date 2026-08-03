import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useUiStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';
import { useAudienceStore } from '../store';
import type { Moment } from '../moments';
import type { AudienceView } from '../useAudienceView';

/**
 * docs/06 § 4 — the celebrations. Everything here is gated twice: by the
 * "Calm mode" toggle in the header and by `prefers-reduced-motion`. When
 * either is on, a moment still *appears* — a spectator with reduced motion
 * should still learn that a six was hit — but as a plain fade with no
 * particles, no shake, and no vignette.
 *
 * Moments play strictly one at a time, oldest first, draining the store's
 * queue. A wicket off the last ball of the match must not be drawn on top of
 * the match-won confetti.
 */
export function MomentOverlay({ view }: { view: AudienceView }) {
  const queue = useAudienceStore((s) => s.momentQueue);
  const consumeMoment = useAudienceStore((s) => s.consumeMoment);
  const calmMode = useUiStore((s) => s.calmMode);
  const prefersReduced = useReducedMotion();
  const calm = calmMode || prefersReduced === true;

  const current = queue[0] ?? null;
  const [shown, setShown] = useState<Moment | null>(null);

  useEffect(() => {
    if (!current) {
      setShown(null);
      return;
    }
    setShown(current);
    const hold = calm ? Math.min(current.durationMs, 900) : current.durationMs;
    const timer = setTimeout(() => consumeMoment(current.key), hold);
    return () => clearTimeout(timer);
  }, [current, calm, consumeMoment]);

  const subject = useMemo(() => {
    if (!shown) return null;
    if (shown.playerId) return view.nameOf(shown.playerId);
    if (shown.teamId) return view.teamById.get(shown.teamId)?.name ?? null;
    return null;
  }, [shown, view]);

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.key}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-50 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: calm ? 0.15 : 0.22 }}
        >
          {!calm && shown.kind === 'wicket' && <div className="vignette-wicket" aria-hidden />}
          {!calm && shown.kind === 'six' && <SixParticles />}
          {!calm && shown.kind === 'match_won' && <Confetti />}

          <motion.div
            className={cn(
              'relative px-8 text-center',
              !calm && shown.kind === 'wicket' && 'shake-wicket'
            )}
            initial={calm ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
            animate={calm ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={calm ? { duration: 0.15 } : { type: 'spring', stiffness: 320, damping: 18 }}
          >
            <p
              className={cn(
                'font-semibold leading-none tracking-[0.02em]',
                TONE[shown.kind] ?? 'text-[var(--text-primary)]'
              )}
              style={{ fontSize: 'var(--text-display-lg)' }}
            >
              {shown.headline}
            </p>
            {(subject ?? shown.detail) && (
              <p className="mt-2 text-[var(--text-heading-md)] font-medium text-[var(--text-primary)]">
                {shown.detail ?? subject}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const TONE: Partial<Record<Moment['kind'], string>> = {
  four: 'text-[var(--run-four)]',
  six: 'text-[var(--run-six)]',
  wicket: 'text-[var(--wicket)]',
  fifty: 'text-[var(--extra)]',
  hundred: 'text-[var(--extra)]',
  maiden: 'text-[var(--success)]',
  hat_trick_ball: 'text-[var(--extra)]',
  last_over: 'text-[var(--accent)]',
  match_won: 'text-[var(--accent)]',
};

/**
 * docs/06 § 8 wants "a single pooled canvas, destroyed after 2s idle". These
 * are a fixed set of GPU-composited divs instead: same visual job, no canvas
 * to pool or tear down, nothing retained once the overlay unmounts, and it
 * costs no main-thread work per frame. Deliberate simplification — see
 * HANDOFF.md § 6.2.
 */
function SixParticles() {
  const bits = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        return { id: i, x: Math.cos(angle) * 190, y: Math.sin(angle) * 190 };
      }),
    []
  );

  return (
    <div className="absolute inset-0 grid place-items-center" aria-hidden>
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute h-2 w-2 rounded-full bg-[var(--accent)]"
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: b.x, y: b.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: (i * 37) % 100,
        delay: ((i * 13) % 20) / 20,
        drift: ((i % 7) - 3) * 24,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <motion.span
          key={b.id}
          className="absolute top-[-6%] h-3 w-1.5 rounded-[1px] bg-[var(--accent)]"
          style={{ left: `${b.left}%` }}
          initial={{ y: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', x: b.drift, rotate: 540, opacity: 0.9 }}
          transition={{ duration: 3, delay: b.delay, ease: 'linear' }}
        />
      ))}
    </div>
  );
}
