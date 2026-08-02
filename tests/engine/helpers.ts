import { setBowler, setNewBatter } from '../../src/engine/applyDelivery';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { createInitialMatchState } from '../../src/engine/replay';
import type { DeliveryInput, InningsState, MatchConfig, MatchState } from '../../src/engine/types';

let idCounter = 0;

/** Deterministic delivery input builder — no `crypto.randomUUID`, so tests stay reproducible. */
export function ball(overrides: Partial<DeliveryInput> = {}): DeliveryInput {
  idCounter += 1;
  return {
    clientDeliveryId: `cid-${idCounter}`,
    runsOffBat: 0,
    extraType: null,
    extraRuns: 0,
    isBoundary: false,
    wicket: null,
    ...overrides,
  };
}

export function emptyInnings(overrides: Partial<InningsState> = {}): InningsState {
  return {
    inningsNo: 1,
    battingTeamId: 'teamA',
    bowlingTeamId: 'teamB',
    isSuperOver: false,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
    strikerId: null,
    nonStrikerId: null,
    bowlerId: null,
    previousBowlerId: null,
    isFreeHit: false,
    target: null,
    revisedTarget: null,
    revisedOvers: null,
    batters: {},
    bowlers: {},
    fallOfWickets: [],
    yetToBat: [],
    status: 'in_progress',
    endReason: null,
    currentOver: { bowlerIds: [], runs: 0 },
    ...overrides,
  };
}

/**
 * A ready-to-score match: innings 1 in progress, `s1`/`ns1` at the crease,
 * `bowler1` bowling, `s2..s7` waiting to bat.
 */
export function createTestMatch(
  configOverrides: Partial<MatchConfig> = {},
  inningsOverrides: Partial<InningsState> = {}
): MatchState {
  const config: MatchConfig = { ...DEFAULT_CONFIG, ...configOverrides };
  let state = createInitialMatchState('test-match', config);
  state = {
    ...state,
    innings: [
      emptyInnings({
        yetToBat: ['s2', 's3', 's4', 's5', 's6', 's7'],
        ...inningsOverrides,
      }),
    ],
    currentInningsIndex: 0,
  };
  state = setNewBatter(state, 's1');
  state = setNewBatter(state, 'ns1');
  state = setBowler(state, 'bowler1');
  return state;
}

export function currentInnings(state: MatchState): InningsState {
  const innings = state.innings[state.currentInningsIndex];
  if (!innings) throw new Error('test helper: no current innings');
  return innings;
}
