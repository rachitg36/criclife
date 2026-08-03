import { Link } from 'react-router';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AudiencePlayer, AudienceTeam } from '../types';
import type { AudienceView } from '../useAudienceView';
import { useAudienceStore } from '../store';

/**
 * docs/06 § 2 "Squads" — both XIs, with captain and keeper badges. Tapping a
 * player goes to their public profile (Phase 3's `/players/:playerId`), which
 * is already public-read.
 */
export function SquadsTab({ view }: { view: AudienceView }) {
  const players = useAudienceStore((s) => s.players);
  const match = useAudienceStore((s) => s.match);
  if (!match) return null;

  const byTeam = (teamId: string) => players.filter((p) => p.teamId === teamId);
  const a = byTeam(match.teamA.id);
  const b = byTeam(match.teamB.id);

  if (a.length === 0 && b.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[var(--text-body-sm)] text-[var(--text-tertiary)]">
        The XIs haven&apos;t been named yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <TeamSquad team={match.teamA} players={a} view={view} />
      <TeamSquad team={match.teamB} players={b} view={view} />
    </div>
  );
}

function TeamSquad({
  team,
  players,
  view,
}: {
  team: AudienceTeam;
  players: AudiencePlayer[];
  view: AudienceView;
}) {
  if (players.length === 0) return null;
  const innings = view.innings;
  const isBatting = innings?.battingTeamId === team.id;

  return (
    <section className="panel rounded-[var(--r-lg)] p-0">
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-[var(--text-heading-sm)] font-semibold">
          {team.name}
        </h2>
        {isBatting && (
          <span className="shrink-0 rounded-[var(--r-full)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-[var(--accent)]">
            BATTING
          </span>
        )}
      </div>
      <ul className="border-t border-[var(--border-subtle)]">
        {players.map((p) => (
          <li key={p.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
            <Link to={`/players/${p.id}`} className="press flex items-center gap-3 px-4 py-2.5">
              <span
                aria-hidden
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[var(--r-full)]',
                  'bg-[var(--surface-3)] text-[11px] font-semibold text-[var(--text-secondary)]'
                )}
              >
                {p.photoUrl ? (
                  <img
                    src={p.photoUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials(p.displayName)
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[var(--text-body-sm)] font-medium">
                  {p.displayName}
                  {p.isCaptain && <Badge>C</Badge>}
                  {p.isWicketKeeper && <Badge>WK</Badge>}
                </span>
                {p.playingRole && (
                  <span className="block truncate text-[11px] capitalize text-[var(--text-tertiary)]">
                    {p.playingRole.replace(/_/g, ' ')}
                  </span>
                )}
              </span>
              {p.battingOrder !== null && (
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-tertiary)]">
                  #{p.battingOrder}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="ml-1.5 rounded-[var(--r-sm)] bg-[var(--surface-3)] px-1 py-px text-[9px] font-bold tracking-[0.06em] text-[var(--text-secondary)]">
      {children}
    </span>
  );
}
