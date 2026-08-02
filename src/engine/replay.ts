/**
 * Replay. docs/04-RULES-ENGINE.md § 10.
 *
 * Undo is a soft delete plus a replay from ball 1 — never a reverse-a-delivery
 * routine, because reversal logic is where scoring apps get subtly wrong. A
 * 20-over innings is ~130 rows, so this is cheap.
 *
 * Each delivery records who was on strike, at the other end, and bowling, so
 * the crease and the bowler are restored from the log itself rather than
 * needing a separate stream of "new batter" / "new bowler" events.
 */

import { applyDelivery, type ApplyOptions } from './applyDelivery';
import { createBatter, createBowler, cloneMatch } from './state';
import type {
  Delivery,
  DeliveryInput,
  EngineErrorCode,
  MatchConfig,
  MatchState,
  PlayerId,
} from './types';

/** Rebuilds the input that produced a stored delivery. */
export function toDeliveryInput(delivery: Delivery, config: MatchConfig): DeliveryInput {
  const autoExtra =
    delivery.extraType === 'wide'
      ? config.wideRuns
      : delivery.extraType === 'no_ball'
        ? config.noBallRuns
        : 0;

  let extraRuns = 0;
  let penaltyRuns: number | undefined;
  switch (delivery.extraType) {
    case 'wide':
    case 'no_ball':
      extraRuns = Math.max(0, delivery.runsExtras - autoExtra);
      break;
    case 'bye':
    case 'leg_bye':
      extraRuns = delivery.runsExtras;
      break;
    case 'penalty':
      penaltyRuns = delivery.runsExtras;
      break;
    case null:
      break;
  }

  const input: DeliveryInput = {
    clientDeliveryId: delivery.clientDeliveryId,
    runsOffBat: delivery.runsBatter,
    extraType: delivery.extraType,
    extraRuns,
    isBoundary: delivery.isBoundaryFour || delivery.isBoundarySix,
    wicket:
      delivery.isWicket && delivery.wicketType !== null && delivery.dismissedPlayerId !== null
        ? {
            type: delivery.wicketType,
            dismissedPlayerId: delivery.dismissedPlayerId,
            ...(delivery.fielderId !== null ? { fielderId: delivery.fielderId } : {}),
            ...(delivery.assistFielderId !== null
              ? { assistFielderId: delivery.assistFielderId }
              : {}),
            ...(delivery.crossedBeforeDismissal !== null
              ? { crossedBeforeDismissal: delivery.crossedBeforeDismissal }
              : {}),
          }
        : null,
    ...(penaltyRuns !== undefined ? { penaltyRuns } : {}),
    ...(delivery.shotX !== null && delivery.shotY !== null
      ? { shot: { x: delivery.shotX, y: delivery.shotY } }
      : {}),
    ...(delivery.pitchX !== null && delivery.pitchY !== null
      ? { pitch: { x: delivery.pitchX, y: delivery.pitchY } }
      : {}),
  };
  return input;
}

export type ReplayResult =
  | { ok: true; state: MatchState; applied: number }
  | { ok: false; error: EngineErrorCode; message: string; failedAtSeq: number };

/**
 * Folds a delivery log into a match state.
 *
 * `initial` must be the match as it stood before ball 1 — innings created,
 * openers and the first bowler set. Deleted rows are skipped; the rest are
 * applied in `seq` order.
 */
export function replay(
  initial: MatchState,
  deliveries: readonly Delivery[],
  options: ApplyOptions = {}
): ReplayResult {
  let state = cloneMatch(initial);

  const log = deliveries
    .filter((d) => !d.isDeleted)
    .slice()
    .sort((a, b) => a.seq - b.seq);

  let applied = 0;
  for (const delivery of log) {
    state = advanceToInnings(state, delivery.inningsNo);
    state = restoreCrease(state, delivery);

    const result = applyDelivery(state, toDeliveryInput(delivery, state.config), {
      ...options,
      seq: delivery.seq,
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        message: result.message,
        failedAtSeq: delivery.seq,
      };
    }
    state = result.state;
    applied += 1;
  }

  return { ok: true, state, applied };
}

/** Moves `currentInningsIndex` to the innings this delivery belongs to. */
function advanceToInnings(state: MatchState, inningsNo: number): MatchState {
  const index = state.innings.findIndex((i) => i.inningsNo === inningsNo);
  if (index === -1 || index === state.currentInningsIndex) return state;
  const next = cloneMatch(state);
  next.currentInningsIndex = index;
  return next;
}

/**
 * Puts the recorded striker, non-striker and bowler back in place before the
 * ball is applied. This is what lets the log alone reconstruct the innings —
 * batters arriving and bowlers changing are implied by the next ball's record.
 */
function restoreCrease(state: MatchState, delivery: Delivery): MatchState {
  const innings = state.innings[state.currentInningsIndex];
  if (!innings) return state;

  const needsChange =
    innings.strikerId !== delivery.strikerId ||
    innings.nonStrikerId !== delivery.nonStrikerId ||
    innings.bowlerId !== delivery.bowlerId;
  if (!needsChange) return state;

  const next = cloneMatch(state);
  // Unreachable: the same index was checked above and cloneMatch preserves the
  // innings array. `noUncheckedIndexedAccess` still requires the narrowing.
  /* v8 ignore next 2 */
  const target = next.innings[next.currentInningsIndex];
  if (!target) return state;

  ensureBatter(target.batters, delivery.strikerId, () => Object.keys(target.batters).length + 1);
  ensureBatter(target.batters, delivery.nonStrikerId, () => Object.keys(target.batters).length + 1);
  if (!target.bowlers[delivery.bowlerId]) {
    target.bowlers[delivery.bowlerId] = createBowler(delivery.bowlerId);
  }

  target.strikerId = delivery.strikerId;
  target.nonStrikerId = delivery.nonStrikerId;
  target.bowlerId = delivery.bowlerId;
  target.yetToBat = target.yetToBat.filter(
    (id) => id !== delivery.strikerId && id !== delivery.nonStrikerId
  );

  return next;
}

function ensureBatter(
  batters: Record<PlayerId, ReturnType<typeof createBatter>>,
  id: PlayerId,
  nextPosition: () => number
): void {
  if (!batters[id]) batters[id] = createBatter(id, nextPosition());
}

/**
 * Soft-deletes the most recent live delivery. docs/04 § 10 — the log is
 * append-only, so undo marks rather than removes, and the caller then replays.
 */
export function undoLastDelivery(deliveries: readonly Delivery[]): Delivery[] {
  const log = deliveries.map((d) => ({ ...d }));
  let lastIndex = -1;
  let lastSeq = -Infinity;
  log.forEach((d, i) => {
    if (!d.isDeleted && d.seq > lastSeq) {
      lastSeq = d.seq;
      lastIndex = i;
    }
  });
  const target = lastIndex >= 0 ? log[lastIndex] : undefined;
  if (target) target.isDeleted = true;
  return log;
}
