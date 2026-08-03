import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, Globe, Plus, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { fetchRanksData, type RanksData } from './api';
import {
  buildBoard,
  filterFromSearchParams,
  filterToSearchParams,
  qualificationProgress,
} from './filters';
import { BOARDS, BOARD_LABELS, type Board, type RanksFilter } from './types';
import { RankRowItem } from './components/RankRowItem';
import { TeamFilterSheet } from './components/TeamFilterSheet';

/**
 * `/ranks` — docs/07-STATS-AND-RANKINGS.md § 3.
 *
 * The requirement this page exists to satisfy, verbatim from docs/07 § 3:
 * "There should be a ranking without any filtering for all the players of all
 * the teams." So the page **opens unfiltered**, on the global board, and the
 * team chips narrow the population without ever touching the ratings.
 *
 * Filter state lives in the URL (docs/07 § 3.2) so a filtered board is
 * shareable, and is mirrored to localStorage so returning to the page keeps
 * your selection.
 */
const STORAGE_KEY = 'criclife.ranks.filter';

export default function RanksRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<RanksData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showEmerging, setShowEmerging] = useState(false);

  const filter = useMemo(() => filterFromSearchParams(searchParams), [searchParams]);

  const setFilter = useCallback(
    (next: RanksFilter) => {
      setSearchParams(filterToSearchParams(next), { replace: true });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next.teamIds));
      } catch {
        /* private mode — the URL is still the source of truth */
      }
    },
    [setSearchParams]
  );

  // Restore the remembered team selection, but only when the URL says nothing.
  // A shared link must always win over whatever this device last looked at.
  useEffect(() => {
    if (searchParams.has('teams') || searchParams.has('board')) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const teamIds: unknown = saved ? JSON.parse(saved) : null;
      if (Array.isArray(teamIds) && teamIds.length > 0) {
        setSearchParams(filterToSearchParams({ ...filter, teamIds: teamIds as string[] }), {
          replace: true,
        });
      }
    } catch {
      /* ignore malformed storage */
    }
    // Deliberately once, on mount: this is a restore, not a sync. Re-running
    // it whenever the filter changed would fight the user's own edits.
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    setStatus('loading');
    fetchRanksData(abort.signal)
      .then((d) => {
        setData(d);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setStatus('error');
      });
    return () => abort.abort();
  }, []);

  const board = useMemo(() => {
    if (!data) return null;
    return buildBoard(data.players, filter, data.movement);
  }, [data, filter]);

  const teamById = useMemo(() => new Map((data?.teams ?? []).map((t) => [t.id, t])), [data]);

  const teamLabelFor = useCallback(
    (teamIds: string[]) =>
      teamIds
        .map((id) => teamById.get(id)?.shortCode)
        .filter(Boolean)
        .join(', ') || null,
    [teamById]
  );

  const filtered = filter.teamIds.length > 0;

  return (
    <div className="pb-[calc(var(--sp-16)+var(--safe-b))]">
      <header
        className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-glass-strong)] px-3 py-2.5 backdrop-blur-xl"
        style={{ paddingTop: 'calc(var(--safe-t) + 10px)' }}
      >
        <Link
          to="/"
          aria-label="Home"
          className="press -ml-1 grid h-9 w-9 place-items-center rounded-[var(--r-full)] text-[var(--text-secondary)]"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="flex-1 text-[var(--text-heading-sm)] font-semibold tracking-[0.04em]">
          RANKS
        </h1>
      </header>

      <div
        role="tablist"
        aria-label="Ranking boards"
        className="flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)] px-3 py-2"
      >
        {BOARDS.map((b) => (
          <button
            key={b}
            type="button"
            role="tab"
            aria-selected={filter.board === b}
            onClick={() => setFilter({ ...filter, board: b })}
            className={cn(
              'press shrink-0 rounded-[var(--r-full)] px-3 py-1.5 text-[13px] font-medium',
              filter.board === b
                ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                : 'text-[var(--text-secondary)]'
            )}
          >
            {BOARD_LABELS[b as Board]}
          </button>
        ))}
      </div>

      {/* Filter bar — docs/07 § 3.2's "🌐 All Teams" default. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] px-3 py-2">
        {!filtered ? (
          <span className="inline-flex items-center gap-1.5 rounded-[var(--r-full)] bg-[var(--surface-2)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)]">
            <Globe size={13} aria-hidden /> All teams
          </span>
        ) : (
          filter.teamIds.map((id) => {
            const team = teamById.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-[var(--r-full)] px-2.5 py-1 text-[12px] font-medium"
                style={{
                  background: `color-mix(in oklch, ${team?.primaryColor ?? 'var(--accent)'} 20%, transparent)`,
                }}
              >
                {team?.shortCode ?? '—'}
                <button
                  type="button"
                  aria-label={`Remove ${team?.name ?? 'team'} filter`}
                  onClick={() =>
                    setFilter({ ...filter, teamIds: filter.teamIds.filter((t) => t !== id) })
                  }
                  className="press"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            );
          })
        )}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="press inline-flex items-center gap-1 rounded-[var(--r-full)] border border-dashed border-[var(--border-default)] px-2.5 py-1 text-[12px] text-[var(--text-secondary)]"
        >
          <Plus size={12} aria-hidden /> Filter by team
        </button>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col gap-2 p-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {status === 'error' && (
        <p className="px-6 py-16 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Couldn&apos;t load the rankings. Check your connection and try again.
        </p>
      )}

      {status === 'ready' && board && (
        <>
          {board.ranked.length === 0 && board.emerging.length === 0 ? (
            <EmptyBoard board={filter.board} filtered={filtered} />
          ) : (
            <>
              <div className="flex flex-col gap-2 px-3 py-3">
                {board.ranked.slice(0, 3).map((row) => (
                  <RankRowItem
                    key={row.player.playerId}
                    row={row}
                    podium
                    ghost={filtered}
                    teamLabel={teamLabelFor(row.player.teamIds)}
                  />
                ))}
              </div>

              {board.ranked.length > 3 && (
                <ol className="px-1">
                  {board.ranked.slice(3).map((row) => (
                    <li key={row.player.playerId}>
                      <RankRowItem
                        row={row}
                        ghost={filtered}
                        teamLabel={teamLabelFor(row.player.teamIds)}
                      />
                    </li>
                  ))}
                </ol>
              )}

              {board.emerging.length > 0 && (
                <section className="mt-2 border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    aria-expanded={showEmerging}
                    onClick={() => setShowEmerging((v) => !v)}
                    className="press flex w-full items-center gap-2 px-4 py-3 text-left"
                  >
                    <span className="flex-1 text-[var(--text-body-sm)] font-medium">
                      Emerging
                      <span className="ml-2 font-normal text-[var(--text-tertiary)]">
                        below qualification
                      </span>
                    </span>
                    <span className="text-[13px] tabular-nums text-[var(--text-tertiary)]">
                      {board.emerging.length}
                    </span>
                  </button>

                  {showEmerging && (
                    <ul className="px-1 pb-2">
                      {board.emerging.map((row) => (
                        <li
                          key={row.player.playerId}
                          className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-2.5 last:border-b-0"
                        >
                          <ProgressRing value={qualificationProgress(row.player, filter.board)} />
                          <Link
                            to={`/players/${row.player.playerId}`}
                            className="press min-w-0 flex-1"
                          >
                            <span className="block truncate text-[var(--text-body-sm)] font-medium">
                              {row.player.displayName}
                            </span>
                            <span className="block truncate text-[11px] text-[var(--text-tertiary)]">
                              {teamLabelFor(row.player.teamIds) ?? '—'} · {row.player.matches} match
                              {row.player.matches === 1 ? '' : 'es'}
                            </span>
                          </Link>
                          <span className="shrink-0 text-[var(--text-body-sm)] tabular-nums opacity-70">
                            {row.rating.toFixed(1)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}

      {sheetOpen && data && (
        <TeamFilterSheet
          teams={data.teams}
          selected={filter.teamIds}
          matchAll={filter.matchAllTeams}
          onToggle={(id) =>
            setFilter({
              ...filter,
              teamIds: filter.teamIds.includes(id)
                ? filter.teamIds.filter((t) => t !== id)
                : [...filter.teamIds, id],
            })
          }
          onSetMatchAll={(v) => setFilter({ ...filter, matchAllTeams: v })}
          onClear={() => setFilter({ ...filter, teamIds: [] })}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

function EmptyBoard({ board, filtered }: { board: Board; filtered: boolean }) {
  return (
    <div className="mx-auto max-w-sm px-6 py-16 text-center">
      <p className="text-[var(--text-heading-sm)] font-semibold">Nothing to rank yet</p>
      <p className="mt-2 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        {filtered
          ? 'No player in the selected teams has played enough to appear on this board. Try clearing the filter.'
          : `The ${BOARD_LABELS[board].toLowerCase()} board fills in once matches have been played and completed.`}
      </p>
    </div>
  );
}

/** The `3/5 matches` progress ring from docs/07 § 2.3. */
function ProgressRing({ value }: { value: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`}
      />
    </svg>
  );
}
