import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { selectAll } from '@/lib/publicApi';
import { stat } from '@/lib/format';

/**
 * `/stats` — docs/12 Phase 8's "league leaderboards". Public, so it reads over
 * plain fetch like `/ranks` and `/live/:publicSlug` do.
 *
 * Every board here is a straight ordering of `player_career_stats`, which is
 * itself derived from the ball log. Nothing is computed twice: if a number
 * here disagrees with a scorecard, the scorecard is right and the career row
 * needs rebuilding, not this page.
 */

type CareerRow = {
  player_id: string;
  matches: number;
  runs: number;
  wickets: number;
  highest_score: number;
  highest_score_not_out: boolean;
  batting_average: number | null;
  strike_rate: number | null;
  economy: number | null;
  bowling_average: number | null;
  fifties: number;
  hundreds: number;
  catches: number;
  stumpings: number;
  run_outs: number;
  best_bowling_wickets: number | null;
  best_bowling_runs: number | null;
  player: { id: string; full_name: string; short_name: string | null } | null;
};

type Leader = { playerId: string; name: string; value: string; sub: string };

type BoardSpec = {
  id: string;
  title: string;
  description: string;
  /** Rows that cannot honestly appear on this board at all. */
  eligible: (r: CareerRow) => boolean;
  /** Negative sorts ascending — a bowling average wants the *lowest*. */
  sort: (a: CareerRow, b: CareerRow) => number;
  value: (r: CareerRow) => string;
  sub: (r: CareerRow) => string;
};

/** A minimum sample, so "best average" is not won by one lucky innings. */
const MIN_MATCHES = 3;

const BOARDS: BoardSpec[] = [
  {
    id: 'runs',
    title: 'Most runs',
    description: 'Career runs across every completed match.',
    eligible: (r) => r.runs > 0,
    sort: (a, b) => b.runs - a.runs,
    value: (r) => String(r.runs),
    sub: (r) => `${r.matches} match${r.matches === 1 ? '' : 'es'} · SR ${stat(r.strike_rate, 1)}`,
  },
  {
    id: 'wickets',
    title: 'Most wickets',
    description: 'Dismissals credited to the bowler.',
    eligible: (r) => r.wickets > 0,
    sort: (a, b) => b.wickets - a.wickets,
    value: (r) => String(r.wickets),
    sub: (r) =>
      `Econ ${stat(r.economy)} · BB ${
        r.best_bowling_wickets === null ? '–' : `${r.best_bowling_wickets}/${r.best_bowling_runs}`
      }`,
  },
  {
    id: 'average',
    title: 'Best batting average',
    description: `Runs per dismissal. Needs ${MIN_MATCHES}+ matches.`,
    eligible: (r) => r.batting_average !== null && r.matches >= MIN_MATCHES,
    sort: (a, b) => (b.batting_average ?? 0) - (a.batting_average ?? 0),
    value: (r) => stat(r.batting_average),
    sub: (r) => `${r.runs} runs · ${r.matches} matches`,
  },
  {
    id: 'economy',
    title: 'Best economy',
    description: `Runs conceded per over. Needs ${MIN_MATCHES}+ matches.`,
    eligible: (r) => r.economy !== null && r.matches >= MIN_MATCHES,
    // Lowest wins.
    sort: (a, b) => (a.economy ?? 0) - (b.economy ?? 0),
    value: (r) => stat(r.economy),
    sub: (r) => `${r.wickets} wicket${r.wickets === 1 ? '' : 's'} · ${r.matches} matches`,
  },
  {
    id: 'highest',
    title: 'Highest score',
    description: 'Best individual innings.',
    eligible: (r) => r.highest_score > 0,
    sort: (a, b) => b.highest_score - a.highest_score,
    value: (r) => `${r.highest_score}${r.highest_score_not_out ? '*' : ''}`,
    sub: (r) => `${r.hundreds} hundred${r.hundreds === 1 ? '' : 's'} · ${r.fifties} fifties`,
  },
  {
    id: 'dismissals',
    title: 'Most dismissals in the field',
    description: 'Catches, stumpings and run outs combined.',
    eligible: (r) => r.catches + r.stumpings + r.run_outs > 0,
    sort: (a, b) => b.catches + b.stumpings + b.run_outs - (a.catches + a.stumpings + a.run_outs),
    value: (r) => String(r.catches + r.stumpings + r.run_outs),
    sub: (r) => `${r.catches} ct · ${r.stumpings} st · ${r.run_outs} ro`,
  },
];

const QUERY =
  'player_career_stats?select=player_id,matches,runs,wickets,highest_score,highest_score_not_out,' +
  'batting_average,strike_rate,economy,bowling_average,fifties,hundreds,catches,stumpings,run_outs,' +
  'best_bowling_wickets,best_bowling_runs,player:players(id,full_name,short_name)&order=player_id.asc';

export default function StatsRoute() {
  const [rows, setRows] = useState<CareerRow[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const abort = new AbortController();
    selectAll<CareerRow>(QUERY, abort.signal)
      .then((r) => {
        setRows(r);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setStatus('error');
      });
    return () => abort.abort();
  }, []);

  const boards = useMemo(() => {
    if (!rows) return [];
    const named = rows.filter(
      (r): r is CareerRow & { player: NonNullable<CareerRow['player']> } => r.player !== null
    );
    return BOARDS.map((spec) => ({
      spec,
      leaders: named
        .filter(spec.eligible)
        .sort(spec.sort)
        .slice(0, 5)
        .map<Leader>((r) => ({
          playerId: r.player_id,
          name: r.player.short_name || r.player.full_name,
          value: spec.value(r),
          sub: spec.sub(r),
        })),
    }));
  }, [rows]);

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
          LEAGUE STATS
        </h1>
        <Link to="/ranks" className="press text-[13px] text-[var(--accent)]">
          Ranks
        </Link>
      </header>

      {status === 'loading' && (
        <div className="flex flex-col gap-3 p-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {status === 'error' && (
        <p className="px-6 py-16 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Couldn&apos;t load the league stats. Check your connection and try again.
        </p>
      )}

      {status === 'ready' && boards.every((b) => b.leaders.length === 0) && (
        <div className="mx-auto max-w-sm px-6 py-16 text-center">
          <p className="text-[var(--text-heading-sm)] font-semibold">No stats yet</p>
          <p className="mt-2 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            Leaderboards fill in once matches have been played and completed.
          </p>
        </div>
      )}

      {status === 'ready' && (
        <div className="flex flex-col gap-3 px-3 py-3">
          {boards
            .filter((b) => b.leaders.length > 0)
            .map(({ spec, leaders }) => (
              <section key={spec.id} className="panel rounded-[var(--r-lg)] p-0">
                <div className="px-4 py-3">
                  <h2 className="text-[var(--text-heading-sm)] font-semibold">{spec.title}</h2>
                  <p className="text-[11px] text-[var(--text-tertiary)]">{spec.description}</p>
                </div>
                <ol className="border-t border-[var(--border-subtle)]">
                  {leaders.map((l, i) => (
                    <li key={l.playerId}>
                      <Link
                        to={`/players/${l.playerId}`}
                        className="press flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 last:border-b-0"
                      >
                        <span className="w-4 shrink-0 text-[13px] tabular-nums text-[var(--text-tertiary)]">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[var(--text-body-sm)] font-medium">
                            {l.name}
                          </span>
                          <span className="block truncate text-[11px] text-[var(--text-tertiary)]">
                            {l.sub}
                          </span>
                        </span>
                        <span className="shrink-0 text-[var(--text-heading-sm)] font-semibold tabular-nums">
                          {l.value}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
