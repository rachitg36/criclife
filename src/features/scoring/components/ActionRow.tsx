import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';
import { useScorerStore } from '../store';

const LONG_PRESS_MS = 500;

/** docs/05-SCORER-VIEW.md § 1/2 — WICKET, UNDO (long-press → ball history),
    and the ⋯ overflow. `scorer_hand` mirrors WICKET/UNDO sides — docs § 4.
    The ⋯ overflow currently only reaches ball history/edit (task #52);
    the rarer actions it lists (retire batter, declare, abandon, …) are not
    in the Phase 5 roadmap bullets and are deliberately not built yet. */
export function ActionRow() {
  const openWicketSheet = useScorerStore((s) => s.openWicketSheet);
  const undo = useScorerStore((s) => s.undo);
  const openHistory = useScorerStore((s) => s.openHistory);
  const mode = useScorerStore((s) => s.mode);
  const scorerHand = useUiStore((s) => s.scorerHand);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const disabled = mode !== 'READY';

  const startPress = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      openHistory();
    }, LONG_PRESS_MS);
  };
  const endPress = (commit: boolean) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (commit && !longPressed.current) void undo();
  };

  const wicketBtn = (
    <button
      type="button"
      disabled={disabled}
      className="press min-h-14 flex-[2] rounded-[var(--r-md)] bg-[var(--wicket)] text-[17px] font-bold tracking-[0.04em] text-white disabled:pointer-events-none disabled:opacity-40"
      onClick={openWicketSheet}
    >
      WICKET
    </button>
  );
  const undoBtn = (
    <button
      type="button"
      disabled={disabled}
      className="press panel min-h-14 flex-1 rounded-[var(--r-md)] text-[15px] font-semibold text-[var(--text-secondary)] disabled:pointer-events-none disabled:opacity-40"
      onPointerDown={startPress}
      onPointerUp={() => endPress(true)}
      onPointerLeave={() => endPress(false)}
    >
      UNDO
    </button>
  );

  return (
    <div className={cn('flex h-16 shrink-0 items-stretch gap-2 px-3 pb-2')}>
      {scorerHand === 'left' ? (
        <>
          {undoBtn}
          {wicketBtn}
        </>
      ) : (
        <>
          {wicketBtn}
          {undoBtn}
        </>
      )}
      <button
        type="button"
        className="press panel min-h-14 w-14 shrink-0 rounded-[var(--r-md)] text-[20px] text-[var(--text-secondary)]"
        onClick={openHistory}
      >
        ⋯
      </button>
    </div>
  );
}
