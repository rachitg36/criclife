import { CREDIT_TABLE } from '@/engine';
import type {
  Delivery,
  EngineEvent,
  InningsState,
  MatchConfig,
  MatchState,
  PlayerId,
  TeamId,
} from '@/engine/types';

/**
 * docs/06-AUDIENCE-VIEW.md § 4 — "Moments", the reactions that make people
 * keep the tab open. Pure detection only: this module decides *what* happened
 * and for how long it should hold the screen; nothing here animates, times,
 * or touches the DOM. The overlay component owns all of that.
 *
 * Every moment carries a stable `key` derived from the ball that caused it, so
 * a re-render, a refetch, or the same row arriving twice over Realtime can
 * never re-fire a celebration that has already played.
 */

export type MomentKind =
  | 'four'
  | 'six'
  | 'wicket'
  | 'fifty'
  | 'hundred'
  | 'maiden'
  | 'hat_trick_ball'
  | 'last_over'
  | 'match_won';

export type Moment = {
  kind: MomentKind;
  key: string;
  /** Hold time from docs/06 § 4's table. Calm mode collapses these to a fade. */
  durationMs: number;
  headline: string;
  detail: string | null;
  playerId: PlayerId | null;
  teamId: TeamId | null;
};

const DURATIONS: Record<MomentKind, number> = {
  four: 350,
  six: 900,
  wicket: 1200,
  fifty: 1600,
  hundred: 2200,
  maiden: 1200,
  hat_trick_ball: 2000,
  last_over: 1600,
  match_won: 4000,
};

function moment(
  kind: MomentKind,
  key: string,
  headline: string,
  detail: string | null,
  playerId: PlayerId | null = null,
  teamId: TeamId | null = null
): Moment {
  return {
    kind,
    key: `${kind}:${key}`,
    durationMs: DURATIONS[kind],
    headline,
    detail,
    playerId,
    teamId,
  };
}

export type MomentContext = {
  delivery: Delivery;
  events: EngineEvent[];
  /** State *before* this ball — needed for transitions like entering the last over. */
  before: MatchState;
  /** State after applying it. */
  after: MatchState;
  config: MatchConfig;
};

/**
 * A retired-hurt "wicket" is a substitution, not a dismissal — celebrating it
 * with a screen shake and a red vignette would be actively wrong. That is
 * exactly the distinction `CREDIT_TABLE.countsAsWicket` already draws, so it
 * is read rather than restated.
 */
function isCelebratableWicket(d: Delivery): boolean {
  return d.isWicket && d.wicketType !== null && CREDIT_TABLE[d.wicketType].countsAsWicket;
}

function isLastOver(innings: InningsState | undefined, config: MatchConfig): boolean {
  if (!innings || innings.status !== 'in_progress') return false;
  const totalBalls = (innings.revisedOvers ?? config.oversPerInnings) * config.ballsPerOver;
  const remaining = totalBalls - innings.legalBalls;
  return remaining > 0 && remaining <= config.ballsPerOver;
}

export function detectMoments(ctx: MomentContext): Moment[] {
  const { delivery: d, events, before, after, config } = ctx;
  const out: Moment[] = [];
  const ballKey = d.clientDeliveryId;
  const battingTeamId = after.innings[after.currentInningsIndex]?.battingTeamId ?? null;

  if (d.isBoundarySix) {
    out.push(moment('six', ballKey, 'SIX', null, d.strikerId, battingTeamId));
  } else if (d.isBoundaryFour) {
    out.push(moment('four', ballKey, 'FOUR', null, d.strikerId, battingTeamId));
  }

  if (isCelebratableWicket(d)) {
    out.push(
      moment(
        'wicket',
        ballKey,
        'WICKET',
        null,
        d.dismissedPlayerId,
        after.innings[after.currentInningsIndex]?.bowlingTeamId ?? null
      )
    );
  }

  for (const e of events) {
    if (e.type === 'MILESTONE') {
      out.push(
        moment(
          e.milestone,
          `${ballKey}:${e.playerId}`,
          e.milestone === 'fifty' ? 'FIFTY' : 'HUNDRED',
          null,
          e.playerId,
          battingTeamId
        )
      );
    }
    if (e.type === 'OVER_COMPLETE' && e.maiden) {
      out.push(moment('maiden', `${ballKey}`, 'MAIDEN', `Over ${e.overNo}`, e.bowlerId, null));
    }
    if (e.type === 'MATCH_COMPLETE') {
      out.push(
        moment('match_won', ballKey, 'MATCH WON', e.result.text, null, e.result.winnerTeamId)
      );
    }
  }

  // A transition, not a per-ball fact: only fires on the ball that takes the
  // innings into its final over, never on every ball of that over.
  if (
    !isLastOver(before.innings[before.currentInningsIndex], config) &&
    isLastOver(after.innings[after.currentInningsIndex], config)
  ) {
    out.push(moment('last_over', ballKey, 'FINAL OVER', null, null, battingTeamId));
  }

  return out;
}

/**
 * The one *anticipatory* moment (docs/06 § 4): the ribbon appears **before**
 * the delivery, so this is a question about the log so far, not about a ball
 * that has been bowled.
 *
 * A hat-trick ball is on when this bowler's own last two deliveries each
 * dismissed a batter *and were credited to them* — `CREDIT_TABLE` is the
 * engine's authority on which types those are, reused here rather than
 * restated. Balls bowled from the other end are skipped: a hat-trick spans
 * overs.
 *
 * Anything else of theirs in between breaks it, including a wide, a no-ball,
 * and a run out. That is the strict reading of "three wickets with
 * consecutive deliveries": a run out is a delivery on which the *bowler*
 * dismissed nobody, so the sequence ends there.
 *
 * A hat-trick can also span the innings break in the Laws. This stops at the
 * innings boundary, because a scoreboard that only ever renders one innings
 * at a time has nowhere honest to put that ribbon.
 */
export function isHatTrickBall(
  deliveriesThisInnings: readonly Delivery[],
  bowlerId: PlayerId | null
): boolean {
  if (!bowlerId) return false;

  let streak = 0;
  for (let i = deliveriesThisInnings.length - 1; i >= 0; i -= 1) {
    const d = deliveriesThisInnings[i]!;
    if (d.bowlerId !== bowlerId) continue;
    if (!d.isWicket || d.wicketType === null) return false;
    if (!CREDIT_TABLE[d.wicketType].bowlerCredited) return false;
    streak += 1;
    if (streak >= 2) return true;
  }
  return false;
}

/** Whether the hero should be in its high-contrast FINAL OVER state right now. */
export function inLastOver(state: MatchState, config: MatchConfig): boolean {
  return isLastOver(state.innings[state.currentInningsIndex], config);
}
