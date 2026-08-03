import { CREDIT_TABLE } from '@/engine';
import type { MatchConfig } from '@/engine/types';
import type { AudienceDelivery, NameLookup } from './types';

/**
 * docs/06-AUDIENCE-VIEW.md § 2 "Live" — the ball-by-ball feed, newest first,
 * with an `End of over 14 · 12 runs · MUM 147-4` divider between overs.
 *
 * Pure: takes the log, returns the list. All animation, virtualisation and
 * theming happen in the component.
 */

export type BallAccent = 'four' | 'six' | 'wicket' | 'extra' | null;

export type FeedItem =
  | {
      kind: 'ball';
      key: string;
      inningsNo: number;
      /** `14.3` — the engine numbers overs from 0, cricket displays from 0 too. */
      label: string;
      text: string;
      accent: BallAccent;
      runsTotal: number;
      delivery: AudienceDelivery;
    }
  | {
      kind: 'over';
      key: string;
      inningsNo: number;
      /** 1-based for display: the engine's `overNo` 13 is "end of over 14". */
      overNumber: number;
      runs: number;
      wickets: number;
      maiden: boolean;
      scoreAfter: { runs: number; wickets: number };
    }
  | {
      kind: 'innings';
      key: string;
      inningsNo: number;
      text: string;
    };

/**
 * The engine writes commentary with player *ids* in it — it has no name
 * dictionary and docs/04 § 11 is explicit that supplying one is the UI's job.
 * Substituting here keeps a single commentary generator for the scorer and the
 * audience instead of a second, drifting copy of the phrase pools.
 */
export function resolveNames(text: string, nameOf: NameLookup, ids: Iterable<string>): string {
  let out = text;
  for (const id of ids) {
    if (!id) continue;
    out = out.split(id).join(nameOf(id));
  }
  return out;
}

function accentFor(d: AudienceDelivery): BallAccent {
  if (d.isWicket && d.wicketType !== null && CREDIT_TABLE[d.wicketType].countsAsWicket) {
    return 'wicket';
  }
  if (d.isBoundarySix) return 'six';
  if (d.isBoundaryFour) return 'four';
  if (d.extraType !== null) return 'extra';
  return null;
}

function idsIn(d: AudienceDelivery): string[] {
  return [
    d.bowlerId,
    d.strikerId,
    d.nonStrikerId,
    d.dismissedPlayerId ?? '',
    d.fielderId ?? '',
    d.assistFielderId ?? '',
  ].filter(Boolean);
}

export type BuildFeedOptions = {
  deliveries: readonly AudienceDelivery[];
  config: MatchConfig;
  nameOf: NameLookup;
  /** `shortCode` per team id, for the `MUM 147-4` in an over divider. */
  teamCodeOf: (teamId: string) => string;
  /** batting team per innings number, for the same. */
  battingTeamOf: (inningsNo: number) => string | null;
};

/**
 * Builds the feed **newest first**. The dividers are computed on a forward
 * pass (they need the running score at the end of each over) and the whole
 * list is reversed once at the end, rather than trying to reason backwards
 * about a total that only makes sense forwards.
 */
export function buildFeed(opts: BuildFeedOptions): FeedItem[] {
  const { deliveries, config, nameOf, teamCodeOf, battingTeamOf } = opts;
  const chronological: FeedItem[] = [];

  let runs = 0;
  let wickets = 0;
  let overRuns = 0;
  let overWickets = 0;
  let overLegalBalls = 0;
  let overBowlerRuns = 0;
  let currentOver: number | null = null;
  let currentInnings: number | null = null;

  const closeOver = (inningsNo: number, overNo: number) => {
    chronological.push({
      kind: 'over',
      key: `over:${inningsNo}:${overNo}`,
      inningsNo,
      overNumber: overNo + 1,
      runs: overRuns,
      wickets: overWickets,
      // A maiden is a *completed* over off which no runs were conceded to the
      // bowler. Byes and leg-byes are not conceded by the bowler, so an over
      // of four leg-byes is still a maiden — same rule the engine applies.
      maiden: overLegalBalls === config.ballsPerOver && overBowlerRuns === 0,
      scoreAfter: { runs, wickets },
    });
    overRuns = 0;
    overWickets = 0;
    overLegalBalls = 0;
    overBowlerRuns = 0;
  };

  for (const d of deliveries) {
    if (currentInnings !== null && d.inningsNo !== currentInnings) {
      if (currentOver !== null) closeOver(currentInnings, currentOver);
      const teamId = battingTeamOf(currentInnings);
      chronological.push({
        kind: 'innings',
        key: `innings:${currentInnings}`,
        inningsNo: currentInnings,
        text: `End of innings ${currentInnings} · ${teamId ? `${teamCodeOf(teamId)} ` : ''}${runs}-${wickets}`,
      });
      runs = 0;
      wickets = 0;
      currentOver = null;
    } else if (currentOver !== null && d.overNo !== currentOver) {
      closeOver(d.inningsNo, currentOver);
    }

    currentInnings = d.inningsNo;
    currentOver = d.overNo;

    runs += d.runsTotal;
    overRuns += d.runsTotal;
    if (d.isLegal) overLegalBalls += 1;
    // Byes and leg-byes are extras the bowler is not charged for.
    if (d.extraType !== 'bye' && d.extraType !== 'leg_bye') overBowlerRuns += d.runsTotal;
    if (d.isWicket && d.wicketType !== null && CREDIT_TABLE[d.wicketType].countsAsWicket) {
      wickets += 1;
      overWickets += 1;
    }

    chronological.push({
      kind: 'ball',
      key: `ball:${d.clientDeliveryId}`,
      inningsNo: d.inningsNo,
      label: `${d.overNo}.${d.ballInOver}`,
      text: resolveNames(d.commentary, nameOf, idsIn(d)),
      accent: accentFor(d),
      runsTotal: d.runsTotal,
      delivery: d,
    });
  }

  if (currentInnings !== null && currentOver !== null) {
    // Only close the trailing over once it is genuinely complete — mid-over,
    // there is no "end of over 14" to show yet.
    if (overLegalBalls === config.ballsPerOver) closeOver(currentInnings, currentOver);
  }

  return chronological.reverse();
}
