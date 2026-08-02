import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { Crest } from '@/components/ui/Crest';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useAllTeams, useMyTeams, type Team, type TeamRole } from './hooks';
import { TEAM_ROLE_LABEL } from '@/features/players/roleLabels';

/** docs/11-SCREENS-AND-ROUTES.md § 3 — `/teams`. */
export function TeamsPage() {
  const { data: myTeams, isLoading: myTeamsLoading } = useMyTeams();
  const [search, setSearch] = useState('');
  const { data: allTeams, isLoading: allTeamsLoading } = useAllTeams(search);

  const myTeamIds = new Set((myTeams ?? []).map((t) => t.id));
  const otherTeams = (allTeams ?? []).filter((t) => !myTeamIds.has(t.id));

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[var(--text-heading-lg)] font-bold">Teams</h1>
        <Link to="/teams/new">
          <Button variant="primary" size="sm" hapticKind="select">
            <Plus size={16} aria-hidden /> New team
          </Button>
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="label-overline mb-2">Your teams</h2>
        {myTeamsLoading ? (
          <SkeletonText lines={2} />
        ) : myTeams && myTeams.length > 0 ? (
          <ul className="space-y-2">
            {myTeams.map((team) => (
              <TeamRow key={team.id} team={team} role={team.myRole} />
            ))}
          </ul>
        ) : (
          <div className="panel p-5 text-center text-[var(--text-secondary)]">
            No teams yet — create your first team.
          </div>
        )}
      </section>

      <section>
        <h2 className="label-overline mb-2">All teams</h2>
        <div className="relative mb-3">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams"
            className="h-11 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--surface-1)] pr-3 pl-9 text-[15px] outline-none focus:border-[var(--accent)]"
          />
        </div>
        {allTeamsLoading ? (
          <SkeletonText lines={3} />
        ) : otherTeams.length > 0 ? (
          <ul className="space-y-2">
            {otherTeams.map((team) => (
              <TeamRow key={team.id} team={team} />
            ))}
          </ul>
        ) : (
          <p className="text-[var(--text-secondary)]">No other teams found.</p>
        )}
      </section>
    </div>
  );
}

function TeamRow({ team, role }: { team: Team; role?: TeamRole }) {
  return (
    <li>
      <Link to={`/teams/${team.id}`} className="panel press flex items-center gap-3 p-3">
        <Crest logoUrl={team.logo_url} shortCode={team.short_code} color={team.primary_color} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{team.name}</div>
          <div className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            {team.city || team.short_code}
          </div>
        </div>
        {role && (
          <span className="label-overline shrink-0 rounded-full border border-[var(--border-subtle)] px-2 py-1">
            {TEAM_ROLE_LABEL[role]}
          </span>
        )}
      </Link>
    </li>
  );
}
