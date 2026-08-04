import { useParams } from 'react-router';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useMatches } from '@/features/matches/hooks';
import { groupMatches, mineOnly } from '@/features/matches/matchGroups';
import { MatchSection, type MatchRow } from '@/features/matches/MatchListRow';
import { useTeam, useTeamPermissions } from './hooks';
import { TeamHeader } from './TeamHeader';

/**
 * `/teams/:teamId/matches` — every match this team has played or is about to.
 *
 * It was a `<Placeholder>` reading "Team matches ships in Phase 3", which is
 * how it shipped through Phase 8: a tab you could tap that led to a sentence.
 *
 * `mineOnly` is doing double duty here. It was written to answer "which
 * matches could *I* resume", taking a list of team ids — one team id is the
 * same question narrowed, so this is the same filter, not a second one.
 */
export function TeamMatchesPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const { data: team, isLoading: teamLoading } = useTeam(teamId);
  const { data, isLoading } = useMatches();
  const perms = useTeamPermissions(teamId);

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

  const theirs = mineOnly((data ?? []) as unknown as MatchRow[], [team.id]);
  const { live, upcoming, finished } = groupMatches(theirs);

  return (
    <div className="pb-8">
      <TeamHeader team={team} isAdmin={perms.isAdmin} />
      <div className="px-4 pt-4">
        {isLoading ? (
          <SkeletonText lines={4} />
        ) : theirs.length === 0 ? (
          <div className="panel p-5 text-center text-[var(--text-secondary)]">
            {team.name} has not been in a match yet.
          </div>
        ) : (
          <>
            <MatchSection title="Live now" matches={live} />
            <MatchSection title="Upcoming" matches={upcoming} />
            <MatchSection title="Finished" matches={finished} withYear />
          </>
        )}
      </div>
    </div>
  );
}
