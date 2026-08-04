import { Link } from 'react-router';
import { motion } from 'motion/react';
import { PlusCircle, Shield, TrendingUp, BarChart3 } from 'lucide-react';
import { Aurora } from '@/components/ui/Aurora';
import { Button } from '@/components/ui/Button';
import { Crest } from '@/components/ui/Crest';
import { LivePill } from '@/components/ui/LivePill';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { SkeletonText } from '@/components/ui/Skeleton';
import { formatMatchDateTime } from '@/lib/format';
import { useMyTeams } from '@/features/teams/hooks';
import { useMatches } from '@/features/matches/hooks';
import { groupMatches, mineOnly, resumeAction } from '@/features/matches/matchGroups';

/**
 * Home. docs/11-SCREENS-AND-ROUTES.md § 2.
 *
 * This was the Phase 0 placeholder until now: an aurora, a hard-coded 0–0 and
 * four cards stamped with phase numbers. It said "No matches yet" to somebody
 * who had just scored a match on the same phone, which is the worst thing a
 * first screen can do.
 *
 * The order is what you would want at the ground: a match in progress first
 * (one tap back into the pad), then the next one to set up, then the last
 * result, then the things you do when there is no cricket on. Everything is
 * scoped to teams you are in — `matches_read_public` makes every match
 * world-readable, so an unfiltered "your matches" is other people's.
 */
export function HomePage() {
  const { data, isLoading } = useMatches();
  const { data: myTeams } = useMyTeams();

  const mine = mineOnly(
    (data ?? []) as unknown as MatchRow[],
    (myTeams ?? []).map((t) => t.id)
  );
  const { live, upcoming, finished } = groupMatches(mine);
  // `upcoming` is newest-first like the others; the *next* one to play is the
  // oldest of them, so this end of the list is the one worth surfacing.
  const next = upcoming.at(-1);
  const nothing = !isLoading && mine.length === 0;

  return (
    <div className="relative overflow-hidden pb-8">
      <Aurora />

      <header className="relative flex items-center justify-between px-4 pt-4">
        <span className="font-display text-[17px] font-bold tracking-tight">CricLife</span>
        <ThemeToggle compact />
      </header>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative space-y-3 px-4 pt-6"
      >
        {isLoading ? (
          <div className="panel p-5">
            <SkeletonText lines={3} />
          </div>
        ) : nothing ? (
          <EmptyHero />
        ) : (
          <>
            {live.map((m) => (
              <MatchCard key={m.id} match={m} tone="live" />
            ))}
            {next && <MatchCard match={next} tone="upcoming" />}
          </>
        )}
      </motion.section>

      {finished.length > 0 && (
        <section className="relative px-4 pt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="label-overline">Recent results</h2>
            <Link to="/matches" className="text-[var(--text-body-sm)] text-[var(--accent)]">
              All matches
            </Link>
          </div>
          <ul className="space-y-2">
            {finished.slice(0, 3).map((m) => (
              <li key={m.id}>
                <MatchCard match={m} tone="finished" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* grid-cols-1 (not bare `grid`): an implicit auto track sizes to
          max-content, and `truncate` makes that the full unwrapped subtitle —
          which blew the cards past the viewport. minmax(0,1fr) clamps it. */}
      <section className="relative grid grid-cols-1 gap-3 px-4 pt-6">
        <QuickLink
          to="/matches/new"
          Icon={PlusCircle}
          title="Start a match"
          subtitle="Pick teams, set the overs, choose who scores"
        />
        <QuickLink
          to="/teams"
          Icon={Shield}
          title="Your teams"
          subtitle="Squads, colours, invites"
        />
        <QuickLink
          to="/ranks"
          Icon={TrendingUp}
          title="Rankings"
          subtitle="All players, all teams — filter as you like"
        />
        <QuickLink
          to="/stats"
          Icon={BarChart3}
          title="Stats"
          subtitle="Leaderboards and season records"
        />
      </section>
    </div>
  );
}

// The generated types cannot express the aliased FK joins, so the embedded
// teams come back as SelectQueryError. Same cast MatchesPage and MatchHubPage
// already use.
type TeamBadge = {
  name: string;
  short_code: string;
  logo_url: string | null;
  primary_color: string;
};
type MatchRow = {
  id: string;
  status: Parameters<typeof resumeAction>[0];
  scheduled_at: string | null;
  team_a_id: string;
  team_b_id: string;
  title: string | null;
  venue: string | null;
  result_text: string | null;
  team_a: TeamBadge;
  team_b: TeamBadge;
};

function MatchCard({ match, tone }: { match: MatchRow; tone: 'live' | 'upcoming' | 'finished' }) {
  const { label, path } = resumeAction(match.status);

  // Only a finished match earns the year — a home screen shows this season,
  // and "4 Aug 2026" next to "today" is noise.
  const when = match.scheduled_at
    ? formatMatchDateTime(new Date(match.scheduled_at), tone === 'finished')
    : (match.venue ?? null);

  const subtitle = tone === 'finished' ? (match.result_text ?? when) : when;

  return (
    <div className="panel p-4">
      <Link to={`/matches/${match.id}`} className="block">
        <div className="mb-2 flex items-center justify-between">
          <span className="label-overline">
            {tone === 'live' ? 'In progress' : tone === 'upcoming' ? 'Next up' : 'Result'}
          </span>
          {tone === 'live' && <LivePill state="live" />}
        </div>
        <div className="flex items-center gap-3">
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
              {match.team_a.name} v {match.team_b.name}
            </p>
            {subtitle && (
              <p className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </Link>
      {tone !== 'finished' && (
        <Link
          to={path ? `/matches/${match.id}/${path}` : `/matches/${match.id}`}
          className="mt-3 block"
        >
          <Button variant={tone === 'live' ? 'primary' : 'secondary'} fullWidth hapticKind="select">
            {label}
          </Button>
        </Link>
      )}
    </div>
  );
}

function EmptyHero() {
  return (
    <div className="panel p-5">
      <h1 className="font-display text-[var(--text-heading-lg)] font-bold">No matches yet</h1>
      <p className="mt-1 text-[var(--text-secondary)]">
        Create a team, add your players, then start a match. Scoring works with no signal — it syncs
        when you are back on a network.
      </p>
      <div className="mt-4 flex gap-2">
        <Link to="/teams/new" className="flex-1">
          <Button variant="primary" fullWidth hapticKind="select">
            Create a team
          </Button>
        </Link>
        <Link to="/matches/new" className="flex-1">
          <Button variant="secondary" fullWidth hapticKind="select">
            Start a match
          </Button>
        </Link>
      </div>
    </div>
  );
}

function QuickLink({
  to,
  Icon,
  title,
  subtitle,
}: {
  to: string;
  Icon: typeof Shield;
  title: string;
  subtitle: string;
}) {
  return (
    <Link to={to} className="panel press flex items-center gap-4 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--accent-muted)]">
        <Icon size={20} className="text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{title}</div>
        <div className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
          {subtitle}
        </div>
      </div>
    </Link>
  );
}
