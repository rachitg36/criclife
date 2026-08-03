-- Phase 8 (fix) — every ordinary delivery was being recorded as a wicket.
--
-- THE BUG. `record_delivery` and its Phase 6 successor `_insert_scored_delivery`
-- decided "was this a wicket?" with:
--
--     v_wicket jsonb := p->'wicket';
--     ... v_wicket is not null ...
--
-- The client sends `{"wicket": null}` on every non-wicket ball — the scorer
-- store spreads a `DeliveryInput`, whose `wicket` field is always present and
-- is `null` for a dot, a single, a four. In jsonb, `p->'wicket'` on that
-- returns **'null'::jsonb**, which is a JSON null value, not SQL NULL. So
-- `v_wicket is not null` was true for literally every delivery.
--
-- The consequences, all of which were live from Phase 5 onward:
--   * `is_wicket` true on every ball, so `innings.total_wickets` counted every
--     delivery. A side was "all out" after ten balls.
--   * `is_boundary_four` / `is_boundary_six` are computed as
--     `runs_batter = 4 and v_wicket is null`, so **no boundary was ever
--     flagged** — the audience feed, the manhattan chart and every boundary
--     stat saw zero fours and zero sixes.
--
-- WHY NOTHING CAUGHT IT. The pure TS engine is unaffected (it never sees
-- jsonb), so the scorer's own display was right and 350 unit tests stayed
-- green. The pgTAP suite asserted on the *scoring* rules — legality, seq,
-- grants, bowler limits — and never on `is_boundary_four`, because nothing
-- read those columns until Phase 8 needed them for `player_match_stats`.
-- It surfaced the moment a stats test asked "how many fours did he hit?".
--
-- THE FIX is `nullif(p->'wicket', 'null'::jsonb)` — treat a JSON null as
-- absent, which is what the client means by it. The two functions below are
-- otherwise byte-identical to their previous definitions; they were extracted
-- from the earlier migrations programmatically rather than retyped, so this
-- migration changes exactly one line in each and nothing else.

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
  -- PHASE 8 FIX: a JSON `null` is not SQL NULL. `p->'wicket'` on
  -- {"wicket": null} returns 'null'::jsonb, which is NOT NULL, so every
  -- ordinary delivery was being stored as a wicket. See the header.
  v_wicket jsonb := nullif(p->'wicket', 'null'::jsonb);
  v_wicket_type wicket_type := nullif(v_wicket->>'type', '')::wicket_type;
  v_balls_per_over int;
  -- PHASE 8 FIX (second bug, same family): the automatic wide / no-ball run.
  v_auto_extra int;
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

  -- The client sends `extraRuns` meaning "runs *additional* to the automatic
  -- penalty", which is what the TS engine means by it too:
  --     extraRunsTotal = autoExtra + input.extraRuns      (applyDelivery § 3)
  -- The server was storing the client's number verbatim, so every wide and
  -- no-ball was persisted one run short. Two consequences, both live:
  --   * `innings.total_runs`, maintained by trigger from these rows, undercounted
  --     the match by one run per wide and per no-ball.
  --   * the audience view replays server rows through `deliveryToInput`, which
  --     subtracts wideRuns again — so a wide rendered as zero runs, floored by
  --     the engine's own `Math.max(0, ...)`.
  -- Byes and leg-byes carry no automatic run, and penalty runs travel in their
  -- own field, so both are left alone.
  v_auto_extra := case v_extra_type
    when 'wide' then coalesce((v_match.config->>'wideRuns')::int, 1)
    when 'no_ball' then coalesce((v_match.config->>'noBallRuns')::int, 1)
    else 0
  end;
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
    v_striker_id, v_non_striker_id, v_bowler_id, v_runs_batter,
    v_auto_extra + v_extra_runs, v_extra_type,
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

create or replace function public.edit_delivery(p_delivery_id uuid, p_changes jsonb, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old deliveries;
  v_match matches;
  v_new deliveries;
  -- PHASE 8 FIX: same JSON-null trap as _insert_scored_delivery.
  v_wicket jsonb := nullif(p_changes->'wicket', 'null'::jsonb);
begin
  select * into v_old from deliveries where id = p_delivery_id and not is_deleted;
  if v_old.id is null then
    raise exception 'NOT_FOUND: no such delivery, or it was already edited/undone';
  end if;
  select * into v_match from matches where id = v_old.match_id;

  if v_match.is_locked then
    raise exception 'MATCH_LOCKED: this match is locked';
  end if;
  if not (public.is_super_admin() or public.can_score(v_match.id, auth.uid())) then
    raise exception 'FORBIDDEN: not authorized to edit a delivery on this match';
  end if;

  update deliveries set is_deleted = true where id = p_delivery_id;

  insert into deliveries (
    innings_id, match_id, seq, over_no, ball_in_over, is_legal,
    striker_id, non_striker_id, bowler_id, runs_batter, runs_extras, extra_type,
    is_wicket, wicket_type, dismissed_player_id, fielder_id, assist_fielder_id,
    crossed_before_dismissal, is_free_hit, creates_free_hit,
    is_boundary_four, is_boundary_six, commentary, scored_by_profile_id, client_delivery_id
  )
  values (
    v_old.innings_id, v_old.match_id, v_old.seq, v_old.over_no, v_old.ball_in_over, v_old.is_legal,
    v_old.striker_id, v_old.non_striker_id, v_old.bowler_id,
    coalesce((p_changes->>'runsOffBat')::int, v_old.runs_batter),
    coalesce((p_changes->>'extraRuns')::int, v_old.runs_extras),
    v_old.extra_type,
    v_wicket is not null,
    nullif(v_wicket->>'type', '')::wicket_type,
    nullif(v_wicket->>'dismissedPlayerId', '')::uuid,
    nullif(v_wicket->>'fielderId', '')::uuid,
    nullif(v_wicket->>'assistFielderId', '')::uuid,
    nullif(v_wicket->>'crossedBeforeDismissal', '')::boolean,
    v_old.is_free_hit, v_old.creates_free_hit,
    coalesce((p_changes->>'runsOffBat')::int, v_old.runs_batter) = 4 and v_wicket is null,
    coalesce((p_changes->>'runsOffBat')::int, v_old.runs_batter) = 6 and v_wicket is null,
    coalesce(p_changes->>'commentaryOverride', v_old.commentary),
    auth.uid(), gen_random_uuid()
  )
  returning * into v_new;

  insert into delivery_edits (delivery_id, edited_by_profile_id, edit_type, before, after, reason)
  values (v_old.id, auth.uid(), 'correct', to_jsonb(v_old), to_jsonb(v_new), p_reason);

  return jsonb_build_object('ok', true, 'delivery', to_jsonb(v_new));
end;
$$;


-- ── repair existing rows ─────────────────────────────────────────────────
-- `is_wicket` with no `wicket_type` is not a real state: every dismissal has
-- a type. Those rows are exactly the ones this bug produced, so they are
-- safe to correct, and the boundary flags can be re-derived from the runs
-- (which were always stored correctly).
--
-- `criclife-staging` has no matches yet and `criclife-prod` has no schema, so
-- today this is a no-op in both. It exists because the bug shipped, and any
-- database that scored a ball under the old function needs it.

update deliveries
   set is_wicket = false,
       is_boundary_four = (runs_batter = 4),
       is_boundary_six  = (runs_batter = 6)
 where is_wicket
   and wicket_type is null
   and dismissed_player_id is null;

-- Re-derive innings totals for anything touched. `rebuild_innings` is the
-- Phase 2 safety net built for exactly this — docs/07's "if a number looks
-- wrong, rebuild_innings() fixes it".
do $repair$
declare
  r record;
begin
  for r in select distinct innings_id from deliveries loop
    perform public.rebuild_innings(r.innings_id);
  end loop;
end;
$repair$;
