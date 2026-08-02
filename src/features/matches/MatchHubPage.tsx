import { Link, useParams } from 'react-router';
import { Crest } from '@/components/ui/Crest';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/authContext';
import { useTeamPermissions } from '@/features/teams/hooks';
import { useMatch } from './hooks';

/**
 * docs/11-SCREENS-AND-ROUTES.md § 5 — `/matches/:matchId`. Routes by context:
 * pre-toss -> setup CTA; live + a grant -> resume scoring; live otherwise ->
 * audience; completed -> scorecard. The scorer view itself is Phase 5 — this
 * links there once it exists rather than duplicating it.
 */
export function MatchHubPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { data: match, isLoading } = useMatch(matchId);
  const { session } = useAuth();
  const permsA = useTeamPermissions(match?.team_a_id);
  const permsB = useTeamPermissions(match?.team_b_id);

  if (isLoading) {
    return (
      <div className="px-4 pt-4 pb-8">
        <SkeletonText lines={4} />
      </div>
    );
  }
  if (!match) {
    return <div className="px-4 pt-8 text-[var(--text-secondary)]">Match not found.</div>;
  }

  const isManager = permsA.isManager || permsB.isManager;
  const teamA = match.team_a as unknown as {
    name: string;
    short_code: string;
    logo_url: string | null;
    primary_color: string;
  };
  const teamB = match.team_b as unknown as {
    name: string;
    short_code: string;
    logo_url: string | null;
    primary_color: string;
  };

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center justify-center gap-6">
        <TeamBadge team={teamA} />
        <span className="text-[var(--text-tertiary)]">vs</span>
        <TeamBadge team={teamB} />
      </div>

      {match.title && <p className="mb-2 text-center font-semibold">{match.title}</p>}
      <p className="mb-6 text-center text-[var(--text-secondary)]">
        {match.venue ?? 'Venue TBD'}
        {match.scheduled_at ? ` · ${new Date(match.scheduled_at).toLocaleString()}` : ''}
      </p>

      {match.status === 'scheduled' && isManager && (
        <Link to={`/matches/${match.id}/setup`}>
          <Button variant="primary" fullWidth hapticKind="select">
            Set up match — toss & XI
          </Button>
        </Link>
      )}

      {match.status === 'toss' && isManager && (
        <Link to={`/matches/${match.id}/setup`}>
          <Button variant="primary" fullWidth hapticKind="select">
            Continue setup
          </Button>
        </Link>
      )}

      {(match.status === 'live' ||
        match.status === 'innings_break' ||
        match.status === 'super_over') && (
        <div className="space-y-2">
          {session && (
            <Link to={`/matches/${match.id}/score`}>
              <Button variant="primary" fullWidth hapticKind="select">
                Resume scoring
              </Button>
            </Link>
          )}
          <Link to={`/live/${match.public_slug}`}>
            <Button variant="secondary" fullWidth>
              Watch live
            </Button>
          </Link>
        </div>
      )}

      {match.status === 'completed' && (
        <Link to={`/matches/${match.id}/scorecard`}>
          <Button variant="primary" fullWidth>
            View scorecard
          </Button>
        </Link>
      )}

      {isManager && (
        <Link to={`/matches/${match.id}/rights`} className="mt-3 block">
          <Button variant="glass" fullWidth>
            Scoring Rights Map
          </Button>
        </Link>
      )}
    </div>
  );
}

function TeamBadge({
  team,
}: {
  team: { name: string; short_code: string; logo_url: string | null; primary_color: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Crest
        logoUrl={team.logo_url}
        shortCode={team.short_code}
        color={team.primary_color}
        size={56}
      />
      <span className="text-[13px] font-medium">{team.short_code}</span>
    </div>
  );
}
