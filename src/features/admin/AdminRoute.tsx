import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';

/**
 * `/admin/*` — Super Admin console. docs/11-SCREENS-AND-ROUTES.md § 10.
 *
 * Already behind `<RequireSuperAdmin>` in the router, and behind
 * `is_super_admin()` in RLS underneath that. The guard is the UI's courtesy;
 * the policies are the actual protection, which is why every panel here is a
 * plain table read that simply returns nothing to anyone else.
 *
 * Deliberately read-and-narrow-write: this console surfaces state and offers
 * the few actions that have a server-side RPC behind them. Bulk destructive
 * tools (player merge, data purge) are listed in docs/11 but are not built —
 * see HANDOFF § 6.1. Half-built destructive admin tooling is worse than none.
 *
 * The panels are local state rather than nested `<Routes>`. Nested routing
 * here pulled ~2 kB more of react-router into the *shared* eager vendor chunk,
 * which is charged to `/live/:publicSlug`'s 180 kB budget (CLAUDE.md rule 9) —
 * a real cost on a public route, to deep-link three admin tabs nobody links to.
 */
type Panel = 'overview' | 'matches' | 'audit';
export default function AdminRoute() {
  const [panel, setPanel] = useState<Panel>('overview');

  return (
    <div className="pb-[calc(var(--sp-16)+var(--safe-b))]">
      <header className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
        <Link
          to="/"
          aria-label="Home"
          className="press -ml-1 grid h-9 w-9 place-items-center rounded-[var(--r-full)] text-[var(--text-secondary)]"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="flex-1 text-[var(--text-heading-sm)] font-semibold tracking-[0.04em]">
          ADMIN
        </h1>
      </header>

      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)] px-3 py-2"
      >
        {(
          [
            ['overview', 'Overview'],
            ['matches', 'Matches'],
            ['audit', 'Audit log'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={panel === id}
            onClick={() => setPanel(id)}
            className={cn(
              'press shrink-0 rounded-[var(--r-full)] px-3 py-1.5 text-[13px] font-medium',
              panel === id
                ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                : 'text-[var(--text-secondary)]'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {panel === 'overview' && <Overview />}
      {panel === 'matches' && <MatchesPanel />}
      {panel === 'audit' && <AuditPanel />}
    </div>
  );
}

/** Counts across the tables an admin actually needs a feel for. */
function Overview() {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const tables = useMemo(
    () => ['profiles', 'players', 'teams', 'matches', 'deliveries', 'player_career_stats'],
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out: Record<string, number | null> = {};
      for (const table of tables) {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        out[table] = error ? null : (count ?? 0);
      }
      if (!cancelled) setCounts(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [tables]);

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {tables.map((table) => (
        <div key={table} className="panel rounded-[var(--r-md)] p-3">
          <p className="label-overline">{table.replace(/_/g, ' ')}</p>
          <p className="mt-1 text-[var(--text-heading-lg)] font-semibold tabular-nums">
            {counts[table] === undefined ? (
              <Skeleton className="h-6 w-12" />
            ) : counts[table] === null ? (
              '–'
            ) : (
              counts[table]
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

type AdminMatch = {
  id: string;
  title: string | null;
  status: string;
  is_locked: boolean;
  public_slug: string | null;
  completed_at: string | null;
};

/**
 * docs/11 § 10 lists "matches (unlock)". Unlocking is not offered here: the
 * lock is enforced by a BEFORE UPDATE trigger as well as by RLS (see the Phase
 * 2 migration's own comment), so a button here would fail silently unless the
 * trigger were also taught about it. Re-deriving stats *is* offered, because
 * `refinalize_match` exists precisely for "a delivery was corrected after the
 * match closed".
 */
function MatchesPanel() {
  const [matches, setMatches] = useState<AdminMatch[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('matches')
      .select('id,title,status,is_locked,public_slug,completed_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setMatches((data as AdminMatch[] | null) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  async function refinalize(id: string) {
    setBusy(id);
    setMessage(null);
    const { error } = await supabase.rpc('refinalize_match', { p_match_id: id });
    setBusy(null);
    setMessage(error ? `Failed: ${error.message}` : 'Stats and rankings re-derived.');
  }

  if (!matches) return <Skeleton className="m-3 h-40" />;
  if (matches.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        No matches yet.
      </p>
    );
  }

  return (
    <div>
      {message && (
        <p role="status" className="px-4 py-2 text-[12px] text-[var(--text-secondary)]">
          {message}
        </p>
      )}
      <ul>
        {matches.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[var(--text-body-sm)] font-medium">
                {m.title ?? m.id.slice(0, 8)}
              </span>
              <span className="block text-[11px] capitalize text-[var(--text-tertiary)]">
                {m.status.replace(/_/g, ' ')}
                {m.is_locked && ' · locked'}
              </span>
            </span>
            {m.status === 'completed' && (
              <button
                type="button"
                disabled={busy === m.id}
                onClick={() => void refinalize(m.id)}
                className="press shrink-0 rounded-[var(--r-full)] border border-[var(--border-default)] px-2.5 py-1 text-[12px] disabled:opacity-50"
              >
                {busy === m.id ? 'Working…' : 'Re-derive stats'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('id,action,entity_type,entity_id,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      setRows((data as AuditRow[] | null) ?? []);
    })();
  }, []);

  if (!rows) return <Skeleton className="m-3 h-40" />;
  if (rows.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
        Nothing has been audited yet.
      </p>
    );
  }

  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id} className="border-b border-[var(--border-subtle)] px-4 py-2.5">
          <p className="text-[var(--text-body-sm)]">
            <span className="font-medium">{r.action}</span>{' '}
            <span className="text-[var(--text-tertiary)]">
              on {r.entity_type} {r.entity_id.slice(0, 8)}
            </span>
          </p>
          <p className="text-[11px] tabular-nums text-[var(--text-tertiary)]">
            {new Date(r.created_at).toLocaleString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
