import { useEffect, useRef, useState } from 'react';
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
 * Rendered as a bottom sheet beside `WicketSheet`, **not** inside `RunPad`.
 * It began life as `absolute inset-0` within the pad's own ~168px box, so the
 * field diagram overflowed it and was clipped away by the no-scroll shell
 * (CLAUDE.md rule 2) — reported as the prompt "never came on singles". It was
 * rendering the whole time; there was nowhere for it to render.
 *
 * Geometry matches `components/viz/WagonWheel.tsx` exactly: -1..1 with the
 * batter at the origin and the bowler's end at negative y. If one of these two
 * ever moves, the other has to move with it — the shots would silently land in
 * the wrong quadrant, which is the kind of wrong that looks plausible.
 */
const LIFETIME_MS = 4000;
const R = 90;
const C = 100;

/** Same scale the run pad and the wagon wheel use — CLAUDE.md rule 7. */
function shotColour(runs: number): string {
  if (runs >= 6) return 'var(--run-six)';
  if (runs >= 4) return 'var(--run-four)';
  return 'var(--accent)';
}

export function ShotPrompt() {
  const prompt = useScorerStore((s) => s.shotPrompt);
  const attachShot = useScorerStore((s) => s.attachShot);
  const dismiss = useScorerStore((s) => s.dismissShotPrompt);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Where the tap landed, so the scorer can see what they just recorded.
  // Without it the overlay closed on a tap and gave no sign of *what* it
  // captured — "it's very, very not clear what I did".
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!prompt) return;
    setPlaced(null);
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
    const fx = Number(x.toFixed(3));
    const fy = Number(y.toFixed(3));
    // Draw it, then commit. The overlay stays up for a beat so the mark is
    // actually seen — the whole complaint was that the tap vanished without
    // showing anything.
    setPlaced({ x: fx, y: fy });
    setTimeout(() => void attachShot(fx, fy), 450);
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex max-h-[60dvh] flex-col items-center gap-2 rounded-t-[var(--r-lg)] border-t border-[var(--border-default)] bg-[var(--surface-glass-strong)] px-3 pt-3 pb-[calc(var(--sp-3)+var(--safe-b))] backdrop-blur-xl">
      <p className="text-[13px] font-medium text-[var(--text-secondary)]">
        Where did the {prompt.runs} go?
      </p>
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        onClick={onTap}
        role="img"
        aria-label="Tap where the ball went"
        className="w-full max-w-[220px] flex-1 touch-manipulation"
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
        {/* The pitch, with the two ends told apart.
            An empty circle with a bare rectangle in it gives no clue which
            way round it is, and the whole point of the tap is direction —
            "please show a bat on one side of the pitch and wicket on the
            other". Batter's end at the bottom (y positive), bowler's end at
            the top (negative y), matching the coordinates this writes and
            `WagonWheel` reads. */}
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

        {/* Bowler's end: three stumps and a bail line. */}
        <g stroke="var(--text-tertiary)" strokeWidth={1} strokeLinecap="round">
          <line x1={C - 2.5} y1={C - 20} x2={C - 2.5} y2={C - 14} />
          <line x1={C} y1={C - 20} x2={C} y2={C - 14} />
          <line x1={C + 2.5} y1={C - 20} x2={C + 2.5} y2={C - 14} />
          <line x1={C - 3.5} y1={C - 20} x2={C + 3.5} y2={C - 20} />
        </g>

        {/* Batter's end: a bat, angled as a right-hander holds it. */}
        <g transform={`translate(${C - 1} ${C + 14}) rotate(-24)`}>
          <rect x={-2} y={-11} width={4} height={11} rx={0.6} fill="var(--text-tertiary)" />
          <rect x={-3} y={0} width={6} height={11} rx={2} fill="var(--text-secondary)" />
        </g>

        <text
          x={C}
          y={C - 25}
          textAnchor="middle"
          className="fill-[var(--text-tertiary)] text-[7px]"
        >
          BOWLER
        </text>
        <text
          x={C}
          y={C + 34}
          textAnchor="middle"
          className="fill-[var(--text-tertiary)] text-[7px]"
        >
          BATTER
        </text>
        {placed && (
          <g>
            {/* The shot: a line from the bat to where it went, and a ball at
                the end, coloured like the run pad's own 4 and 6. */}
            <line
              x1={C}
              y1={C}
              x2={C + placed.x * R}
              y2={C + placed.y * R}
              stroke={shotColour(prompt.runs)}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle
              cx={C + placed.x * R}
              cy={C + placed.y * R}
              r={5}
              fill={shotColour(prompt.runs)}
              stroke="var(--surface-1)"
              strokeWidth={1.5}
            />
          </g>
        )}
      </svg>
      <button
        type="button"
        onClick={dismiss}
        className="press min-h-11 px-4 text-[13px] font-medium text-[var(--text-tertiary)]"
      >
        {placed ? 'Saved ✓' : 'Skip'}
      </button>
    </div>
  );
}
