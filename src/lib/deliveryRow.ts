import { reportError } from '@/lib/monitoring';
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
  // A row that says `is_wicket` but carries no `wicket_type` is not a real
  // state — every dismissal has a type. It is exactly what the Phase 8
  // JSON-null bug produced (`p->'wicket'` on `{"wicket": null}` is
  // `'null'::jsonb`, which is not SQL NULL, so *every* ball stored as a
  // wicket), and migration 20260803191000 both fixed the function and
  // repaired the rows — under the reading that such a row means "not
  // actually a wicket".
  //
  // The client made the opposite assumption and asserted the type was
  // there: `replay`'s `wicketType!` fed `undefined` into the legality table
  // and threw `Cannot read properties of undefined (reading 'normal')` —
  // which blanked the audience view and the scorer pad alike, with no clue
  // as to why. So this applies the migration's own reading rather than
  // trusting a `!`, and reports it, because a database still producing this
  // is a bug that has to surface somewhere.
  const contradictory = row.is_wicket && row.wicket_type === null;
  if (contradictory) {
    reportError(new Error('DELIVERY_WICKET_WITHOUT_TYPE'), {
      deliveryId: row.id,
      inningsId: row.innings_id,
      over: row.over_no,
      ball: row.ball_in_over,
      dismissedPlayerId: row.dismissed_player_id,
    });
  }

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
    isWicket: contradictory ? false : row.is_wicket,
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
