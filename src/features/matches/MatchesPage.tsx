import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useMatches } from './hooks';
import { groupMatches } from './matchGroups';
import { MatchSection, type MatchRow } from './MatchListRow';

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
          <MatchSection title="Live now" matches={live} />
          <MatchSection title="Upcoming" matches={upcoming} />
          {/* The only place the year earns its space: a list that reaches
              back through past seasons, where two matches on the same day of
              different years are otherwise identical. */}
          <MatchSection title="Finished" matches={finished} withYear />
        </>
      )}
    </div>
  );
}
