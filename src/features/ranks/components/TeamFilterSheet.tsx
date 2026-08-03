import { useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { RankTeam } from '../types';

/**
 * docs/07 § 3.2 — the team filter. A bottom sheet with a searchable,
 * multi-select list, plus the "Match all teams" toggle that switches the
 * semantics from union ("plays for any of these") to intersection ("plays for
 * all of these"), which is the rare but real "who turns out for both?" case.
 */
export function TeamFilterSheet({
  teams,
  selected,
  matchAll,
  onToggle,
  onSetMatchAll,
  onClear,
  onClose,
}: {
  teams: RankTeam[];
  selected: string[];
  matchAll: boolean;
  onToggle: (teamId: string) => void;
  onSetMatchAll: (value: boolean) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const visible = teams.filter((t) =>
    `${t.name} ${t.shortCode}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Filter by team"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[rgb(0_0_0/0.5)] backdrop-blur-[2px]"
      />

      <div className="relative max-h-[75dvh] overflow-hidden rounded-t-[var(--r-xl)] border-t border-[var(--border-default)] bg-[var(--surface-1)] pb-[var(--safe-b)]">
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <h2 className="flex-1 text-[var(--text-heading-sm)] font-semibold">Filter by team</h2>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="press text-[12px] text-[var(--accent)]"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="press grid h-8 w-8 place-items-center rounded-[var(--r-full)] text-[var(--text-tertiary)]"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5">
          <Search size={15} aria-hidden className="shrink-0 text-[var(--text-tertiary)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teams"
            aria-label="Search teams"
            className="w-full bg-transparent text-[var(--text-body-sm)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
        </div>

        <label className="flex items-center gap-3 border-y border-[var(--border-subtle)] px-4 py-2.5">
          <input
            type="checkbox"
            checked={matchAll}
            onChange={(e) => onSetMatchAll(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          <span className="flex-1 text-[var(--text-body-sm)]">
            Match all teams
            <span className="block text-[11px] text-[var(--text-tertiary)]">
              Only players who turn out for every selected team
            </span>
          </span>
        </label>

        <ul className="max-h-[45dvh] overflow-y-auto">
          {visible.length === 0 && (
            <li className="px-4 py-8 text-center text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
              No teams match “{query}”.
            </li>
          )}
          {visible.map((team) => {
            const on = selected.includes(team.id);
            return (
              <li key={team.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(team.id)}
                  className="press flex w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 text-left last:border-b-0"
                >
                  <span
                    aria-hidden
                    className="h-6 w-1.5 shrink-0 rounded-[var(--r-full)]"
                    style={{ background: team.primaryColor }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[var(--text-body-sm)] font-medium">
                      {team.name}
                    </span>
                    <span className="block text-[11px] text-[var(--text-tertiary)]">
                      {team.shortCode}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-[var(--r-sm)] border',
                      on
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
                        : 'border-[var(--border-default)]'
                    )}
                  >
                    {on && <Check size={13} aria-hidden />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
