import { Monitor, Moon, Sun } from 'lucide-react';
import { useUiStore } from '@/stores/uiStore';
import { transitionTheme, type ThemeMode } from '@/lib/theme';
import { cn } from '@/lib/cn';

const OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string; Icon: typeof Sun }> = [
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'Auto', Icon: Monitor },
];

/** Three-state segmented control. Animates a circular wipe from the tap point. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex gap-0.5 rounded-full border border-[var(--border-default)] bg-[var(--surface-2)] p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              transitionTheme(() => setTheme(value), {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
              });
            }}
            className={cn(
              'press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium',
              active
                ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            <Icon size={15} strokeWidth={1.75} aria-hidden />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
