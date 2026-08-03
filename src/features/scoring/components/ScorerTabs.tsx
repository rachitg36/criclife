import { cn } from '@/lib/cn';
import { useScorerStore } from '../store';

const TABS: { key: ReturnType<typeof useScorerStore.getState>['scorerTab']; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'map', label: 'Map' },
  { key: 'feed', label: 'Feed' },
  { key: 'settings', label: 'Settings' },
];

/** docs/05-SCORER-VIEW.md § 7 — "tapping away and back must restore the pad
    instantly (state lives in Zustand, not the route)": switching tabs is a
    local store write, not a navigation, so the pad's in-memory state (and
    any in-flight optimistic writes) survives untouched. */
export function ScorerTabs() {
  const scorerTab = useScorerStore((s) => s.scorerTab);
  const setScorerTab = useScorerStore((s) => s.setScorerTab);

  return (
    <div className="flex h-14 shrink-0 items-stretch border-t border-[var(--border-subtle)]">
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={cn(
            'flex flex-1 items-center justify-center text-[11px] font-semibold',
            scorerTab === key ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'
          )}
          onClick={() => setScorerTab(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
