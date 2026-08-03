import { cn } from '@/lib/cn';
import type { AudienceTab } from '../store';

const TABS: { id: AudienceTab; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'charts', label: 'Charts' },
  { id: 'squads', label: 'Squads' },
];

/** docs/06 § 1 — segmented tabs. Sticky under the header so they never scroll away. */
export function AudienceTabs({
  active,
  onChange,
}: {
  active: AudienceTab;
  onChange: (tab: AudienceTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Match views"
      className="sticky top-0 z-20 flex gap-1 border-b border-[var(--border-subtle)] bg-[var(--surface-glass-strong)] px-3 py-2 backdrop-blur-xl"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`audience-tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`audience-panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={cn(
            'press flex-1 rounded-[var(--r-full)] px-3 py-1.5 text-[13px] font-medium transition-colors duration-[var(--dur-fast)]',
            active === tab.id
              ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
              : 'text-[var(--text-secondary)]'
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
