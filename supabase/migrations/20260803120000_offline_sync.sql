-- Phase 6 — docs/10-API-CONTRACT.md § 3.2; docs/05-SCORER-VIEW.md § 6;
-- docs/09-ARCHITECTURE.md § 5.
--
-- Adds `record_deliveries_batch`, the endpoint the offline sync worker
-- drains its Dexie queue against. Per docs/10 § 3.2: "processes in order,
-- stops at the first hard error, returns per-item results so partial
-- success is representable."
--
-- The per-ball validation/insert logic (legality, free-hit gating, bowler
-- limits, consecutive-over, the insert itself) is factored out of
-- `record_delivery` into `_insert_scored_delivery` so the batch path can't
-- silently drift from the single-ball path. `record_delivery` itself is
-- reshaped to call the same helper — its external behaviour (request shape,
-- response shape, error codes/messages) is unchanged, so Phase 5's pgTAP
-- suite (11_scoring_rpcs_phase5.sql) still exercises it unmodified.
--
-- A batch only makes sense within a single innings: `seq` is a single
-- global sequence (not per-innings — see 20260802120300_match_log.sql), so
-- the only staleness check that matters is "has anything else landed in
-- this innings since I went offline," checked ONCE against the batch's
-- `expectedSeq` before the loop starts. Individual items don't carry their
-- own `expectedSeq` — a client queued them consecutively while offline and
-- has no way to know the real server seq for anything past the first one.
-- Because the whole batch runs in one transaction, nothing else can write
-- to this innings between items, so no per-item re-check is needed either.

create or replace function public._insert_scored_delivery(
  p jsonb, v_match matches, v_innings innings
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_client_delivery_id uuid := (p->>'clientDeliveryId')::uuid;
  v_extra_type extra_type := nullif(p->>'extraType', '')::extra_type;
  v_runs_batter int := coalesce((p->>'runsOffBat')::int, 0);
  v_extra_runs int := coalesce((p->>'extraRuns')::int, 0);
  v_striker_id uuid := (p->>'strikerId')::uuid;
  v_non_striker_id uuid := (p->>'nonStrikerId')::uuid;
  v_bowler_id uuid := (p->>'bowlerId')::uuid;
  v_wicket jsonb := p->'wicket';
  v_wicket_type wicket_type := nullif(v_wicket->>'type', '')::wicket_type;
  v_balls_per_over int;
  v_max_overs_per_bowler numeric;
  v_legal_balls_before int;
  v_is_legal boolean;
  v_over_no int;
  v_ball_in_over int;
  v_prev_creates_free_hit boolean;
  v_is_free_hit boolean;
  v_creates_free_hit boolean;
  v_prev_over_bowler uuid;
  v_bowler_legal_balls int;
  v_delivery deliveries;
  v_existing deliveries;
begin
  -- Idempotency: a duplicate clientDeliveryId is a no-op success, not an error.
  select * into v_existing from deliveries where client_delivery_id = v_client_delivery_id;
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'delivery', to_jsonb(v_existing));
  end if;

  v_balls_per_over := (v_match.config->>'ballsPerOver')::int;
  v_max_overs_per_bowler := case
    when v_match.config->'maxOversPerBowler' = '"auto"'::jsonb
      then ceil((v_match.config->>'oversPerInnings')::numeric / 5)
    else (v_match.config->>'maxOversPerBowler')::numeric
  end;

  v_is_legal := v_extra_type is null or v_extra_type not in ('wide', 'no_ball');

  select count(*) into v_legal_balls_before
    from deliveries where innings_id = v_innings.id and not is_deleted and is_legal;
  v_over_no := v_legal_balls_before / v_balls_per_over;
  v_ball_in_over := (v_legal_balls_before % v_balls_per_over) + 1;

  select creates_free_hit into v_prev_creates_free_hit
    from deliveries where innings_id = v_innings.id and not is_deleted order by seq desc limit 1;
  v_is_free_hit := coalesce(v_prev_creates_free_hit, false);
  v_creates_free_hit := coalesce(v_extra_type = 'no_ball', false)
    and coalesce((v_match.config->>'freeHitAfterNoBall')::boolean, false);

  if v_is_free_hit and v_wicket_type is not null
     and v_wicket_type not in ('run_out', 'obstructing_the_field') then
    raise exception 'ILLEGAL_DISMISSAL: % is not a legal dismissal on a free hit', v_wicket_type;
  end if;

  -- Bowler checks only apply at the start of a fresh over.
  if v_legal_balls_before > 0 and v_legal_balls_before % v_balls_per_over = 0 then
    select bowler_id into v_prev_over_bowler
      from deliveries where innings_id = v_innings.id and not is_deleted and is_legal
      order by seq desc limit 1;
    if v_prev_over_bowler = v_bowler_id then
      raise exception 'CONSECUTIVE_OVER: % cannot bowl two overs running', v_bowler_id;
    end if;
  end if;

  select count(*) into v_bowler_legal_balls
    from deliveries where innings_id = v_innings.id and not is_deleted and is_legal and bowler_id = v_bowler_id;
  if (v_bowler_legal_balls / v_balls_per_over) >= v_max_overs_per_bowler then
    raise exception 'BOWLER_LIMIT: % has already bowled the maximum % overs', v_bowler_id, v_max_overs_per_bowler;
  end if;

  insert into deliveries (
    innings_id, match_id, over_no, ball_in_over, is_legal,
    striker_id, non_striker_id, bowler_id, runs_batter, runs_extras, extra_type,
    is_wicket, wicket_type, dismissed_player_id, fielder_id, assist_fielder_id,
    crossed_before_dismissal, is_free_hit, creates_free_hit,
    is_boundary_four, is_boundary_six, shot_x, shot_y, pitch_x, pitch_y,
    commentary, scored_by_profile_id, client_delivery_id
  )
  values (
    v_innings.id, v_match.id, v_over_no, v_ball_in_over, v_is_legal,
    v_striker_id, v_non_striker_id, v_bowler_id, v_runs_batter, v_extra_runs, v_extra_type,
    v_wicket is not null, v_wicket_type,
    nullif(v_wicket->>'dismissedPlayerId', '')::uuid,
    nullif(v_wicket->>'fielderId', '')::uuid,
    nullif(v_wicket->>'assistFielderId', '')::uuid,
    nullif(v_wicket->>'crossedBeforeDismissal', '')::boolean,
    v_is_free_hit, v_creates_free_hit,
    v_runs_batter = 4 and v_wicket is null, v_runs_batter = 6 and v_wicket is null,
    nullif(p->'shot'->>'x', '')::numeric, nullif(p->'shot'->>'y', '')::numeric,
    nullif(p->'pitch'->>'x', '')::numeric, nullif(p->'pitch'->>'y', '')::numeric,
    p->>'commentaryOverride', auth.uid(), v_client_delivery_id
  )
  returning * into v_delivery;

  return jsonb_build_object('ok', true, 'duplicate', false, 'delivery', to_jsonb(v_delivery));
end;
$$;

create or replace function public.record_delivery(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_innings innings;
  v_match matches;
  v_expected_seq bigint := coalesce((p->>'expectedSeq')::bigint, 0);
  v_current_seq bigint;
  v_result jsonb;
begin
  select * into v_innings from innings where id = (p->>'inningsId')::uuid;
  if v_innings.id is null then
    raise exception 'NOT_FOUND: no such innings';
  end if;
  select * into v_match from matches where id = v_innings.match_id;

  if v_match.is_locked then
    raise exception 'MATCH_LOCKED: this match is locked';
  end if;
  if not public.can_score(v_match.id, auth.uid()) then
    raise exception 'NO_GRANT: you do not hold an active scoring grant for this match';
  end if;
  if v_innings.status <> 'in_progress' then
    raise exception 'INNINGS_COMPLETE: this innings has already ended';
  end if;

  -- A duplicate clientDeliveryId short-circuits before the seq check even
  -- runs — replaying an already-recorded ball is never stale.
  if exists (select 1 from deliveries where client_delivery_id = (p->>'clientDeliveryId')::uuid) then
    v_result := public._insert_scored_delivery(p, v_match, v_innings);
  else
    select coalesce(max(seq), 0) into v_current_seq
      from deliveries where innings_id = v_innings.id and not is_deleted;
    if v_current_seq <> v_expected_seq then
      raise exception 'STALE_SEQ: expected last seq % but server has %', v_expected_seq, v_current_seq;
    end if;
    v_result := public._insert_scored_delivery(p, v_match, v_innings);
  end if;

  return v_result || jsonb_build_object(
    'innings', (select jsonb_build_object('runs', total_runs, 'wickets', total_wickets, 'legalBalls', legal_balls)
                  from innings where id = v_innings.id)
  );
end;
$$;

-- The offline sync worker's endpoint: a whole queued-while-offline run of
-- balls for one innings, in order. See the file header for why only ONE
-- staleness check happens, up front.
create or replace function public.record_deliveries_batch(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_innings innings;
  v_match matches;
  v_expected_seq bigint := coalesce((p->>'expectedSeq')::bigint, 0);
  v_current_seq bigint;
  v_deliveries jsonb := p->'deliveries';
  v_item jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_stopped_at int; -- 0-indexed position of the item that hit a hard error, if any
begin
  select * into v_innings from innings where id = (p->>'inningsId')::uuid;
  if v_innings.id is null then
    raise exception 'NOT_FOUND: no such innings';
  end if;
  select * into v_match from matches where id = v_innings.match_id;

  if v_match.is_locked then
    raise exception 'MATCH_LOCKED: this match is locked';
  end if;
  if not public.can_score(v_match.id, auth.uid()) then
    raise exception 'NO_GRANT: you do not hold an active scoring grant for this match';
  end if;
  if v_innings.status <> 'in_progress' then
    raise exception 'INNINGS_COMPLETE: this innings has already ended';
  end if;

  select coalesce(max(seq), 0) into v_current_seq
    from deliveries where innings_id = v_innings.id and not is_deleted;
  if v_current_seq <> v_expected_seq then
    raise exception 'STALE_SEQ: expected last seq % but server has %', v_expected_seq, v_current_seq;
  end if;

  for i in 0..jsonb_array_length(v_deliveries) - 1 loop
    v_item := v_deliveries->i;
    begin
      -- A duplicate item never counts as the "hard error" that stops the
      -- batch — replaying an already-synced ball mid-batch is expected
      -- (e.g. a previous drain attempt got this far before the network
      -- dropped) and must not block the rest of the queue.
      v_result := public._insert_scored_delivery(v_item, v_match, v_innings);
      v_results := v_results || jsonb_build_array(v_result);
    exception when others then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object(
          'code', split_part(sqlerrm, ':', 1),
          'message', sqlerrm
        )
      ));
      v_stopped_at := i;
      exit;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'results', v_results,
    'stoppedAt', v_stopped_at,
    'innings', (select jsonb_build_object('runs', total_runs, 'wickets', total_wickets, 'legalBalls', legal_balls)
                  from innings where id = v_innings.id)
  );
end;
$$;
