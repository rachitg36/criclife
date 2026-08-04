import type { Delivery, MatchConfig, MatchStatus } from '@/engine/types';

/**
 * The audience view's own read models. Deliberately separate from
 * `src/types/database.ts` rows: this route is public and unauthenticated, and
 * it should be obvious at a glance exactly which columns leave the server for
 * an anonymous reader.
 */

/**
 * The engine's `Delivery` plus the bits the engine has no use for but a
 * spectator does: the server id, the ordering key, and the shot/pitch coords
 * behind the wagon wheel. The engine type deliberately omits all of these
 * (docs/04 — "server-only bookkeeping is the data layer's concern"), so this
 * widening lives here rather than in `src/engine/`.
 */
export type AudienceDelivery = Delivery & {
  id: string;
  seq: number;
  shot: { x: number; y: number } | null;
  pitch: { x: number; y: number } | null;
};

export type AudienceTeam = {
  id: string;
  name: string;
  shortCode: string;
  primaryColor: string;
  secondaryColor: string | null;
  logoUrl: string | null;
};

export type AudiencePlayer = {
  id: string;
  teamId: string;
  displayName: string;
  photoUrl: string | null;
  battingStyle: string | null;
  bowlingStyle: string | null;
  playingRole: string | null;
  isCaptain: boolean;
  isWicketKeeper: boolean;
  battingOrder: number | null;
};

export type AudienceInningsRow = {
  id: string;
  inningsNo: number;
  battingTeamId: string;
  bowlingTeamId: string;
  isSuperOver: boolean;
  status: string;
  target: number | null;
  revisedTarget: number | null;
  revisedOvers: number | null;
};

export type AudienceMatch = {
  id: string;
  publicSlug: string | null;
  title: string | null;
  venue: string | null;
  status: MatchStatus;
  isLocked: boolean;
  /** The server's own sentence for how this match ended. `complete_match`
      writes the result here; `abandon_match` writes the **reason** here. It is
      the only place either one exists — the delivery log cannot imply "called
      off for rain", and for an abandoned match the engine has no result at
      all. */
  resultText: string | null;
  winnerTeamId: string | null;
  config: MatchConfig;
  teamA: AudienceTeam;
  teamB: AudienceTeam;
  scheduledAt: string | null;
};

/** Everything one page load of `/live/:publicSlug` needs, in one shape. */
export type AudienceSnapshot = {
  match: AudienceMatch;
  innings: AudienceInningsRow[];
  players: AudiencePlayer[];
  deliveries: AudienceDelivery[];
};

export type NameLookup = (playerId: string) => string;
