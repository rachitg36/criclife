import type { AudienceDelivery } from '../../../src/features/audience/types';

let seq = 0;

/**
 * A persisted-looking delivery for the audience's own derivations. Not the
 * engine's `ball()` helper: these modules consume the *log*, not delivery
 * inputs, so what they need is the row shape that comes back off the wire.
 */
export function logged(overrides: Partial<AudienceDelivery> = {}): AudienceDelivery {
  seq += 1;
  const base: AudienceDelivery = {
    inningsNo: 1,
    overNo: 0,
    ballInOver: 1,
    isLegal: true,
    strikerId: 's1',
    nonStrikerId: 'ns1',
    bowlerId: 'b1',
    runsBatter: 0,
    runsExtras: 0,
    extraType: null,
    runsTotal: 0,
    isWicket: false,
    wicketType: null,
    dismissedPlayerId: null,
    fielderId: null,
    assistFielderId: null,
    crossedBeforeDismissal: null,
    isFreeHit: false,
    createsFreeHit: false,
    isBoundaryFour: false,
    isBoundarySix: false,
    commentary: '',
    clientDeliveryId: `cid-${seq}`,
    id: `row-${seq}`,
    seq,
    shot: null,
    pitch: null,
  };
  const merged = { ...base, ...overrides };
  // Keep `runsTotal` consistent unless a test sets it deliberately.
  if (overrides.runsTotal === undefined) {
    merged.runsTotal = merged.runsBatter + merged.runsExtras;
  }
  return merged;
}

/** `count` legal dot balls in one over, for filling out an over cheaply. */
export function overOf(
  count: number,
  overNo: number,
  overrides: Partial<AudienceDelivery> = {}
): AudienceDelivery[] {
  return Array.from({ length: count }, (_, i) =>
    logged({ overNo, ballInOver: i + 1, ...overrides })
  );
}
