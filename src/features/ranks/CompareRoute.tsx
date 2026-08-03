import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { fetchRanksData, type RanksData } from './api';
import { BOARDS, BOARD_LABELS, type Board, type RankPlayer } from './types';

/**
 * `/ranks/compare` — docs/07 § 3.4's head-to-head radar.
 *
 * The radar plots the five board ratings against each other. Both players are
 * normalised against **the same maximum across the whole league**, not against
 * each other: scaling to the pair would make a poor bowler look average purely
 * because their opponent is worse, which is the classic way a radar chart
 * lies.
 */
const AXES: Board[] = [...BOARDS];

export default function CompareRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<RanksData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const abort = new AbortController();
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

  const ids = useMemo(
    () => (searchParams.get('players') ?? '').split(',').filter(Boolean).slice(0, 2),
    [searchParams]
  );

  const selected = useMemo(
    () =>
      ids.map((id) => data?.players.find((p) => p.playerId === id)).filter(Boolean) as RankPlayer[],
    [ids, data]
  );

  const maxima = useMemo(() => {
    const out = {} as Record<Board, number>;
    for (const axis of AXES) {
      out[axis] = Math.max(1, ...(data?.players ?? []).map((p) => p.ratings[axis] ?? 0));
    }
    return out;
  }, [data]);

  const setIds = (next: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (next.length === 0) params.delete('players');
    else params.set('players', next.join(','));
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="pb-[calc(var(--sp-16)+var(--safe-b))]">
      <header
        className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-glass-strong)] px-3 py-2.5 backdrop-blur-xl"
        style={{ paddingTop: 'calc(var(--safe-t) + 10px)' }}
      >
        <Link
          to="/ranks"
          aria-label="Back to ranks"
          className="press -ml-1 grid h-9 w-9 place-items-center rounded-[var(--r-full)] text-[var(--text-secondary)]"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="flex-1 text-[var(--text-heading-sm)] font-semibold tracking-[0.04em]">
          COMPARE
        </h1>
      </header>

      {status === 'loading' && (
        <div className="flex flex-col gap-3 p-3">
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {status === 'error' && (
        <p className="px-6 py-16 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Couldn&apos;t load players to compare.
        </p>
      )}

      {status === 'ready' && data && (
        <>
          <div className="flex flex-wrap gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
            {selected.map((p, i) => (
              <span
                key={p.playerId}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[var(--r-full)] px-2.5 py-1 text-[12px] font-medium',
                  i === 0
                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                    : 'bg-[color-mix(in_oklch,var(--run-six)_20%,transparent)] text-[var(--run-six)]'
                )}
              >
                {p.displayName}
                <button
                  type="button"
                  aria-label={`Remove ${p.displayName}`}
                  onClick={() => setIds(ids.filter((id) => id !== p.playerId))}
                  className="press"
                >
                  <X size={12} aria-hidden />
                </button>
              </span>
            ))}
            {selected.length < 2 && (
              <span className="text-[12px] text-[var(--text-tertiary)]">
                Pick {2 - selected.length} more player{selected.length === 1 ? '' : 's'} below.
              </span>
            )}
          </div>

          {selected.length === 2 && (
            <>
              <Radar players={selected} maxima={maxima} />
              <table className="w-full text-[var(--text-body-sm)]">
                <caption className="sr-only">Head-to-head ratings by board</caption>
                <thead>
                  <tr className="text-[11px] text-[var(--text-tertiary)]">
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Board
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      {selected[0]!.displayName}
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      {selected[1]!.displayName}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {AXES.map((axis) => {
                    const a = selected[0]!.ratings[axis];
                    const b = selected[1]!.ratings[axis];
                    return (
                      <tr key={axis} className="border-t border-[var(--border-subtle)]">
                        <th scope="row" className="px-4 py-2 text-left font-normal">
                          {BOARD_LABELS[axis]}
                        </th>
                        <td
                          className={cn(
                            'px-2 py-2 text-right tabular-nums',
                            a !== null &&
                              b !== null &&
                              a > b &&
                              'font-semibold text-[var(--accent)]'
                          )}
                        >
                          {a === null ? '–' : a.toFixed(1)}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-2 text-right tabular-nums',
                            a !== null &&
                              b !== null &&
                              b > a &&
                              'font-semibold text-[var(--run-six)]'
                          )}
                        >
                          {b === null ? '–' : b.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          <section className="mt-3 border-t border-[var(--border-subtle)]">
            <h2 className="px-4 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-[var(--text-tertiary)]">
              CHOOSE PLAYERS
            </h2>
            <ul>
              {data.players
                .filter((p) => p.ratings.overall !== null)
                .sort((a, b) => (b.ratings.overall ?? 0) - (a.ratings.overall ?? 0))
                .slice(0, 60)
                .map((p) => {
                  const on = ids.includes(p.playerId);
                  return (
                    <li key={p.playerId}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setIds(
                            on
                              ? ids.filter((id) => id !== p.playerId)
                              : [...ids, p.playerId].slice(-2)
                          )
                        }
                        className={cn(
                          'press flex w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 text-left',
                          on && 'bg-[var(--surface-2)]'
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-[var(--text-body-sm)]">
                          {p.displayName}
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums text-[var(--text-tertiary)]">
                          {(p.ratings.overall ?? 0).toFixed(1)}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Radar({ players, maxima }: { players: RankPlayer[]; maxima: Record<Board, number> }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 78;

  const point = (axisIndex: number, value: number) => {
    const angle = (axisIndex / AXES.length) * Math.PI * 2 - Math.PI / 2;
    const d = r * value;
    return [cx + Math.cos(angle) * d, cy + Math.sin(angle) * d] as const;
  };

  const polygon = (p: RankPlayer) =>
    AXES.map((axis, i) =>
      point(i, Math.min(1, (p.ratings[axis] ?? 0) / maxima[axis])).join(',')
    ).join(' ');

  const colours = ['var(--accent)', 'var(--run-six)'];

  return (
    <div className="px-3 py-4">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="mx-auto w-full max-w-[280px]"
        role="img"
        aria-label={`Radar comparing ${players.map((p) => p.displayName).join(' and ')} across the five ranking boards`}
      >
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            key={ring}
            points={AXES.map((_, i) => point(i, ring).join(',')).join(' ')}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={0.7}
          />
        ))}
        {AXES.map((axis, i) => {
          const [x, y] = point(i, 1.16);
          return (
            <text
              key={axis}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={8}
              fill="var(--text-tertiary)"
            >
              {BOARD_LABELS[axis]}
            </text>
          );
        })}
        {players.map((p, i) => (
          <polygon
            key={p.playerId}
            points={polygon(p)}
            fill={colours[i]}
            fillOpacity={0.18}
            stroke={colours[i]}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <p className="mt-1 text-center text-[11px] text-[var(--text-tertiary)]">
        Each axis is scaled to the league&apos;s best on that board.
      </p>
    </div>
  );
}
