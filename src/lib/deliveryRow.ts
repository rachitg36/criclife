import type { Delivery } from '@/engine/types';
import type { Database } from '@/types/database';

export type DeliveryRow = Database['public']['Tables']['deliveries']['Row'];

/**
 * Maps one persisted `deliveries` row onto the engine's `Delivery`.
 *
 * Shared rather than duplicated on purpose: the scorer store and the audience
 * store both replay the same log through the same engine, so if these two
 * mappings ever disagreed by a single field the two views would quietly show
 * different scores for the same match — the exact class of bug the append-only
 * log exists to prevent.
 *
 * `inningsNo` is left at 0 for the caller to fill in: the row carries an
 * `innings_id`, and only the caller knows which innings number that is.
 */
export function toEngineDelivery(row: DeliveryRow): Delivery {
  return {
    inningsNo: 0,
    overNo: row.over_no,
    ballInOver: row.ball_in_over,
    isLegal: row.is_legal,
    strikerId: row.striker_id,
    nonStrikerId: row.non_striker_id,
    bowlerId: row.bowler_id,
    runsBatter: row.runs_batter,
    runsExtras: row.runs_extras,
    extraType: row.extra_type,
    runsTotal: row.runs_total ?? row.runs_batter + row.runs_extras,
    isWicket: row.is_wicket,
    wicketType: row.wicket_type,
    dismissedPlayerId: row.dismissed_player_id,
    fielderId: row.fielder_id,
    assistFielderId: row.assist_fielder_id,
    crossedBeforeDismissal: row.crossed_before_dismissal,
    isFreeHit: row.is_free_hit,
    createsFreeHit: row.creates_free_hit,
    isBoundaryFour: row.is_boundary_four,
    isBoundarySix: row.is_boundary_six,
    commentary: row.commentary ?? '',
    clientDeliveryId: row.client_delivery_id,
  };
}
