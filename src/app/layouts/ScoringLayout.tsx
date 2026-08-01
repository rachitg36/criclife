import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router';
import { isLocal } from '@/lib/env';

/**
 * THE NO-SCROLL SHELL.
 *
 * The scorer is standing in the sun holding a phone in one hand. This screen
 * scrolls zero pixels, ever. If content does not fit, the design is wrong —
 * not the phone.
 *
 * Guarded by tests/e2e/scorer-no-scroll.spec.ts at 320×568, 375×667, 390×844
 * and 430×932. That test gates every PR touching the scorer view.
 *
 * docs/05-SCORER-VIEW.md § 3
 */
export function ScoringLayout() {
  const shellRef = useRef<HTMLDivElement>(null);

  // Dev-time tripwire: shout in the console the moment anything overflows,
  // long before the Playwright suite catches it in CI.
  useEffect(() => {
    if (!isLocal) return;
    const el = shellRef.current;
    if (!el) return;

    const check = () => {
      if (el.scrollHeight > el.clientHeight) {
        console.error(
          `[no-scroll violation] Scoring shell overflows by ${
            el.scrollHeight - el.clientHeight
          }px at ${window.innerWidth}×${window.innerHeight}. ` +
            `See docs/05-SCORER-VIEW.md § 3 — the layout budget is fixed.`
        );
      }
    };

    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    check();

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <div
      ref={shellRef}
      data-testid="scoring-shell"
      className="no-scroll-shell flex flex-col bg-[var(--bg-base)]"
    >
      <Outlet />
    </div>
  );
}
