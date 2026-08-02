import { Card, CardHeader } from '@/components/ui/Card';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useUiStore } from '@/stores/uiStore';
import { ACCENT_PRESETS, type AccentName } from '@/lib/theme';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';

const SWATCH: Record<AccentName, string> = {
  cyan: '#22d3ee',
  violet: '#a855f7',
  lime: '#a3e635',
  amber: '#fbbf24',
  rose: '#fb7185',
  azure: '#38bdf8',
  team: 'linear-gradient(135deg,#22d3ee,#a855f7)',
};

/**
 * Fully functional in Phase 0 — this is the screen that proves the token
 * system, the theme switch and the persistence layer all work end to end.
 * docs/08-DESIGN-SYSTEM.md § 2
 */
export function AppearanceSettings() {
  const accent = useUiStore((s) => s.accent);
  const setAccent = useUiStore((s) => s.setAccent);
  const calmMode = useUiStore((s) => s.calmMode);
  const setCalmMode = useUiStore((s) => s.setCalmMode);

  return (
    <div className="space-y-4 px-4 py-6">
      <h1 className="text-[var(--text-heading-lg)]">Appearance</h1>

      <Card>
        <CardHeader overline="Theme" title="Dark, light or follow your device" />
        <ThemeToggle />
      </Card>

      <Card>
        <CardHeader
          overline="Accent"
          title="Accent colour"
          action={
            <span className="text-[var(--text-body-sm)] text-[var(--text-tertiary)]">{accent}</span>
          }
        />
        <div className="flex flex-wrap gap-2.5">
          {ACCENT_PRESETS.map((name) => (
            <button
              key={name}
              aria-label={name}
              aria-pressed={accent === name}
              onClick={() => {
                haptic('select');
                setAccent(name);
              }}
              className={cn(
                'press h-11 w-11 rounded-full border-2 transition-all',
                accent === name
                  ? 'border-[var(--text-primary)] scale-110'
                  : 'border-transparent opacity-70 hover:opacity-100'
              )}
              style={{ background: SWATCH[name] }}
            />
          ))}
        </div>
        <p className="mt-3 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">Team</strong> tints the whole app toward
          whichever side is batting during a live match.
        </p>
      </Card>

      <Card>
        <CardHeader overline="Motion" title="Calm mode" />
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={calmMode}
            onChange={(e) => setCalmMode(e.target.checked)}
            className="mt-1 h-5 w-5 accent-[var(--accent)]"
          />
          <span className="text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            Strip animations back to simple fades. Also applied automatically if your device
            requests reduced motion.
          </span>
        </label>
      </Card>
    </div>
  );
}
