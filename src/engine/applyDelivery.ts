/**
 * `applyDelivery` — the 13-step algorithm from docs/04-RULES-ENGINE.md § 4.
 *
 * The steps are numbered in the code because their ORDER is the specification.
 * Free-hit resolution must happen before the wicket is applied; strike
 * rotation before the end-of-over swap. Reordering them silently changes what
 * the app scores.
 *
 * Pure: clones the state, never mutates the caller's.
 */

import { generateCommentary, maidenText, milestoneText, type NameLookup } from './commentary';
import { maxBallsPerBowler } from './config';
import { countsAsWicket, isBowlerCredited, isWicketAllowed } from './dismissals';
import { checkInningsEnd } from './inningsEnd';
import { computeResult } from './result';
import { cloneMatch, createBatter, createBowler } from './state';
import { resolveStrikeSwap, type StrikeInput } from './strike';
import type {
  Delivery,
  DeliveryInput,
  EngineErrorCode,
  EngineEvent,
  EngineResult,
  InningsState,
  MatchConfig,
  MatchState,
  PlayerId,
} from './types';

const MILESTONES = [50, 100, 150, 200] as const;

function fail(error: EngineErrorCode, message: string): EngineResult {
  return { ok: false, error, message };
}

export type ApplyOptions = {
  /** Player names for commentary. The engine performs no lookups of its own. */
  names?: NameLookup;
  /** Overrides the provisional seq. The server is authoritative in production. */
  seq?: number;
};

export function applyDelivery(
  state: MatchState,
  input: DeliveryInput,
  options: ApplyOptions = {}
): EngineResult {
  const inningsIndex = state.currentInningsIndex;
  const currentInnings = state.innings[inningsIndex];
  if (!currentInnings) {
    return fail('INVALID_INPUT', 'No innings in progress.');
  }
  const config = state.config;

  /* ── 1. VALIDATE ─────────────────────────────────────────── */

  if (currentInnings.status !== 'in_progress') {
    return fail('INNINGS_COMPLETE', 'This innings has already ended.');
  }
  if (currentInnings.strikerId === null) {
    return fail('NO_STRIKER', 'No striker is set — a new batter must come in first.');
  }
  if (currentInnings.nonStrikerId === null && !config.lastManStanding) {
    return fail('NO_STRIKER', 'No non-striker is set — a new batter must come in first.');
  }
  if (currentInnings.bowlerId === null) {
    return fail('NO_BOWLER', 'No bowler is set for this over.');
  }
  if (
    currentInnings.strikerId === currentInnings.nonStrikerId ||
    currentInnings.strikerId === currentInnings.bowlerId ||
    currentInnings.nonStrikerId === currentInnings.bowlerId
  ) {
    return fail('SAME_PLAYER', 'Striker, non-striker and bowler must be three different players.');
  }
  if (
    currentInnings.previousBowlerId !== null &&
    currentInnings.previousBowlerId === currentInnings.bowlerId
  ) {
    return fail('CONSECUTIVE_OVER', 'A bowler cannot bowl two overs in a row.');
  }
  if (input.runsOffBat < 0 || input.extraRuns < 0) {
    return fail('INVALID_INPUT', 'Runs cannot be negative.');
  }

  const existingBowler = currentInnings.bowlers[currentInnings.bowlerId];
  if (existingBowler && existingBowler.legalBalls >= maxBallsPerBowler(config)) {
    return fail('BOWLER_LIMIT', 'This bowler has reached the per-bowler limit.');
  }

  const wasFreeHit = currentInnings.isFreeHit;

  if (input.wicket) {
    if (!isWicketAllowed(input.wicket.type, input.extraType, wasFreeHit)) {
      return fail(
        'ILLEGAL_DISMISSAL',
        wasFreeHit
          ? `${input.wicket.type} is not a legal dismissal on a free hit.`
          : `${input.wicket.type} is not a legal dismissal on this delivery.`
      );
    }
    const dismissed = input.wicket.dismissedPlayerId;
    if (dismissed !== currentInnings.strikerId && dismissed !== currentInnings.nonStrikerId) {
      return fail('UNKNOWN_PLAYER', 'The dismissed player is not at the crease.');
    }
  }

  /* Work on a clone from here — nothing above mutates. */
  const next = cloneMatch(state);
  // Unreachable: the same index was validated above and cloneMatch preserves
  // the innings array. `noUncheckedIndexedAccess` still requires the narrowing.
  /* v8 ignore next 2 */
  const innings = next.innings[inningsIndex];
  if (!innings) return fail('INVALID_INPUT', 'No innings in progress.');

  const strikerId = innings.strikerId as PlayerId;
  const bowlerId = innings.bowlerId as PlayerId;
  const nonStrikerIdAtBall = innings.nonStrikerId;
  const events: EngineEvent[] = [];

  /* ── 2. CLASSIFY LEGALITY ────────────────────────────────── */

  // Per § 4 step 2 exactly. NOTE: this makes a standalone `penalty` count as a
  // legal ball and tick the over along, which is not how penalty runs work in
  // the Laws. Implemented as written rather than silently corrected — flagged
  // in the Phase 1 report as a doc fix.
  const isLegal = input.extraType !== 'wide' && input.extraType !== 'no_ball';

  /* ── 3. COMPUTE RUNS ─────────────────────────────────────── */

  const autoExtra =
    input.extraType === 'wide'
      ? config.wideRuns
      : input.extraType === 'no_ball'
        ? config.noBallRuns
        : 0;

  let batterRuns = 0;
  let extraRuns = 0;
  switch (input.extraType) {
    case null:
      batterRuns = input.runsOffBat;
      extraRuns = 0;
      break;
    case 'wide':
      batterRuns = 0;
      extraRuns = autoExtra + input.extraRuns;
      break;
    case 'no_ball':
      batterRuns = input.runsOffBat;
      extraRuns = autoExtra + input.extraRuns;
      break;
    case 'bye':
    case 'leg_bye':
      batterRuns = 0;
      extraRuns = input.extraRuns;
      break;
    case 'penalty':
      batterRuns = 0;
      extraRuns = input.penaltyRuns ?? 0;
      break;
  }
  const totalRuns = batterRuns + extraRuns;

  const isBoundaryFour = input.isBoundary && batterRuns === 4;
  const isBoundarySix = input.isBoundary && batterRuns === 6;

  /* ── 4. APPLY TO INNINGS TOTAL ───────────────────────────── */

  innings.runs += totalRuns;
  switch (input.extraType) {
    case 'wide':
      innings.extras.wides += extraRuns;
      break;
    case 'no_ball':
      innings.extras.noBalls += extraRuns;
      break;
    case 'bye':
      innings.extras.byes += extraRuns;
      break;
    case 'leg_bye':
      innings.extras.legByes += extraRuns;
      break;
    case 'penalty':
      innings.extras.penalty += extraRuns;
      break;
    case null:
      break;
  }

  /* ── 5. APPLY TO BATTER ──────────────────────────────────── */

  let batter = innings.batters[strikerId];
  if (!batter) {
    batter = createBatter(strikerId, Object.keys(innings.batters).length + 1);
    innings.batters[strikerId] = batter;
  }
  const runsBefore = batter.runs;

  // A wide is not a ball faced. A bye or leg-bye is — the ball was bowled and
  // the batter had a chance at it.
  if (input.extraType !== 'wide') batter.balls += 1;
  batter.runs += batterRuns;
  if (isBoundaryFour) batter.fours += 1;
  if (isBoundarySix) batter.sixes += 1;
  if (input.extraType !== 'wide' && batterRuns === 0) batter.dots += 1;

  /* ── 6. APPLY TO BOWLER ──────────────────────────────────── */

  let bowler = innings.bowlers[bowlerId];
  if (!bowler) {
    bowler = createBowler(bowlerId);
    innings.bowlers[bowlerId] = bowler;
  }

  if (isLegal) bowler.legalBalls += 1;
  // Byes and leg-byes are not the bowler's fault, so they are not charged.
  const chargedToBowler =
    input.extraType === 'bye' || input.extraType === 'leg_bye' ? 0 : totalRuns;
  bowler.runsConceded += chargedToBowler;
  if (input.extraType === 'wide') bowler.wides += 1;
  if (input.extraType === 'no_ball') bowler.noBalls += 1;
  if (totalRuns === 0 && isLegal) bowler.dots += 1;

  // Over-in-progress tracking, so a mid-over bowler change cannot be credited
  // a maiden it did not bowl. docs/04 § 8.
  innings.currentOver.runsConceded += chargedToBowler;
  if (isLegal) {
    innings.currentOver.ballsByBowler[bowlerId] =
      (innings.currentOver.ballsByBowler[bowlerId] ?? 0) + 1;
  }

  /* ── 7. FREE HIT RESOLUTION (before this ball's wicket) ──── */

  let nextIsFreeHit: boolean;
  if (input.extraType === 'no_ball' && config.freeHitAfterNoBall) {
    nextIsFreeHit = true;
  } else if (input.extraType === 'wide') {
    // A wide does not consume a free hit.
    nextIsFreeHit = wasFreeHit;
  } else {
    nextIsFreeHit = false;
  }

  /* ── 8. APPLY WICKET ─────────────────────────────────────── */

  let dismissedPlayerId: PlayerId | null = null;
  if (input.wicket) {
    const w = input.wicket;
    dismissedPlayerId = w.dismissedPlayerId;

    let victim = innings.batters[dismissedPlayerId];
    if (!victim) {
      victim = createBatter(dismissedPlayerId, Object.keys(innings.batters).length + 1);
      innings.batters[dismissedPlayerId] = victim;
    }

    if (countsAsWicket(w.type)) {
      innings.wickets += 1;
      victim.status = w.type === 'retired_out' ? 'retired_out' : 'out';
      innings.fallOfWickets.push({
        wicketNumber: innings.wickets,
        batterId: dismissedPlayerId,
        runs: innings.runs,
        legalBalls: innings.legalBalls + (isLegal ? 1 : 0),
      });
    } else {
      // retired_hurt is not a wicket; they may come back later.
      victim.status = 'retired_hurt';
      if (config.retiredHurtCanReturn) innings.yetToBat.push(dismissedPlayerId);
    }

    victim.dismissal = {
      type: w.type,
      bowlerId: isBowlerCredited(w.type) ? bowlerId : null,
      fielderId: w.fielderId ?? null,
      assistFielderId: w.assistFielderId ?? null,
      atRuns: innings.runs,
      atLegalBalls: innings.legalBalls + (isLegal ? 1 : 0),
    };

    if (isBowlerCredited(w.type)) bowler.wickets += 1;

    events.push({ type: 'WICKET', batterId: dismissedPlayerId, wicketType: w.type });
  }

  /* Legal-ball counter increments here, after the FOW snapshot above has
     recorded the ball this wicket fell on. */
  if (isLegal) innings.legalBalls += 1;

  /* ── 9. STRIKE ROTATION ──────────────────────────────────── */

  const strikeInput: StrikeInput = {
    extraType: input.extraType,
    runsBatter: batterRuns,
    runsExtras: extraRuns,
    isBoundaryFour,
    isBoundarySix,
    wicketType: input.wicket?.type ?? null,
    crossedBeforeDismissal: input.wicket?.crossedBeforeDismissal ?? null,
  };

  // Last-man-standing: a lone batter keeps the strike regardless of parity.
  const loneBatterAtBall = config.lastManStanding && innings.nonStrikerId === null;
  if (!loneBatterAtBall && resolveStrikeSwap(strikeInput, config)) {
    const s = innings.strikerId;
    innings.strikerId = innings.nonStrikerId;
    innings.nonStrikerId = s;
  }

  // Remove the dismissed batter by id — after the ends have settled, so the
  // survivor keeps the end they actually finished at.
  if (dismissedPlayerId !== null) {
    if (innings.strikerId === dismissedPlayerId) innings.strikerId = null;
    else if (innings.nonStrikerId === dismissedPlayerId) innings.nonStrikerId = null;
  }

  // Last-man-standing: once nobody is left to partner them, the survivor bats
  // on alone — and must be the one on strike, whichever end they were
  // stranded at. Without this they sit at the non-striker's end with an empty
  // slot opposite and the innings cannot continue.
  if (
    config.lastManStanding &&
    innings.yetToBat.length === 0 &&
    innings.strikerId === null &&
    innings.nonStrikerId !== null
  ) {
    innings.strikerId = innings.nonStrikerId;
    innings.nonStrikerId = null;
  }

  const loneBatter = config.lastManStanding && innings.nonStrikerId === null;

  /* ── 10. OVER COMPLETION ─────────────────────────────────── */

  const overNo = Math.floor((innings.legalBalls - (isLegal ? 1 : 0)) / config.ballsPerOver);
  const overComplete = isLegal && innings.legalBalls % config.ballsPerOver === 0;

  if (overComplete) {
    // The `?? 0` is unreachable — step 6 always increments this bowler's count
    // on a legal ball, and only a legal ball can complete an over.
    /* v8 ignore next */
    const ballsThisOver = innings.currentOver.ballsByBowler[bowlerId] ?? 0;
    if (innings.currentOver.runsConceded === 0 && ballsThisOver === config.ballsPerOver) {
      bowler.maidens += 1;
      events.push({ type: 'MAIDEN', overNo, bowlerId });
    }

    if (!loneBatter) {
      const s = innings.strikerId;
      innings.strikerId = innings.nonStrikerId;
      innings.nonStrikerId = s;
    }

    innings.previousBowlerId = bowlerId;
    innings.bowlerId = null;
    innings.currentOver = { runsConceded: 0, ballsByBowler: {} };

    events.push({ type: 'OVER_COMPLETE', overNo, bowlerId });
  }

  innings.isFreeHit = nextIsFreeHit;

  /* ── Boundary and milestone events ───────────────────────── */

  if (isBoundaryFour) events.push({ type: 'BOUNDARY_FOUR', batterId: strikerId });
  if (isBoundarySix) events.push({ type: 'BOUNDARY_SIX', batterId: strikerId });

  let milestoneHit: (typeof MILESTONES)[number] | null = null;
  for (const m of MILESTONES) {
    if (runsBefore < m && batter.runs >= m) {
      milestoneHit = m;
      events.push({ type: 'MILESTONE', batterId: strikerId, runs: m });
    }
  }

  /* ── 12. INNINGS / MATCH END ─────────────────────────────── */

  const endReason = checkInningsEnd(innings, config);
  if (endReason !== null) {
    innings.status = 'completed';
    innings.endReason = endReason;
    innings.isFreeHit = false;
    events.push({ type: 'INNINGS_COMPLETE', inningsNo: innings.inningsNo, reason: endReason });

    // The chase is the second innings of a pair — (0,1), (2,3) for super overs.
    const isChase = inningsIndex % 2 === 1;
    const first = next.innings[inningsIndex - 1];
    if (isChase && first) {
      const result = computeResult(first, innings, config, innings.isSuperOver);
      next.result = result;
      next.status = 'completed';
      events.push({ type: 'MATCH_COMPLETE', result });
    }
  } else {
    /* ── 11. NEW BATTER / BOWLER REQUIRED ──────────────────── */
    if (innings.strikerId === null || innings.nonStrikerId === null) {
      const needsPartner = !(config.lastManStanding && innings.strikerId !== null);
      if (needsPartner) events.push({ type: 'NEW_BATTER_REQUIRED' });
    }
    if (innings.bowlerId === null) {
      events.push({ type: 'NEW_BOWLER_REQUIRED' });
    }
  }

  /* ── 13. COMMENTARY + RETURN ─────────────────────────────── */

  const ballInOver = ballInOverFor(innings, config, isLegal, overComplete);

  const delivery: Delivery = {
    clientDeliveryId: input.clientDeliveryId,
    seq: options.seq ?? nextSeq(innings),
    inningsNo: innings.inningsNo,
    overNo,
    ballInOver,
    isLegal,
    strikerId,
    nonStrikerId: nonStrikerIdAtBall ?? strikerId,
    bowlerId,
    runsBatter: batterRuns,
    runsExtras: extraRuns,
    extraType: input.extraType,
    runsTotal: totalRuns,
    isWicket: input.wicket !== null,
    wicketType: input.wicket?.type ?? null,
    dismissedPlayerId,
    fielderId: input.wicket?.fielderId ?? null,
    assistFielderId: input.wicket?.assistFielderId ?? null,
    crossedBeforeDismissal: input.wicket?.crossedBeforeDismissal ?? null,
    isFreeHit: wasFreeHit,
    createsFreeHit: nextIsFreeHit,
    isBoundaryFour,
    isBoundarySix,
    shotX: input.shot?.x ?? null,
    shotY: input.shot?.y ?? null,
    pitchX: input.pitch?.x ?? null,
    pitchY: input.pitch?.y ?? null,
    commentary: '',
    isDeleted: false,
  };

  let commentary =
    input.commentaryOverride ??
    generateCommentary(delivery, options.names ?? {}, {
      batterRuns: batter.runs,
      batterBalls: batter.balls,
    });

  if (input.commentaryOverride === undefined) {
    const strikerName = options.names?.[strikerId] ?? strikerId;
    if (milestoneHit !== null) commentary += ` ${milestoneText(milestoneHit, strikerName)}`;
    if (events.some((e) => e.type === 'MAIDEN')) commentary += ` ${maidenText()}`;
  }
  delivery.commentary = commentary;

  return { ok: true, state: next, delivery, events };
}

/**
 * Ball number within the over. Illegal deliveries repeat the number of the
 * ball they replace, per docs/02 § `deliveries`.
 */
function ballInOverFor(
  innings: InningsState,
  config: MatchConfig,
  isLegal: boolean,
  overComplete: boolean
): number {
  if (overComplete) return config.ballsPerOver;
  const withinOver = innings.legalBalls % config.ballsPerOver;
  return isLegal ? withinOver : withinOver + 1;
}

/** Provisional sequence number. The server reassigns authoritatively. */
function nextSeq(innings: InningsState): number {
  return innings.legalBalls + innings.extras.wides + innings.extras.noBalls;
}
