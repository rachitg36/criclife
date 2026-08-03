import {
  BOARDS,
  DEFAULT_FILTER,
  type Board,
  type RankPlayer,
  type RankRow,
  type RanksFilter,
} from './types';

/**
 * docs/07-STATS-AND-RANKINGS.md § 3.2 — filtering, renumbering and the
 * qualification split. Pure, because this is the part of the Ranks page with
 * a rule that is easy to get subtly wrong and impossible to eyeball:
 *
 *   **Ratings never change when you filter.** The filter narrows the
 *   population; it does not recompute anything. Positions renumber within the
 *   filtered set, and every row keeps its global rank as a ghost number so the
 *   wider context is never lost.
 *
 * That is also the phase's acceptance criterion — "filtering by two teams
 * renumbers correctly while preserving global ranks as ghost numbers".
 */

export type QualificationThresholds = {
  overallMinMatches: number;
  battingMinInnings: number;
  battingMinBalls: number;
  bowlingMinInnings: number;
  bowlingMinBalls: number;
  fieldingMinMatches: number;
};

export const DEFAULT_THRESHOLDS: QualificationThresholds = {
  overallMinMatches: 5,
  battingMinInnings: 5,
  battingMinBalls: 60,
  bowlingMinInnings: 5,
  bowlingMinBalls: 180,
  fieldingMinMatches: 5,
};

/** docs/07 § 2.3. All-rounder deliberately requires *both* other boards. */
export function qualifies(
  player: RankPlayer,
  board: Board,
  t: QualificationThresholds = DEFAULT_THRESHOLDS
): boolean {
  const bat = player.inningsBatted >= t.battingMinInnings && player.ballsFaced >= t.battingMinBalls;
  const bowl =
    player.inningsBowled >= t.bowlingMinInnings && player.ballsBowled >= t.bowlingMinBalls;

  switch (board) {
    case 'overall':
      return player.matches >= t.overallMinMatches;
    case 'batting':
      return bat;
    case 'bowling':
      return bowl;
    case 'allrounder':
      return bat && bowl;
    case 'fielding':
      return player.matches >= t.fieldingMinMatches;
  }
}

/**
 * How far through qualification an unqualified player is, 0–1 — the progress
 * ring on the Emerging section. Uses the *binding* requirement (the one they
 * are furthest from), so the ring never implies they are nearly there when one
 * of two criteria has barely started.
 */
export function qualificationProgress(
  player: RankPlayer,
  board: Board,
  t: QualificationThresholds = DEFAULT_THRESHOLDS
): number {
  const ratio = (have: number, need: number) => (need <= 0 ? 1 : Math.min(1, have / need));
  switch (board) {
    case 'overall':
      return ratio(player.matches, t.overallMinMatches);
    case 'fielding':
      return ratio(player.matches, t.fieldingMinMatches);
    case 'batting':
      return Math.min(
        ratio(player.inningsBatted, t.battingMinInnings),
        ratio(player.ballsFaced, t.battingMinBalls)
      );
    case 'bowling':
      return Math.min(
        ratio(player.inningsBowled, t.bowlingMinInnings),
        ratio(player.ballsBowled, t.bowlingMinBalls)
      );
    case 'allrounder':
      return Math.min(
        qualificationProgress(player, 'batting', t),
        qualificationProgress(player, 'bowling', t)
      );
  }
}

export function confidenceOf(player: RankPlayer): number {
  return Math.min(1, player.matches / 15);
}

function matchesTeamFilter(player: RankPlayer, filter: RanksFilter): boolean {
  if (filter.teamIds.length === 0) return true;
  return filter.matchAllTeams
    ? filter.teamIds.every((id) => player.teamIds.includes(id))
    : filter.teamIds.some((id) => player.teamIds.includes(id));
}

function matchesOtherFilters(player: RankPlayer, filter: RanksFilter): boolean {
  if (filter.role && player.role !== filter.role) return false;
  if (filter.minMatches !== null && player.matches < filter.minMatches) return false;
  return true;
}

export type BoardResult = {
  ranked: RankRow[];
  /** Below the qualification bar — shown separately, never mixed in. */
  emerging: RankRow[];
};

/**
 * Builds one board.
 *
 * The global ranking is computed **first, over the whole population**, and
 * only then is the filter applied. Doing it the other way round — filtering
 * and then ranking — would still produce correct positions but would lose the
 * ghost number entirely, which is the bit docs/07 § 3.2 is emphatic about.
 */
export function buildBoard(
  players: readonly RankPlayer[],
  filter: RanksFilter,
  movementByPlayer: ReadonlyMap<string, number> = new Map(),
  thresholds: QualificationThresholds = DEFAULT_THRESHOLDS
): BoardResult {
  const { board } = filter;

  const rated = players.filter((p) => p.ratings[board] !== null);

  // Global positions, over everyone, before any filtering. Only qualified
  // players hold a global position — an emerging player has no global rank to
  // ghost, which is why the field is nullable.
  const globalRank = new Map<string, number>();
  [...rated]
    .filter((p) => qualifies(p, board, thresholds))
    .sort((a, b) => (b.ratings[board] ?? 0) - (a.ratings[board] ?? 0))
    .forEach((p, i) => globalRank.set(p.playerId, i + 1));

  const visible = rated.filter(
    (p) => matchesTeamFilter(p, filter) && matchesOtherFilters(p, filter)
  );

  const toRow = (p: RankPlayer, rank: number): RankRow => ({
    player: p,
    rating: p.ratings[board] ?? 0,
    rank,
    globalRank: globalRank.get(p.playerId) ?? null,
    movement: movementByPlayer.get(`${board}:${p.playerId}`) ?? null,
    confidence: confidenceOf(p),
  });

  const sorted = [...visible].sort((a, b) => (b.ratings[board] ?? 0) - (a.ratings[board] ?? 0));
  const qualified = sorted.filter((p) => qualifies(p, board, thresholds));
  const notYet = sorted.filter((p) => !qualifies(p, board, thresholds));

  return {
    ranked: qualified.map((p, i) => toRow(p, i + 1)),
    emerging: notYet.map((p, i) => toRow(p, i + 1)),
  };
}

/* ── URL encoding (docs/07 § 3.2 — "a filtered board is shareable") ─────── */

export function filterToSearchParams(filter: RanksFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.board !== DEFAULT_FILTER.board) params.set('board', filter.board);
  if (filter.teamIds.length > 0) params.set('teams', filter.teamIds.join(','));
  if (filter.matchAllTeams) params.set('all', '1');
  if (filter.role) params.set('role', filter.role);
  if (filter.minMatches !== null) params.set('min', String(filter.minMatches));
  if (!filter.includeShadowPlayers) params.set('shadow', '0');
  return params;
}

export function filterFromSearchParams(params: URLSearchParams): RanksFilter {
  const board = params.get('board');
  const teams = params.get('teams');
  const min = params.get('min');
  const parsedMin = min === null ? null : Number.parseInt(min, 10);

  return {
    board: BOARDS.includes(board as Board) ? (board as Board) : DEFAULT_FILTER.board,
    teamIds: teams ? teams.split(',').filter(Boolean) : [],
    matchAllTeams: params.get('all') === '1',
    role: params.get('role'),
    minMatches: parsedMin !== null && Number.isFinite(parsedMin) ? parsedMin : null,
    includeShadowPlayers: params.get('shadow') !== '0',
  };
}
