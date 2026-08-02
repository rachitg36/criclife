/**
 * The pure cricket rules engine. docs/04-RULES-ENGINE.md.
 *
 * No React, no network, no DOM, no `Date.now()`, no `Math.random()`. Time and
 * names are passed in. ESLint enforces this — see `eslint.config.js`.
 *
 * Every score in the app is a projection of the append-only `deliveries` log
 * through `applyDelivery`. If the engine is right, the app is right.
 */

export * from './types';
export * from './config';
export * from './state';
export * from './dismissals';
export * from './strike';
export * from './inningsEnd';
export * from './result';
export * from './applyDelivery';
export * from './replay';
export * from './projections';
export * from './commentary';
export {
  scorecard,
  inningsScorecard,
  howOutText,
  type Scorecard,
  type InningsScorecard,
  type BattingRow,
  type BowlingRow,
} from './scorecard';
