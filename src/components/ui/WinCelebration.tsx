import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useUiStore } from '@/stores/uiStore';

/**
 * The moment somebody wins.
 *
 * This screen was a grey pill reading "Match complete" and one sentence —
 * "it's so boring right now", which was fair. A cricket match is hours of
 * somebody's Saturday and the app's reaction was a status label.
 *
 * Deliberate choices, since celebration code attracts decoration:
 *
 * - **The team's own colour leads.** Every side has one already
 *   (`teams.primary_color`), and nothing in the app had ever made it the point
 *   of a screen. `color-mix` keeps it legible against either theme without a
 *   second stored value — CLAUDE.md rule 7 means no palette is invented here.
 * - **Named people.** "These were the players" was the request, and it is the
 *   difference between a scoreline and *their* win. The two standout figures
 *   sit above the list, because a list of eleven names with nothing said about
 *   any of them is a roster, not a celebration.
 * - **Hand-rolled SVG confetti**, no library. A confetti dependency is 10–15 kB
 *   for what is thirty `<rect>`s on a spring, and the audience route has about
 *   four kilobytes of headroom left (rule 9). Positions come from an index, not
 *   `Math.random`, so the same win looks the same on every device and the
 *   render stays pure.
 * - **Calm mode and `prefers-reduced-motion` cut the motion entirely**, not
 *   partially. Same rule the moment overlays follow. Somebody who has asked for
 *   less movement is not asking for slower confetti.
 */
const PIECES = 34;

export type Celebrant = { id: string; name: string; note?: string | undefined };

export function WinCelebration({
  teamName,
  teamColor,
  headline,
  subline,
  players,
  playerOfTheMatch,
  compact = false,
}: {
  teamName: string;
  teamColor: string;
  /** The result sentence, already named — never the engine's id-laden text. */
  headline: string;
  subline?: string | undefined;
  players: Celebrant[];
  /** CricLife's own pick, labelled as such. There is no ICC rule for this —
      internationally it is a panel's subjective call after the game — so the
      screen must not imply otherwise. */
  playerOfTheMatch?: { name: string; summary: string } | undefined;
  /** The scorer's shell cannot scroll (rule 2), so it gets the shorter one. */
  compact?: boolean;
}) {
  const calmMode = useUiStore((s) => s.calmMode);
  const prefersReduced = useReducedMotion();
  const calm = calmMode || prefersReduced === true;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-4 text-center"
      style={{
        // A wash of the winners' colour, strong enough to read as theirs and
        // weak enough to keep text on it legible in both themes.
        background: `radial-gradient(120% 80% at 50% 0%, color-mix(in oklch, ${teamColor} 34%, transparent), transparent 70%)`,
      }}
    >
      {!calm && <Confetti color={teamColor} />}

      <motion.div
        initial={calm ? false : { scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        className="relative flex flex-col items-center"
      >
        <span className="label-overline text-[var(--text-tertiary)]">Winners</span>
        <h1
          className="font-display mt-1 leading-none font-extrabold"
          style={{
            fontSize: compact ? 'clamp(30px, 9vw, 46px)' : 'clamp(36px, 11vw, 64px)',
            color: `color-mix(in oklch, ${teamColor} 78%, var(--text-primary))`,
          }}
        >
          {teamName}
        </h1>
        <p className="mt-2 max-w-sm text-[15px] font-semibold text-[var(--text-primary)]">
          {headline}
        </p>
        {subline && (
          <p className="mt-1 max-w-sm text-[13px] text-[var(--text-secondary)]">{subline}</p>
        )}
      </motion.div>

      {playerOfTheMatch && (
        <motion.div
          initial={calm ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: calm ? 0 : 0.2, duration: 0.35 }}
          className="relative mt-3 rounded-[var(--r-md)] border px-3 py-2"
          style={{
            borderColor: `color-mix(in oklch, ${teamColor} 45%, transparent)`,
            background: `color-mix(in oklch, ${teamColor} 14%, transparent)`,
          }}
        >
          <p className="label-overline text-[var(--text-tertiary)]">Player of the match</p>
          <p className="mt-0.5 text-[17px] font-bold text-[var(--text-primary)]">
            {playerOfTheMatch.name}
          </p>
          <p className="text-[12px] text-[var(--text-secondary)] tabular-nums">
            {playerOfTheMatch.summary}
          </p>
          {/* Said out loud, because it is not an official award and pretending
              otherwise would make every disagreement look like a bug. */}
          <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">CricLife’s pick</p>
        </motion.div>
      )}

      {players.length > 0 && (
        <motion.div
          initial={calm ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: calm ? 0 : 0.35, duration: 0.4 }}
          // Scrolls inside itself in compact mode rather than pushing the
          // Publish button off the pad. The shell must not scroll (rule 2);
          // an inner scroll region is how the scorer's other tabs already
          // handle overflow, and clipping names would be worse than either.
          className={
            compact
              ? 'relative mt-3 max-h-[34dvh] w-full max-w-sm overflow-y-auto'
              : 'relative mt-4 w-full max-w-sm'
          }
        >
          <p className="label-overline mb-2 text-[var(--text-tertiary)]">The winning side</p>
          <ul className="flex flex-wrap justify-center gap-1.5">
            {players.map((p) => (
              <li
                key={p.id}
                className="rounded-[var(--r-full)] border px-2.5 py-1 text-[12px]"
                style={{
                  borderColor: `color-mix(in oklch, ${teamColor} 40%, transparent)`,
                  background: `color-mix(in oklch, ${teamColor} 12%, transparent)`,
                }}
              >
                <span className="font-medium text-[var(--text-primary)]">{p.name}</span>
                {p.note && (
                  <span className="ml-1.5 font-semibold text-[var(--text-secondary)] tabular-nums">
                    {p.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </div>
  );
}

/**
 * Rectangles falling through the card.
 *
 * **Two things were wrong the first time, and the second one hid the first.**
 *
 * The pieces animated to `y: '110vh'` — a *viewport* height — inside a card
 * that on the audience view is a few hundred pixels tall with
 * `overflow: hidden`. They cleared the card in a couple of frames and spent
 * the rest of the animation clipped, so the whole effect was a flicker at the
 * top edge. `110%` is the container, which is what was meant.
 *
 * And it started on mount. On the audience view the card sits below the hero,
 * so on a finished match the confetti had already run and finished by the time
 * anybody scrolled down to it. Reported exactly that way: "confetti did not
 * come when seeing the old match". It now waits until the card is actually on
 * screen.
 *
 * Positions still come from the index rather than `Math.random`, so the render
 * stays pure and a replayed match celebrates identically every time.
 */
function Confetti({ color }: { color: string }) {
  // Null until measured. **The distance has to be a pixel number.**
  //
  // `y: '115%'` in motion is a percentage of *the element's own height*, the
  // same as a CSS transform — so twelve-pixel pieces moved twelve pixels.
  // Starting above the card at `top: -8%`, they never entered the frame at
  // all: strictly worse than the `110vh` it replaced, which at least
  // travelled. Measuring the container is the only version that is right in
  // both the tall scorer pad and the short audience card.
  const [fallTo, setFallTo] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const start = () => setFallTo(node.offsetHeight + 48);

    // No IntersectionObserver (old Safari, jsdom): just play. Missing the
    // celebration is worse than playing it slightly early.
    if (typeof IntersectionObserver === 'undefined') {
      start();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          start();
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {fallTo !== null &&
        Array.from({ length: PIECES }, (_, i) => {
          const left = ((i * 37) % 100) + (i % 3);
          const delay = (i % 7) * 0.12;
          const drift = i % 2 === 0 ? 16 : -16;
          // Alternating between the team's colour and the accent keeps it from
          // reading as a single flat sheet, without introducing a new palette.
          const fill = i % 3 === 0 ? 'var(--accent)' : color;
          return (
            <motion.span
              key={i}
              className="absolute block h-3 w-1.5 rounded-[1px]"
              style={{ left: `${left}%`, top: '-8%', background: fill }}
              initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
              animate={{ y: fallTo, x: drift, rotate: 540, opacity: [1, 1, 0] }}
              transition={{ duration: 2.2 + (i % 5) * 0.3, delay, ease: 'easeIn' }}
            />
          );
        })}
    </div>
  );
}
