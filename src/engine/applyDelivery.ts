import { generateCommentary } from './commentary';
import { resolveMaxOversPerBowler } from './config';
import { buildDismissalText, CREDIT_TABLE, isWicketAllowed } from './dismissals';
import { checkInningsEnd, effectivePlayersPerSide } from './inningsEnd';
import { superOverConfig } from './result';
import { resolveRunOutEnds, shouldSwapOnRuns, type StrikeDeliveryFacts } from './strike';
import type {
  BatterState,
  BowlerState,
  Delivery,
  DeliveryInput,
  EngineEvent,
  EngineResult,
  ExtraType,
  InningsState,
  MatchConfig,
  MatchState,
  PlayerId,
} from './types';

function runsThatCrossed(d: StrikeDeliveryFacts, cfg: MatchConfig): number {
  if (d.extraType === 'wide') return Math.max(0, d.runsExtras - cfg.wideRuns);
  if (d.extraType === 'bye' || d.extraType === 'leg_bye') return d.runsExtras;
  return d.runsBatter;
}

function extrasBucket(extraType: ExtraType | null): keyof InningsState['extras'] | null {
  switch (extraType) {
    case 'wide':
      return 'wides';
    case 'no_ball':
      return 'noBalls';
    case 'bye':
      return 'byes';
    case 'leg_bye':
      return 'legByes';
    case 'penalty':
      return 'penalty';
    default:
      return null;
  }
}

function requireBatter(innings: InningsState, playerId: PlayerId): BatterState {
  const batter = innings.batters[playerId];
  if (!batter) throw new Error(`INVARIANT: batter ${playerId} not on the crease`);
  return batter;
}

function requireBowler(innings: InningsState, playerId: PlayerId): BowlerState {
  const bowler = innings.bowlers[playerId];
  if (!bowler) throw new Error(`INVARIANT: bowler ${playerId} not tracked`);
  return bowler;
}

/**
 * docs/04-RULES-ENGINE.md §4 — executed in this exact order, order matters.
 * `state` is never mutated; a `structuredClone` is taken up front and every
 * step below mutates that private copy before it's returned.
 */
export function applyDelivery(state: MatchState, input: DeliveryInput): EngineResult {
  const next = structuredClone(state);
  const innings = next.innings[next.currentInningsIndex];

  // ── 1. VALIDATE ──────────────────────────────────────────────────────
  if (!innings || innings.status !== 'in_progress') {
    return { ok: false, error: 'INNINGS_NOT_IN_PROGRESS' };
  }
  // A super over is 1-over-a-side, 3 batters, regardless of the match's own
  // T20/ODI/etc config — see docs/04-RULES-ENGINE.md §7.2 and result.ts.
  const config = innings.isSuperOver ? superOverConfig(next.config) : next.config;
  // True last-man-standing: exactly one recognised batter remains, batting
  // without a partner. Only reachable once `lastManStanding` is configured
  // *and* the second-to-last wicket has actually fallen — not from ball one.
  const isLastManState =
    config.lastManStanding && innings.wickets === effectivePlayersPerSide(config, innings) - 1;
  if (!innings.strikerId || innings.strikerId === innings.nonStrikerId) {
    return { ok: false, error: 'BATTERS_NOT_SET' };
  }
  if (!isLastManState && !innings.nonStrikerId) {
    return { ok: false, error: 'BATTERS_NOT_SET' };
  }
  if (!innings.bowlerId) {
    return { ok: false, error: 'BOWLER_NOT_SET' };
  }
  if (innings.bowlerId === innings.previousBowlerId) {
    return { ok: false, error: 'BOWLER_CANNOT_BOWL_CONSECUTIVE_OVERS' };
  }
  const startingFreshOver = innings.legalBalls % config.ballsPerOver === 0;
  if (startingFreshOver) {
    const bowler = requireBowler(innings, innings.bowlerId);
    const oversBowled = Math.floor(bowler.legalBalls / config.ballsPerOver);
    if (oversBowled >= resolveMaxOversPerBowler(config)) {
      return { ok: false, error: 'BOWLER_OVERS_EXHAUSTED' };
    }
  }
  if (input.wicket && !isWicketAllowed(input.wicket.type, input.extraType, innings.isFreeHit)) {
    return { ok: false, error: 'ILLEGAL_DISMISSAL' };
  }

  const strikerIdAtStart = innings.strikerId;
  const nonStrikerIdAtStart = innings.nonStrikerId;
  const bowlerIdAtStart = innings.bowlerId;

  // ── 2. CLASSIFY LEGALITY ─────────────────────────────────────────────
  const isLegal = input.extraType !== 'wide' && input.extraType !== 'no_ball';

  // ── 3. COMPUTE RUNS ──────────────────────────────────────────────────
  const autoExtra =
    input.extraType === 'wide'
      ? config.wideRuns
      : input.extraType === 'no_ball'
        ? config.noBallRuns
        : 0;

  let batterRuns: number;
  let extraRunsTotal: number;
  switch (input.extraType) {
    case 'wide':
      batterRuns = 0;
      extraRunsTotal = autoExtra + input.extraRuns;
      break;
    case 'no_ball':
      batterRuns = input.runsOffBat;
      extraRunsTotal = autoExtra + input.extraRuns;
      break;
    case 'bye':
      batterRuns = 0;
      extraRunsTotal = input.extraRuns;
      break;
    case 'leg_bye':
      batterRuns = 0;
      extraRunsTotal = input.extraRuns;
      break;
    case 'penalty':
      batterRuns = 0;
      extraRunsTotal = input.penaltyRuns ?? 0;
      break;
    default:
      batterRuns = input.runsOffBat;
      extraRunsTotal = 0;
  }
  const totalRuns = batterRuns + extraRunsTotal;
  const isBoundaryFour = input.isBoundary && batterRuns === 4;
  const isBoundarySix = input.isBoundary && batterRuns === 6;

  // ── 4. APPLY TO INNINGS TOTAL ────────────────────────────────────────
  innings.runs += totalRuns;
  const bucket = extrasBucket(input.extraType);
  if (bucket) innings.extras[bucket] += extraRunsTotal;

  // ── 5. APPLY TO BATTER ───────────────────────────────────────────────
  const striker = requireBatter(innings, strikerIdAtStart);
  const runsBeforeThisBall = striker.runs;
  if (input.extraType !== 'wide') striker.balls += 1;
  striker.runs += batterRuns;
  if (isBoundaryFour) striker.fours += 1;
  if (isBoundarySix) striker.sixes += 1;

  // ── 6. APPLY TO BOWLER ───────────────────────────────────────────────
  const bowler = requireBowler(innings, bowlerIdAtStart);
  if (isLegal) {
    bowler.legalBalls += 1;
    innings.legalBalls += 1;
  }
  const bowlerChargedRuns =
    input.extraType === 'bye' || input.extraType === 'leg_bye' ? 0 : totalRuns;
  bowler.runsConceded += bowlerChargedRuns;
  if (input.extraType === 'wide') bowler.wides += 1;
  if (input.extraType === 'no_ball') bowler.noBalls += 1;
  if (totalRuns === 0 && isLegal) bowler.dots += 1;

  if (!innings.currentOver.bowlerIds.includes(bowlerIdAtStart)) {
    innings.currentOver.bowlerIds.push(bowlerIdAtStart);
  }
  innings.currentOver.runs += bowlerChargedRuns;

  // ── 7. FREE HIT RESOLUTION (before this ball's wicket is processed) ──
  const wasFreeHit = innings.isFreeHit;
  let nextIsFreeHit: boolean;
  if (input.extraType === 'no_ball' && config.freeHitAfterNoBall) {
    nextIsFreeHit = true;
  } else if (input.extraType === 'wide') {
    nextIsFreeHit = wasFreeHit;
  } else {
    nextIsFreeHit = false;
  }

  // ── 8. APPLY WICKET ──────────────────────────────────────────────────
  const events: EngineEvent[] = [];
  let newBatterRequired = false;

  if (input.wicket) {
    const credit = CREDIT_TABLE[input.wicket.type];
    if (credit.countsAsWicket) innings.wickets += 1;

    const dismissedId = input.wicket.dismissedPlayerId;
    const dismissedBatter = requireBatter(innings, dismissedId);
    dismissedBatter.status =
      input.wicket.type === 'retired_hurt'
        ? 'retired_hurt'
        : input.wicket.type === 'retired_out'
          ? 'retired_out'
          : 'out';

    const creditedBowlerId = credit.bowlerCredited ? bowlerIdAtStart : null;
    const fielderId = input.wicket.fielderId ?? null;
    const assistFielderId = input.wicket.assistFielderId ?? null;
    dismissedBatter.dismissal = {
      type: input.wicket.type,
      dismissedPlayerId: dismissedId,
      bowlerId: creditedBowlerId,
      fielderId,
      assistFielderId,
      text: buildDismissalText(input.wicket.type, creditedBowlerId, fielderId),
    };

    if (credit.bowlerCredited) bowler.wickets += 1;

    if (credit.countsAsWicket) {
      innings.fallOfWickets.push({
        wicketNumber: innings.wickets,
        runs: innings.runs,
        legalBalls: innings.legalBalls,
        playerId: dismissedId,
      });
    }
  }

  // ── 9. STRIKE ROTATION ───────────────────────────────────────────────
  const facts: StrikeDeliveryFacts = {
    extraType: input.extraType,
    runsBatter: batterRuns,
    runsExtras: extraRunsTotal,
    isBoundaryFour,
    isBoundarySix,
    wicketType: input.wicket?.type === 'run_out' ? 'run_out' : null,
  };

  let strikerId: PlayerId | null = strikerIdAtStart;
  let nonStrikerId: PlayerId | null = nonStrikerIdAtStart;

  if (input.wicket) {
    if (nonStrikerId === null) {
      // True last-man-standing: no partner to compute "ends" with — the
      // dismissed player can only be the striker themself, and there is by
      // definition no one left in `yetToBat` to replace them.
      strikerId = null;
      newBatterRequired = false;
    } else {
      const completed = runsThatCrossed(facts, config);
      const ends = resolveRunOutEnds(
        strikerId,
        nonStrikerId,
        input.wicket.dismissedPlayerId,
        completed,
        input.wicket.crossedBeforeDismissal ?? false
      );
      strikerId = ends.strikerId;
      nonStrikerId = ends.nonStrikerId;
      newBatterRequired = strikerId === null || nonStrikerId === null;
    }
  } else if (!isLastManState && shouldSwapOnRuns(facts, config)) {
    [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
  }

  // ── 10. OVER COMPLETION ──────────────────────────────────────────────
  if (isLegal && innings.legalBalls % config.ballsPerOver === 0) {
    if (!isLastManState) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    }
    const isMaiden = innings.currentOver.bowlerIds.length === 1 && innings.currentOver.runs === 0;
    if (isMaiden) bowler.maidens += 1;

    events.push({
      type: 'OVER_COMPLETE',
      inningsNo: innings.inningsNo,
      overNo: Math.floor(innings.legalBalls / config.ballsPerOver) - 1,
      bowlerId: bowlerIdAtStart,
      maiden: isMaiden,
    });

    innings.previousBowlerId = bowlerIdAtStart;
    innings.bowlerId = null;
    innings.currentOver = { bowlerIds: [], runs: 0 };
  }

  // If this ball's wicket dropped the innings into true last-man-standing,
  // the sole survivor always ends up as striker — they face every ball from
  // here on, regardless of which end the run-out arithmetic left them at.
  if (
    config.lastManStanding &&
    innings.wickets === effectivePlayersPerSide(config, innings) - 1 &&
    strikerId === null &&
    nonStrikerId !== null
  ) {
    strikerId = nonStrikerId;
    nonStrikerId = null;
  }

  innings.strikerId = strikerId;
  innings.nonStrikerId = nonStrikerId;
  innings.isFreeHit = nextIsFreeHit;

  // ── 11. NEW BATTER REQUIRED ──────────────────────────────────────────
  const inningsWillEnd = checkInningsEnd(innings, config) !== null;
  if (newBatterRequired && !inningsWillEnd) {
    events.push({ type: 'NEW_BATTER_REQUIRED', inningsNo: innings.inningsNo });
  }

  // ── 12. INNINGS / MATCH END CHECK ────────────────────────────────────
  const endReason = checkInningsEnd(innings, config);
  if (endReason) {
    innings.status = 'completed';
    innings.endReason = endReason;
    events.push({ type: 'INNINGS_COMPLETE', inningsNo: innings.inningsNo, reason: endReason });
  }

  let milestone: 'fifty' | 'hundred' | undefined;
  if (runsBeforeThisBall < 100 && striker.runs >= 100) {
    milestone = 'hundred';
  } else if (runsBeforeThisBall < 50 && striker.runs >= 50) {
    milestone = 'fifty';
  }
  if (milestone) events.push({ type: 'MILESTONE', playerId: strikerIdAtStart, milestone });

  // ── 13. COMMENTARY, RETURN NEW STATE + EVENTS ────────────────────────
  const overNo = Math.floor(
    (isLegal ? innings.legalBalls - 1 : innings.legalBalls) / config.ballsPerOver
  );
  const ballInOver = isLegal
    ? ((innings.legalBalls - 1) % config.ballsPerOver) + 1
    : (innings.legalBalls % config.ballsPerOver) + 1;

  const delivery: Delivery = {
    inningsNo: innings.inningsNo,
    overNo,
    ballInOver,
    isLegal,
    strikerId: strikerIdAtStart,
    // The persisted row mirrors the `deliveries` table, where non_striker_id
    // is NOT NULL. True last-man-standing (no partner at all) is the one
    // state where `InningsState.nonStrikerId` is legitimately null; the row
    // self-references the striker rather than widening the DB column for
    // this one novelty format.
    nonStrikerId: nonStrikerIdAtStart ?? strikerIdAtStart,
    bowlerId: bowlerIdAtStart,
    runsBatter: batterRuns,
    runsExtras: extraRunsTotal,
    extraType: input.extraType,
    runsTotal: totalRuns,
    isWicket: input.wicket !== null,
    wicketType: input.wicket?.type ?? null,
    dismissedPlayerId: input.wicket?.dismissedPlayerId ?? null,
    fielderId: input.wicket?.fielderId ?? null,
    assistFielderId: input.wicket?.assistFielderId ?? null,
    crossedBeforeDismissal: input.wicket?.crossedBeforeDismissal ?? null,
    isFreeHit: wasFreeHit,
    createsFreeHit: nextIsFreeHit,
    isBoundaryFour,
    isBoundarySix,
    commentary: '',
    clientDeliveryId: input.clientDeliveryId,
  };
  delivery.commentary = input.commentaryOverride ?? generateCommentary(delivery, milestone);

  return { ok: true, state: next, delivery, events };
}

/** Fills whichever end is vacant after a wicket. Not itself a delivery. */
export function setNewBatter(state: MatchState, playerId: PlayerId): MatchState {
  const next = structuredClone(state);
  const innings = next.innings[next.currentInningsIndex];
  if (!innings) throw new Error('INVARIANT: no current innings');

  if (innings.strikerId === null) innings.strikerId = playerId;
  else if (innings.nonStrikerId === null) innings.nonStrikerId = playerId;
  else throw new Error('INVARIANT: no vacant end for a new batter');

  innings.yetToBat = innings.yetToBat.filter((id) => id !== playerId);
  innings.batters[playerId] = {
    playerId,
    position: Object.keys(innings.batters).length + 1,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    status: 'not_out',
    dismissal: null,
  };

  return next;
}

/** Sets the bowler for the next over. Not itself a delivery. */
export function setBowler(state: MatchState, playerId: PlayerId): MatchState {
  const next = structuredClone(state);
  const innings = next.innings[next.currentInningsIndex];
  if (!innings) throw new Error('INVARIANT: no current innings');
  if (playerId === innings.previousBowlerId) {
    throw new Error('INVARIANT: bowler cannot bowl consecutive overs');
  }

  innings.bowlerId = playerId;
  innings.bowlers[playerId] ??= {
    playerId,
    legalBalls: 0,
    runsConceded: 0,
    wickets: 0,
    wides: 0,
    noBalls: 0,
    dots: 0,
    maidens: 0,
  };

  return next;
}
