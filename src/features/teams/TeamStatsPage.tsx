import { useParams } from 'react-router';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { SkeletonText } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { stat } from '@/lib/format';
import { useMatches } from '@/features/matches/hooks';
import { mineOnly } from '@/features/matches/matchGroups';
import { useSquad, useTeam, useTeamPermissions } from './hooks';
import { TeamHeader } from './TeamHeader';
import type { Database } from '@/types/database';

type Career = Database['public']['Tables']['player_career_stats']['Row'];

/**
 * `/teams/:teamId/stats` — a `<Placeholder>` reading "Team stats ships in
 * Phase 8" right through Phase 8 shipping.
 *
 * Two honest halves, and it is worth being clear about which is which:
 *
 * - **The record** is genuinely per-team. It is counted from `matches`, whose
 *   `winner_team_id` is set by `finalise_match`.
 * - **The leaderboards are not.** `player_career_stats` has no team dimension
 *   at all (docs/07 § 4 rolls career figures up per player, full stop), so
 *   these are the *career* totals of the players currently in this squad —
 *   including runs they scored for somebody else. The heading says so rather
 *   than quietly presenting them as this team's runs. Making them per-team
 *   means a `team_id` on `player_match_stats` and a rebuild; that is a
 *   migration, not a screen.
 */
export function TeamStatsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: team, isLoading: teamLoading } = useTeam(teamId);
  const { data: squad } = useSquad(teamId);
  const { data: matches } = useMatches();
  const perms = useTeamPermissions(teamId);

  const playerIds = (squad ?? []).map((row) => row.player_id);
  const { data: careers, isLoading: careersLoading } = useQuery({
    queryKey: ['teamCareers', teamId, playerIds.length],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_career_stats')
        .select('*')
        .in('player_id', playerIds);
      if (error) throw error;
      return data as Career[];
    },
    enabled: playerIds.length > 0,
  });

  if (teamLoading) {
    return (
      <div className="px-4 pt-4 pb-8">
        <SkeletonText lines={4} />
      </div>
    );
  }
  if (!team) {
    return <div className="px-4 pt-8 text-[var(--text-secondary)]">Team not found.</div>;
  }

  const theirs = mineOnly(
    (matches ?? []) as unknown as {
      status: string;
      team_a_id: string;
      team_b_id: string;
      winner_team_id: string | null;
      result_type: string | null;
    }[],
    [team.id]
  );
  const completed = theirs.filter((m) => m.status === 'completed');
  const won = completed.filter((m) => m.winner_team_id === team.id).length;
  const lost = completed.filter(
    (m) => m.winner_team_id !== null && m.winner_team_id !== team.id
  ).length;
  const drawn = completed.length - won - lost;
  // Ties and no-results are not losses, so they must come out of the
  // denominator too — otherwise a washed-out weekend reads as a slump.
  const decided = won + lost;
  const winPct = decided === 0 ? null : (won / decided) * 100;

  const nameOf = (id: string) =>
    (squad ?? []).find((row) => row.player_id === id)?.player.full_name ?? 'Unknown';

  const rows = careers ?? [];
  const byRuns = [...rows].filter((r) => r.runs > 0).sort((a, b) => b.runs - a.runs);
  const byWickets = [...rows].filter((r) => r.wickets > 0).sort((a, b) => b.wickets - a.wickets);

  return (
    <div className="pb-8">
      <TeamHeader team={team} isAdmin={perms.isAdmin} />

      <div className="space-y-3 px-4 pt-4">
        <section className="panel p-4">
          <h2 className="label-overline mb-3">Record</h2>
          <dl className="grid grid-cols-4 gap-y-3">
            <Cell label="Played" value={String(completed.length)} />
            <Cell label="Won" value={String(won)} />
            <Cell label="Lost" value={String(lost)} />
            <Cell label="Tied / NR" value={String(drawn)} />
          </dl>
          <p className="mt-3 text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            Win rate <span className="font-semibold tabular-nums">{stat(winPct, 0)}</span>
            {winPct !== null && '%'} — ties and no-results excluded.
          </p>
        </section>

        <section className="panel p-4">
          <h2 className="label-overline">Squad career figures</h2>
          <p className="mt-1 mb-3 text-[11px] text-[var(--text-tertiary)]">
            Career totals for the players in this squad — including anything they did for another
            side. CricLife does not yet keep per-team career figures.
          </p>

          {careersLoading ? (
            <SkeletonText lines={4} />
          ) : rows.length === 0 ? (
            <p className="py-4 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
              Nothing yet. Figures appear once a match this squad played in is complete.
            </p>
          ) : (
            <div className="space-y-4">
              <Board
                title="Most runs"
                rows={byRuns.slice(0, 5).map((r) => ({
                  id: r.player_id,
                  name: nameOf(r.player_id),
                  main: String(r.runs),
                  sub: `avg ${stat(r.batting_average)} · sr ${stat(r.strike_rate)}`,
                }))}
              />
              <Board
                title="Most wickets"
                rows={byWickets.slice(0, 5).map((r) => ({
                  id: r.player_id,
                  name: nameOf(r.player_id),
                  main: String(r.wickets),
                  sub: `avg ${stat(r.bowling_average)} · econ ${stat(r.economy)}`,
                }))}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Board({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; main: string; sub: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--text-secondary)]">{title}</h3>
      <ul className="space-y-1">
        {rows.map((row, i) => (
          <li key={row.id}>
            <Link
              to={`/players/${row.id}`}
              className="press flex items-center gap-3 rounded-[var(--r-sm)] py-1.5"
            >
              <span className="w-4 text-[13px] tabular-nums text-[var(--text-tertiary)]">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{row.name}</span>
              <span className="text-right">
                <span className="block text-[15px] font-semibold tabular-nums">{row.main}</span>
                <span className="block text-[11px] text-[var(--text-tertiary)]">{row.sub}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[0.04em] text-[var(--text-tertiary)] uppercase">
        {label}
      </dt>
      <dd className="text-[17px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
