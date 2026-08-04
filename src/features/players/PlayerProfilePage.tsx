import { Link, useParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/authContext';
import { useProfile } from '@/features/auth/useProfile';
import {
  BATTING_HAND_LABEL,
  BOWLING_STYLE_LABEL,
  PLAYER_ROLE_LABEL,
} from '@/features/players/roleLabels';
import { CareerStats } from './CareerStats';
import { usePlayer, usePlayerTeams } from './hooks';

/** docs/11-SCREENS-AND-ROUTES.md § 4 — `/players/:playerId`, public read. */
export function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { data: player, isLoading } = usePlayer(playerId);
  const { data: teams } = usePlayerTeams(playerId);
  const { session } = useAuth();
  const { data: profile } = useProfile();

  if (isLoading) {
    return (
      <div className="px-4 pt-4 pb-8">
        <SkeletonText lines={4} />
      </div>
    );
  }

  if (!player) {
    return <div className="px-4 pt-8 text-[var(--text-secondary)]">Player not found.</div>;
  }

  const isSelf = !!session && player.profile_id === session.user.id;
  const canEdit = isSelf || !!profile?.is_super_admin;

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="mb-6 flex items-center gap-4">
        <Avatar photoUrl={player.photo_url} name={player.full_name} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[var(--text-heading-lg)] font-bold">{player.full_name}</h1>
          <div className="flex flex-wrap gap-1 pt-1">
            {(teams ?? []).map((team) => (
              <Link
                key={team.id}
                to={`/teams/${team.id}`}
                className="label-overline rounded-full border border-[var(--border-subtle)] px-2 py-1"
              >
                {team.short_code}
              </Link>
            ))}
          </div>
        </div>
        {canEdit && (
          <Link to={`/players/${player.id}/edit`}>
            <Button variant="secondary" size="sm">
              Edit
            </Button>
          </Link>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge>{PLAYER_ROLE_LABEL[player.primary_role]}</Badge>
        {player.secondary_role && <Badge>{PLAYER_ROLE_LABEL[player.secondary_role]}</Badge>}
        <Badge>{BATTING_HAND_LABEL[player.batting_hand]}</Badge>
        {player.bowling_style && player.bowling_style !== 'none' && (
          <Badge>{BOWLING_STYLE_LABEL[player.bowling_style]}</Badge>
        )}
      </div>

      {player.bio && <p className="mb-6 text-[var(--text-secondary)]">{player.bio}</p>}

      {/* Phase 8 has been filling `player_career_stats` on every completed
          match since the first one; nothing ever read it. This did say
          "coming in a later phase" — the later phase had already happened. */}
      <CareerStats playerId={player.id} />
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1 text-[13px] font-medium">
      {children}
    </span>
  );
}
