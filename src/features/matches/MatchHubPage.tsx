import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Crest } from '@/components/ui/Crest';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/authContext';
import { useTeamPermissions } from '@/features/teams/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { classifyError, userMessage } from '@/lib/errors';
import { formatMatchDateTime } from '@/lib/format';
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
  const queryClient = useQueryClient();
  const [abandoning, setAbandoning] = useState(false);
  const [abandonError, setAbandonError] = useState<string | null>(null);

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

  async function abandon() {
    // `window.prompt` rather than a bespoke sheet: this is a rare, deliberate
    // action and a modal for it is not worth the bundle on the route that
    // shares a chunk with the audience budget. Cancel returns null and must
    // abort, which is different from an empty reason.
    const reason = window.prompt('Why is this match being abandoned? (e.g. Rain)');
    if (reason === null) return;

    setAbandoning(true);
    setAbandonError(null);
    const { error } = await supabase.rpc('abandon_match', {
      p_match_id: match!.id,
      p_reason: reason.trim() || null,
    });
    setAbandoning(false);
    if (error) {
      setAbandonError(userMessage(classifyError(error)));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    await queryClient.invalidateQueries({ queryKey: ['matches'] });
  }

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
        {match.scheduled_at ? ` · ${formatMatchDateTime(new Date(match.scheduled_at))}` : ''}
      </p>

      {match.status === 'scheduled' && isManager && (
        <Link to={`/matches/${match.id}/setup`}>
          <Button variant="primary" fullWidth hapticKind="select">
            Set up match — toss & teams
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

      {/* The audience view *is* the scorecard: it has a Scorecard tab, the
          charts, and the replay scrubber for a finished match (docs/06 § 7).
          `/matches/:matchId/scorecard` is still a Phase 0 stub, and pointing
          at it showed a placeholder to somebody who had just finished a real
          match. A second implementation of a scorecard is not worth building
          while a complete one already ships. */}
      {(match.status === 'completed' || match.status === 'abandoned') && match.public_slug && (
        <Link to={`/live/${match.public_slug}`}>
          <Button variant="primary" fullWidth hapticKind="select">
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

      <Link to={`/matches/${match.id}/review`} className="mt-3 block">
        <Button variant="ghost" fullWidth>
          Review tray
        </Button>
      </Link>

      {/* Rain, a lost ball, or a match started by mistake. Not a deletion —
          `deliveries` is append-only, so everything scored is kept and the
          match is simply closed with a reason. Only offered while there is
          something to abandon. */}
      {isManager && match.status !== 'completed' && match.status !== 'abandoned' && (
        <div className="mt-6">
          {abandonError && (
            <p role="alert" className="mb-2 text-center text-[var(--danger)]">
              {abandonError}
            </p>
          )}
          {/* Was small red text at the very bottom, on a screen where
              everything else is a full-width button — understated on purpose,
              since abandoning a match is destructive. It was simply missed.
              A real button now, but outlined in danger rather than filled: it
              should be findable without competing with "Resume scoring". */}
          <button
            type="button"
            disabled={abandoning}
            onClick={() => void abandon()}
            className="press min-h-12 w-full rounded-[var(--r-md)] border border-[var(--danger)] text-[15px] font-semibold text-[var(--danger)] disabled:opacity-60"
          >
            {abandoning ? 'Abandoning…' : 'Abandon match'}
          </button>
        </div>
      )}

      {match.status === 'abandoned' && (
        <p className="mt-8 text-center text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          Match abandoned{match.result_text ? ` — ${match.result_text}` : ''}.
        </p>
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
