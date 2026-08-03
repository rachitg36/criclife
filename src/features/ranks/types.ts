/** docs/07-STATS-AND-RANKINGS.md § 2.2 — the five boards. */
export const BOARDS = ['overall', 'batting', 'bowling', 'allrounder', 'fielding'] as const;
export type Board = (typeof BOARDS)[number];

export const BOARD_LABELS: Record<Board, string> = {
  overall: 'Overall',
  batting: 'Batting',
  bowling: 'Bowling',
  allrounder: 'All-rounder',
  fielding: 'Fielding',
};

export type RankTeam = {
  id: string;
  name: string;
  shortCode: string;
  primaryColor: string;
};

export type RankPlayer = {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  role: string | null;
  /** Every team the player is a current member of. Drives the team filter. */
  teamIds: string[];
  matches: number;
  inningsBatted: number;
  inningsBowled: number;
  ballsFaced: number;
  ballsBowled: number;
  ratings: Record<Board, number | null>;
};

/** A row as rendered: position within the current filter, plus global context. */
export type RankRow = {
  player: RankPlayer;
  rating: number;
  /** 1-based within the filtered population. */
  rank: number;
  /**
   * Position on the unfiltered global board. docs/07 § 3.2 — shown as a ghost
   * number so a filtered board never loses the wider context.
   */
  globalRank: number | null;
  /** Change since the previous snapshot: positive is an improvement. */
  movement: number | null;
  /** docs/07 § 2.4 — `min(1, matches / 15)`. */
  confidence: number;
};

export type RanksFilter = {
  board: Board;
  /** Empty means the global board across every player of every team. */
  teamIds: string[];
  /** docs/07 § 3.2 — union by default; intersection for "who plays for both?". */
  matchAllTeams: boolean;
  role: string | null;
  minMatches: number | null;
  includeShadowPlayers: boolean;
};

export const DEFAULT_FILTER: RanksFilter = {
  board: 'overall',
  teamIds: [],
  matchAllTeams: false,
  role: null,
  minMatches: null,
  includeShadowPlayers: true,
};
