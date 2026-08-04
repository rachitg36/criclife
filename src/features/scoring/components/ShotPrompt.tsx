import { useEffect, useRef } from 'react';
import { useScorerStore } from '../store';

/**
 * Advanced Mode's wagon-wheel capture — docs/05 § 8.
 *
 * The toggle for this has been in two settings screens since Phase 5 and
 * nothing read it: `advancedScoring` was written, persisted, and never
 * consulted anywhere. The audience view's wagon wheel has been saying "the
 * scorer didn't use Advanced Mode" for every match ever scored, because there
 * was no way to use it.
 *
 * The ball is **already recorded** by the time this appears — the pad never
 * waits for anything, least of all a second tap. Tap the field and the
 * coordinate is patched onto the still-queued ball (no extra request, works
 * with no signal); ignore it and it fades after `LIFETIME_MS` with the score
 * exactly as it was.
 *
 * Geometry matches `components/viz/WagonWheel.tsx` exactly: -1..1 with the
 * batter at the origin and the bowler's end at negative y. If one of these two
 * ever moves, the other has to move with it — the shots would silently land in
 * the wrong quadrant, which is the kind of wrong that looks plausible.
 */
const LIFETIME_MS = 4000;
const R = 90;
const C = 100;

export function ShotPrompt() {
  const prompt = useScorerStore((s) => s.shotPrompt);
  const attachShot = useScorerStore((s) => s.attachShot);
  const dismiss = useScorerStore((s) => s.dismissShotPrompt);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!prompt) return;
    const t = setTimeout(dismiss, LIFETIME_MS);
    return () => clearTimeout(t);
  }, [prompt, dismiss]);

  if (!prompt) return null;

  function onTap(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    // viewBox is 0 0 200 200 and the element is square, so one scale factor
    // does for both axes.
    const vx = ((e.clientX - box.left) / box.width) * 200;
    const vy = ((e.clientY - box.top) / box.height) * 200;
    let x = (vx - C) / R;
    let y = (vy - C) / R;
    // Clamp to the boundary rather than rejecting a tap just outside it: a
    // six over long-on lands past the rope, and a scorer aiming at the edge
    // of a 260px circle on a phone should not have their tap thrown away.
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    void attachShot(Number(x.toFixed(3)), Number(y.toFixed(3)));
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-[var(--r-lg)] bg-[var(--surface-glass-strong)] p-3 backdrop-blur-xl">
      <p className="text-[13px] font-medium text-[var(--text-secondary)]">
        Where did the {prompt.runs} go?
      </p>
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        onClick={onTap}
        role="img"
        aria-label="Tap where the ball went"
        className="max-h-[52vh] w-full max-w-[240px] touch-manipulation"
      >
        <circle cx={C} cy={C} r={R} fill="var(--surface-2)" stroke="var(--border-default)" />
        <circle
          cx={C}
          cy={C}
          r={R * 0.55}
          fill="none"
          stroke="var(--border-subtle)"
          strokeDasharray="2 3"
        />
        <rect
          x={C - 4}
          y={C - 16}
          width={8}
          height={32}
          rx={1}
          fill="var(--surface-3)"
          stroke="var(--border-subtle)"
          strokeWidth={0.5}
        />
      </svg>
      <button
        type="button"
        onClick={dismiss}
        className="press min-h-11 px-4 text-[13px] font-medium text-[var(--text-tertiary)]"
      >
        Skip
      </button>
    </div>
  );
}
