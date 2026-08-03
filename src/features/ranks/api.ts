import { selectAll } from '@/lib/publicApi';
import type { Board, RankPlayer, RankTeam } from './types';

/**
 * `/ranks` is a public route (docs/11 § 2), so it reads over plain fetch for
 * the same reason the audience view does: `@supabase/supabase-js` is ~57 kB
 * gzipped and nothing on this page needs a session. See `@/lib/publicApi`.
 *
 * Everything here is covered by a `using (true)` select policy —
 * `player_career_stats`, `ranking_snapshots`, `players`, `teams`,
 * `team_members` — and asserted as such in the Phase 7 pgTAP file.
 */

type CareerRow = {
  player_id: string;
  matches: number;
  innings_batted: number;
  innings_bowled: number;
  balls_faced: number;
  overall_rating: number | null;
  batting_rating: number | null;
  bowling_rating: number | null;
  allrounder_rating: number | null;
  fielding_rating: number | null;
  player: {
    id: string;
    full_name: string;
    short_name: string | null;
    photo_url: string | null;
    primary_role: string | null;
    profile_id: string | null;
  } | null;
};

type MembershipRow = { player_id: string; team_id: string };
type TeamRow = { id: string; name: string; short_code: string; primary_color: string };
type SnapshotRow = { player_id: string; board: Board; rank: number; snapshot_date: string };

export type RanksData = {
  players: RankPlayer[];
  teams: RankTeam[];
  /** Keyed `"<board>:<playerId>"`, positive means moved up. */
  movement: Map<string, number>;
};

const CAREER_QUERY =
  'player_career_stats?select=player_id,matches,innings_batted,innings_bowled,balls_faced,' +
  'overall_rating,batting_rating,bowling_rating,allrounder_rating,fielding_rating,' +
  'player:players(id,full_name,short_name,photo_url,primary_role,profile_id)' +
  '&order=player_id.asc';

export async function fetchRanksData(signal?: AbortSignal): Promise<RanksData> {
  const [careers, memberships, teams, snapshots] = await Promise.all([
    selectAll<CareerRow>(CAREER_QUERY, signal),
    selectAll<MembershipRow>(
      'team_members?left_at=is.null&select=player_id,team_id&order=player_id.asc',
      signal
    ),
    selectAll<TeamRow>(
      'teams?is_archived=is.false&select=id,name,short_code,primary_color&order=name.asc',
      signal
    ),
    selectAll<SnapshotRow>(
      'ranking_snapshots?scope=eq.global&select=player_id,board,rank,snapshot_date' +
        '&order=snapshot_date.desc',
      signal
    ),
  ]);

  const teamsByPlayer = new Map<string, string[]>();
  for (const m of memberships) {
    const list = teamsByPlayer.get(m.player_id);
    if (list) list.push(m.team_id);
    else teamsByPlayer.set(m.player_id, [m.team_id]);
  }

  // `balls_bowled` has no career column (docs/02's shape predates the bowling
  // qualification rule), so it is summed from the per-match rows.
  const bowledByPlayer = await fetchBallsBowled(signal);

  const players: RankPlayer[] = careers
    .filter((c): c is CareerRow & { player: NonNullable<CareerRow['player']> } => c.player !== null)
    .map((c) => ({
      playerId: c.player_id,
      displayName: c.player.short_name || c.player.full_name,
      photoUrl: c.player.photo_url,
      role: c.player.primary_role,
      teamIds: teamsByPlayer.get(c.player_id) ?? [],
      matches: c.matches,
      inningsBatted: c.innings_batted,
      inningsBowled: c.innings_bowled,
      ballsFaced: c.balls_faced,
      ballsBowled: bowledByPlayer.get(c.player_id) ?? 0,
      ratings: {
        overall: c.overall_rating,
        batting: c.batting_rating,
        bowling: c.bowling_rating,
        allrounder: c.allrounder_rating,
        fielding: c.fielding_rating,
      },
    }));

  return {
    players,
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortCode: t.short_code,
      primaryColor: t.primary_color,
    })),
    movement: buildMovement(snapshots),
  };
}

async function fetchBallsBowled(signal?: AbortSignal): Promise<Map<string, number>> {
  const rows = await selectAll<{ player_id: string; balls_bowled: number }>(
    'player_match_stats?select=player_id,balls_bowled&order=player_id.asc',
    signal
  );
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.player_id, (out.get(r.player_id) ?? 0) + r.balls_bowled);
  return out;
}

/**
 * Movement is this player's most recent rank against their previous one, on
 * the same board. Positive means they climbed — a rank *number* going down.
 * Anyone with only one snapshot has no movement rather than a movement of
 * zero, so a new entry never renders a misleading "no change" dash.
 */
export function buildMovement(snapshots: readonly SnapshotRow[]): Map<string, number> {
  const byKey = new Map<string, SnapshotRow[]>();
  for (const s of snapshots) {
    const key = `${s.board}:${s.player_id}`;
    const list = byKey.get(key);
    if (list) list.push(s);
    else byKey.set(key, [s]);
  }

  const movement = new Map<string, number>();
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
    const latest = sorted[0];
    const previous = sorted[1];
    if (latest && previous) movement.set(key, previous.rank - latest.rank);
  }
  return movement;
}
