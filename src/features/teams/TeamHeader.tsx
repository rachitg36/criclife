import { Link, useLocation } from 'react-router';
import { Crest } from '@/components/ui/Crest';
import { Button } from '@/components/ui/Button';
import type { Team } from './hooks';

/**
 * The crest, the name and the tab strip — the part of a team page that every
 * tab shares.
 *
 * It was inlined in `TeamSquadPage`, which meant Squad was the only tab that
 * had it: Matches and Stats were separate routes rendering a bare
 * `<Placeholder>`, so tapping either one dropped you onto a screen with no
 * crest, no tabs and no way back to the squad short of the browser button.
 * Extracting it is what makes those two real pages rather than dead ends.
 */
const TABS = [
  { suffix: 'squad', label: 'Squad' },
  { suffix: 'matches', label: 'Matches' },
  { suffix: 'stats', label: 'Stats' },
] as const;

export function TeamHeader({ team, isAdmin }: { team: Team; isAdmin: boolean }) {
  const location = useLocation();

  return (
    <>
      <div
        className="relative overflow-hidden px-4 pt-6 pb-4"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklch, ${team.primary_color} 22%, transparent), transparent)`,
        }}
      >
        <div className="flex items-center gap-4">
          <Crest
            logoUrl={team.logo_url}
            shortCode={team.short_code}
            color={team.primary_color}
            size={64}
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[var(--text-heading-lg)] font-bold">{team.name}</h1>
            <div className="truncate text-[var(--text-body-sm)] text-[var(--text-secondary)]">
              {team.city ? `${team.city} · ` : ''}
              {team.home_ground ?? team.short_code}
            </div>
          </div>
          {isAdmin && (
            <Link to={`/teams/${team.id}/settings`}>
              <Button variant="glass" size="sm">
                Settings
              </Button>
            </Link>
          )}
        </div>
      </div>

      <nav
        aria-label="Team sections"
        className="flex gap-1 border-b border-[var(--border-subtle)] px-4"
      >
        {TABS.map((tab) => {
          const isSquadTab = tab.suffix === 'squad';
          const active = isSquadTab
            ? location.pathname === `/teams/${team.id}` ||
              location.pathname === `/teams/${team.id}/squad`
            : location.pathname === `/teams/${team.id}/${tab.suffix}`;
          return (
            <Link
              key={tab.label}
              to={`/teams/${team.id}/${tab.suffix}`}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'relative px-3 py-2 text-[15px] font-medium text-[var(--text-primary)]'
                  : 'relative px-3 py-2 text-[15px] font-medium text-[var(--text-secondary)]'
              }
            >
              {tab.label}
            </Link>
          );
        })}
        <Link
          // `teams`, plural. `filterFromSearchParams` reads a comma-joined
          // `teams=` and ignores anything else, so `team=` silently opened the
          // unfiltered global board — the link looked wired and was not.
          to={`/ranks?teams=${team.id}`}
          className="relative px-3 py-2 text-[15px] font-medium text-[var(--text-secondary)]"
        >
          Ranks
        </Link>
      </nav>
    </>
  );
}
