import { useUiStore } from '@/stores/uiStore';
import { cn } from '@/lib/cn';

/**
 * `/settings/scoring` — docs/05 § 4's scorer preferences, in one place rather
 * than only inside the pad's own settings tab. Everything here already exists
 * in `uiStore` and is already honoured by the pad; this screen is the copy of
 * those controls that a scorer can find *before* a match starts, which is when
 * they actually want to set them.
 */
export function ScoringSettings() {
  const scorerHand = useUiStore((s) => s.scorerHand);
  const setScorerHand = useUiStore((s) => s.setScorerHand);
  const hapticsEnabled = useUiStore((s) => s.hapticsEnabled);
  const toggleHaptics = useUiStore((s) => s.toggleHaptics);
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const toggleSound = useUiStore((s) => s.toggleSound);
  const keepScreenAwake = useUiStore((s) => s.keepScreenAwake);
  const setKeepScreenAwake = useUiStore((s) => s.setKeepScreenAwake);
  const advancedScoring = useUiStore((s) => s.advancedScoring);
  const setAdvancedScoring = useUiStore((s) => s.setAdvancedScoring);

  return (
    <div className="flex flex-col gap-3 p-3">
      <h1 className="px-1 text-[var(--text-heading-lg)] font-semibold">Scoring</h1>

      <fieldset className="panel rounded-[var(--r-lg)] p-4">
        <legend className="text-[var(--text-heading-sm)] font-semibold">Handedness</legend>
        <p className="mt-1 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Puts WICKET and UNDO under your thumb. Mirrors the pad&apos;s action row.
        </p>
        <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Scoring hand">
          {(['right', 'left'] as const).map((hand) => (
            <button
              key={hand}
              type="button"
              role="radio"
              aria-checked={scorerHand === hand}
              onClick={() => setScorerHand(hand)}
              className={cn(
                'press flex-1 rounded-[var(--r-md)] border px-3 py-2 text-[var(--text-body-sm)] font-medium capitalize',
                scorerHand === hand
                  ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                  : 'border-[var(--border-default)] text-[var(--text-secondary)]'
              )}
            >
              {hand}-handed
            </button>
          ))}
        </div>
      </fieldset>

      <div className="panel rounded-[var(--r-lg)] p-0">
        <Toggle
          label="Haptics"
          hint="A short buzz per ball, stronger for a boundary or a wicket."
          checked={hapticsEnabled}
          onChange={toggleHaptics}
        />
        <Toggle
          label="Sound"
          hint="Off by default — most grounds are loud enough."
          checked={soundEnabled}
          onChange={toggleSound}
        />
        <Toggle
          label="Keep the screen awake"
          hint="Stops the phone sleeping between overs. Costs battery."
          checked={keepScreenAwake}
          onChange={() => setKeepScreenAwake(!keepScreenAwake)}
        />
        <Toggle
          label="Advanced scoring"
          hint="After a scoring shot, tap the field to say where it went — for the wagon wheel. Ignore it and the ball stands anyway."
          checked={advancedScoring}
          onChange={() => setAdvancedScoring(!advancedScoring)}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-[var(--text-body)] font-medium">{label}</span>
        <span className="block text-[11px] text-[var(--text-tertiary)]">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}
