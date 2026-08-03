import { Link, useParams } from 'react-router';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useUiStore } from '@/stores/uiStore';

/** docs/05-SCORER-VIEW.md § 7 — theme, haptics, handedness. Match config's
    "live-editable fields only" isn't built here: docs doesn't say which
    fields qualify, and Phase 4 already stubbed a dedicated match-settings
    route — linking to it avoids duplicating that decision. */
export function SettingsTab() {
  const { matchId } = useParams();
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
    <div className="flex-1 overflow-y-auto px-3 py-3">
      <div className="flex flex-col gap-4">
        <Row label="Theme">
          <ThemeToggle compact />
        </Row>

        <Row label="Scoring hand" hint="Mirrors WICKET/UNDO to your thumb.">
          <div className="flex gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] p-0.5">
            {(['left', 'right'] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setScorerHand(h)}
                className={
                  'press rounded-full px-3 py-1.5 text-[13px] font-medium capitalize ' +
                  (scorerHand === h
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'text-[var(--text-secondary)]')
                }
              >
                {h}
              </button>
            ))}
          </div>
        </Row>

        <ToggleRow label="Haptics" value={hapticsEnabled} onChange={toggleHaptics} />
        <ToggleRow label="Sound" value={soundEnabled} onChange={toggleSound} />
        <ToggleRow
          label="Keep screen awake"
          hint="Prevents the phone from sleeping mid-over."
          value={keepScreenAwake}
          onChange={() => setKeepScreenAwake(!keepScreenAwake)}
        />
        <ToggleRow
          label="Advanced scoring"
          hint="Adds a shot/pitch overlay after each ball. One extra tap."
          value={advancedScoring}
          onChange={() => setAdvancedScoring(!advancedScoring)}
        />

        {matchId && (
          <Link
            to={`/matches/${matchId}/settings`}
            className="mt-2 text-[13px] text-[var(--accent)] underline"
          >
            Match settings →
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[14px] font-medium text-[var(--text-primary)]">{label}</div>
        {hint && <div className="text-[12px] text-[var(--text-tertiary)]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <Row label={label} {...(hint ? { hint } : {})}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={onChange}
        className={
          'press h-7 w-12 rounded-full p-1 transition-colors ' +
          (value ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)]')
        }
      >
        <span
          className={
            'block h-5 w-5 rounded-full bg-white transition-transform ' +
            (value ? 'translate-x-5' : 'translate-x-0')
          }
        />
      </button>
    </Row>
  );
}
