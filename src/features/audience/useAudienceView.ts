import { useMemo } from 'react';
import {
  ballsRemaining,
  buildInningsScorecard,
  currentRunRate,
  oversDisplay,
  replay,
  requiredRunRate,
  requiredRuns,
} from '@/engine';
import type { InningsState, MatchState, PlayerId } from '@/engine/types';
import { shortName } from '@/lib/format';
import { inLastOver, isHatTrickBall } from './moments';
import {
  computeWinProbability,
  UNKNOWN_WIN_PROBABILITY,
  type WinProbability,
} from './winProbability';
import { useAudienceStore } from './store';
import type { AudienceDelivery, AudiencePlayer, AudienceTeam, NameLookup } from './types';
import type { InningsSeed } from '@/engine/replay';

/**
 * Everything the phone layout and the `?tv=1` layout both need, derived once.
 * Two layouts rendering the same match from the same store must not each grow
 * their own slightly different idea of "the current innings".
 */

export type AudienceView = {
  ready: boolean;
  matchState: MatchState | null;
  innings: InningsState | null;
  battingTeam: AudienceTeam | null;
  bowlingTeam: AudienceTeam | null;
  /** Score line pieces, pre-formatted where formatting is shared. */
  oversLine: string;
  maxOvers: number;
  crr: number | null;
  rrr: number | null;
  need: number | null;
  ballsLeft: number;
  /** The completed first innings, when there is one to show as a target line. */
  previousInnings: InningsState | null;
  winProbability: WinProbability;
  isLastOver: boolean;
  isHatTrickBall: boolean;
  isComplete: boolean;
  nameOf: NameLookup;
  playerById: Map<string, AudiencePlayer>;
  teamById: Map<string, AudienceTeam>;
  /** Deliveries of the innings currently on screen, in order. */
  inningsDeliveries: AudienceDelivery[];
  /** The current over's balls, for the `· 1 · 4 W ·` strip. */
  thisOver: AudienceDelivery[];
};

function seedsOf(state: MatchState): InningsSeed[] {
  return state.innings.map((i) => ({
    inningsNo: i.inningsNo,
    battingTeamId: i.battingTeamId,
    bowlingTeamId: i.bowlingTeamId,
    isSuperOver: i.isSuperOver,
  }));
}

export function useAudienceView(): AudienceView {
  const match = useAudienceStore((s) => s.match);
  const liveState = useAudienceStore((s) => s.matchState);
  const deliveries = useAudienceStore((s) => s.deliveries);
  const players = useAudienceStore((s) => s.players);
  const scrubTo = useAudienceStore((s) => s.scrubTo);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const teamById = useMemo(() => {
    const m = new Map<string, AudienceTeam>();
    if (match) {
      m.set(match.teamA.id, match.teamA);
      m.set(match.teamB.id, match.teamB);
    }
    return m;
  }, [match]);

  const nameOf = useMemo<NameLookup>(
    () => (id: PlayerId) => {
      const p = playerById.get(id);
      if (!p) return 'Unknown';
      return p.displayName.includes(' ') ? shortName(p.displayName) : p.displayName;
    },
    [playerById]
  );

  /**
   * The replay scrubber (docs/06 § 7) is a client-side re-fold of a prefix of
   * the log. It rebuilds from ball one on each scrub position rather than
   * caching every prefix state: the scrubber only ever appears on a completed
   * match, `deliveries` is stable there, and `useMemo` on the integer position
   * means the fold runs once per position the user actually stops at, not once
   * per animation frame.
   */
  const shown = useMemo(() => {
    if (scrubTo === null || !liveState || !match) return liveState;
    const prefix = deliveries.slice(0, scrubTo);
    try {
      return replay(match.id, match.config, prefix, seedsOf(liveState));
    } catch {
      return liveState;
    }
  }, [scrubTo, liveState, deliveries, match]);

  const visibleDeliveries = useMemo(
    () => (scrubTo === null ? deliveries : deliveries.slice(0, scrubTo)),
    [deliveries, scrubTo]
  );

  return useMemo<AudienceView>(() => {
    if (!match || !shown) {
      return {
        ready: false,
        matchState: null,
        innings: null,
        battingTeam: null,
        bowlingTeam: null,
        oversLine: '0.0',
        maxOvers: 0,
        crr: null,
        rrr: null,
        need: null,
        ballsLeft: 0,
        previousInnings: null,
        winProbability: UNKNOWN_WIN_PROBABILITY,
        isLastOver: false,
        isHatTrickBall: false,
        isComplete: false,
        nameOf,
        playerById,
        teamById,
        inningsDeliveries: [],
        thisOver: [],
      };
    }

    const config = match.config;
    const innings = shown.innings[shown.currentInningsIndex] ?? null;
    const previousInnings =
      shown.currentInningsIndex > 0 ? (shown.innings[shown.currentInningsIndex - 1] ?? null) : null;

    const inningsDeliveries = innings
      ? visibleDeliveries.filter((d) => d.inningsNo === innings.inningsNo)
      : [];

    const lastOverNo = inningsDeliveries[inningsDeliveries.length - 1]?.overNo ?? null;
    const thisOver =
      lastOverNo === null ? [] : inningsDeliveries.filter((d) => d.overNo === lastOverNo);

    return {
      ready: true,
      matchState: shown,
      innings,
      battingTeam: innings ? (teamById.get(innings.battingTeamId) ?? null) : null,
      bowlingTeam: innings ? (teamById.get(innings.bowlingTeamId) ?? null) : null,
      oversLine: innings ? oversDisplay(innings.legalBalls, config.ballsPerOver) : '0.0',
      maxOvers: innings?.revisedOvers ?? config.oversPerInnings,
      crr: innings && innings.legalBalls > 0 ? currentRunRate(innings, config) : null,
      rrr: innings ? requiredRunRate(innings, config) : null,
      need: innings ? requiredRuns(innings) : null,
      ballsLeft: innings ? ballsRemaining(innings, config) : 0,
      previousInnings,
      winProbability: computeWinProbability(shown, config),
      isLastOver: inLastOver(shown, config),
      isHatTrickBall: isHatTrickBall(inningsDeliveries, innings?.bowlerId ?? null),
      // `abandoned` counts too. A match called off mid-chase has no engine
      // result — the delivery log never implied one — so anything keying off
      // `result` alone goes on showing "Need 1 off 4 balls" forever.
      isComplete:
        shown.result !== null ||
        match.status === 'completed' ||
        match.status === 'abandoned' ||
        match.isLocked,
      nameOf,
      playerById,
      teamById,
      inningsDeliveries,
      thisOver,
    };
  }, [match, shown, visibleDeliveries, nameOf, playerById, teamById]);
}

/** The full scorecard for one innings — used by the scorecard tab and TV mode. */
export function useInningsScorecards(
  state: MatchState | null,
  config: MatchState['config'] | null
) {
  return useMemo(() => {
    if (!state || !config) return [];
    return state.innings.map((i) => buildInningsScorecard(i, config));
  }, [state, config]);
}
