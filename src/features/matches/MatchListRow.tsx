import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Crest } from '@/components/ui/Crest';
import { LivePill } from '@/components/ui/LivePill';
import { formatMatchDateTime } from '@/lib/format';
import type { MatchStatus } from '@/engine/types';
import { resumeAction } from './matchGroups';

/**
 * One match, as a row in a list. Shared by `/matches` and a team's Matches tab
 * so the two cannot drift — the "TM1 v TM2" bug (short code where the row has
 * room for the real name) was the kind that gets fixed in one copy.
 */
// The generated types cannot express the aliased FK joins, so the embedded
// teams come back as SelectQueryError. Same cast MatchHubPage already uses.
export type MatchRow = {
  id: string;
  status: MatchStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  team_a_id: string;
  team_b_id: string;
  title: string | null;
  venue: string | null;
  team_a: { name: string; short_code: string; logo_url: string | null; primary_color: string };
  team_b: { name: string; short_code: string; logo_url: string | null; primary_color: string };
};

export function MatchListRow({ match, withYear }: { match: MatchRow; withYear: boolean }) {
  const { label, path } = resumeAction(match.status);
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
          {/* The *name*, not the short code. Renaming a team to "Cologne"
              left this row reading "TM1 v TM2", because short_code is a
              separate field that most people never think to change — and a
              list row has space for the real name anyway. The crests keep the
              short code; that is what they are for. */}
          <p className="truncate text-[15px] font-semibold">
            {match.team_a.name} v {match.team_b.name}
          </p>
          <p className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
            {/* Time as well as the day: several matches a weekend is normal,
                and "4 Aug" alone cannot tell the morning game from the
                afternoon one. The year still only appears on Finished. */}
            {match.scheduled_at
              ? formatMatchDateTime(new Date(match.scheduled_at), withYear)
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

export function MatchSection({
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
