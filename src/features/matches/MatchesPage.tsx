import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Crest } from '@/components/ui/Crest';
import { LivePill } from '@/components/ui/LivePill';
import { formatMatchDay } from '@/lib/format';
import { SkeletonText } from '@/components/ui/Skeleton';
import type { MatchStatus } from '@/engine/types';
import { useMatches, type Match } from './hooks';
import { groupMatches, resumeAction } from './matchGroups';

/**
 * docs/11-SCREENS-AND-ROUTES.md § 5 — `/matches`, which was a Phase 0 stub
 * until now.
 *
 * The reason it exists is the ⊕ tab. docs/11's navigation model says its
 * action is "start **or resume** a match"; it was wired straight to
 * `/matches/new`, so only "start" was built. Navigate away from a live match
 * and there was no route back to it at all — reported as "the live match is
 * completely lost. I cannot go there again."
 *
 * Live matches lead, because that is what someone opening this screen
 * mid-match is looking for.
 */
// The generated types cannot express the aliased FK joins, so the embedded
// teams come back as SelectQueryError. Same cast MatchHubPage already uses.
type MatchRow = Match & {
  team_a: { name: string; short_code: string; logo_url: string | null; primary_color: string };
  team_b: { name: string; short_code: string; logo_url: string | null; primary_color: string };
};

export function MatchesPage() {
  const { data, isLoading } = useMatches();
  const { live, upcoming, finished } = groupMatches((data ?? []) as unknown as MatchRow[]);
  const nothing = !isLoading && live.length === 0 && upcoming.length === 0 && finished.length === 0;

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[var(--text-heading-lg)] font-bold">Matches</h1>
        <Link to="/matches/new">
          <Button variant="primary" size="sm" hapticKind="select">
            <Plus size={16} aria-hidden /> New match
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <SkeletonText lines={3} />
      ) : nothing ? (
        <div className="panel p-5 text-center text-[var(--text-secondary)]">
          No matches yet — create your first one.
        </div>
      ) : (
        <>
          <Section title="Live now" matches={live} />
          <Section title="Upcoming" matches={upcoming} />
          {/* The only place the year earns its space: a list that reaches
              back through past seasons, where two matches on the same day of
              different years are otherwise identical. */}
          <Section title="Finished" matches={finished} withYear />
        </>
      )}
    </div>
  );
}

function Section({
  title,
  matches,
  withYear = false,
}: {
  title: string;
  matches: MatchRow[];
  withYear?: boolean;
}) {
  if (matches.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="label-overline mb-2">{title}</h2>
      <ul className="space-y-2">
        {matches.map((m) => (
          <MatchListRow key={m.id} match={m} withYear={withYear} />
        ))}
      </ul>
    </section>
  );
}

function MatchListRow({ match, withYear }: { match: MatchRow; withYear: boolean }) {
  const { label, path } = resumeAction(match.status as MatchStatus);
  const isLive =
    match.status === 'live' || match.status === 'innings_break' || match.status === 'super_over';

  return (
    <li className="panel p-3">
      <Link to={`/matches/${match.id}`} className="flex items-center gap-3">
        <Crest
          logoUrl={match.team_a.logo_url}
          shortCode={match.team_a.short_code}
          color={match.team_a.primary_color}
          size={32}
        />
        <Crest
          logoUrl={match.team_b.logo_url}
          shortCode={match.team_b.short_code}
          color={match.team_b.primary_color}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">
            {match.team_a.short_code} v {match.team_b.short_code}
          </p>
          <p className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            {match.scheduled_at
              ? formatMatchDay(new Date(match.scheduled_at), withYear)
              : (match.title ?? match.venue ?? 'Match')}
          </p>
        </div>
        {isLive && <LivePill state="live" />}
      </Link>
      <Link
        to={path ? `/matches/${match.id}/${path}` : `/matches/${match.id}`}
        className="mt-2 block"
      >
        <Button variant={isLive ? 'primary' : 'secondary'} fullWidth hapticKind="select">
          {label}
        </Button>
      </Link>
    </li>
  );
}
