-- Phase 5 — docs/10-API-CONTRACT.md § 3.1, 3.3, 3.4, 3.6; docs/05-SCORER-VIEW.md.
--
-- `crossed_before_dismissal` fills a real gap between two docs that
-- disagree with each other: the engine's `Delivery` type (docs/04, via
-- src/engine/types.ts) needs this field to correctly resolve strike
-- rotation on a run-out during replay, but docs/02 § 6's `deliveries` table
-- never allocates a column for it. Closing it here rather than silently
-- dropping the field on the floor.
--
-- record_delivery re-validates the specific things docs/10 § 3.1 names —
-- "legality, seq, grants, limits" — server-side: is_legal, over_no, and
-- ball_in_over are DERIVED from the existing delivery count (not trusted
-- from the client), as are is_free_hit/creates_free_hit (derived from the
-- previous ball's own creates_free_hit flag) and the free-hit dismissal
-- gate. Grant/lock/idempotency/seq/bowler-limit/consecutive-over are all
-- checked. What is NOT re-derived server-side is the full dismissal
-- legality table (docs/04 § 5.2, 37 cases) or strike rotation/maiden
-- detection — those stay the client TS engine's job, already 100%-covered
-- by Phase 1's test suite. Re-deriving 100% of cricket law in PL/pgSQL
-- would duplicate that entire engine in a second language; this is a
-- disclosed, considered scope boundary, not an oversight.

alter table deliveries add column crossed_before_dismissal boolean;

-- Fix: the original Phase 4 start_innings only computed the correct batting
-- team for innings 1 and 2. For a super over (innings 3+), the real-cricket
-- convention is that the team which bowled first in innings 1 bats first in
-- the first super over, alternating from there — not "whoever didn't bat in
-- innings 1" repeated blindly (which happened to be accidentally right only
-- for innings_no = 2).
create or replace function public.start_innings(p_match_id uuid)
returns innings
language plpgsql security definer set search_path = public as $$
declare
  v_match matches;
  v_batting_team uuid;
  v_bowling_team uuid;
  v_innings_no int;
  v_innings innings;
  v_innings1_bowling_team uuid;
begin
  if not (public.is_super_admin() or public.can_manage_match(p_match_id)) then
    raise exception 'FORBIDDEN: not authorized to start this match';
  end if;

  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'NOT_FOUND: no such match';
  end if;
  if v_match.toss_winner_team_id is null then
    raise exception 'TOSS_REQUIRED: set the toss before starting the innings';
  end if;
  if not exists (
    select 1 from match_squads where match_id = p_match_id and team_id = v_match.team_a_id and is_playing_xi
  ) or not exists (
    select 1 from match_squads where match_id = p_match_id and team_id = v_match.team_b_id and is_playing_xi
  ) then
    raise exception 'XI_REQUIRED: set the playing XI for both teams before starting';
  end if;

  v_innings_no := v_match.current_innings_no + 1;

  if v_innings_no = 1 then
    v_batting_team := case
      when v_match.toss_decision = 'bat' then v_match.toss_winner_team_id
      else (case when v_match.toss_winner_team_id = v_match.team_a_id then v_match.team_b_id else v_match.team_a_id end)
    end;
  elsif v_innings_no = 2 then
    select (case when i.batting_team_id = v_match.team_a_id then v_match.team_b_id else v_match.team_a_id end)
      into v_batting_team
      from innings i where i.match_id = p_match_id and i.innings_no = 1;
  else
    -- Super over (innings 3+): the team that bowled first in innings 1 bats
    -- first in the super over; alternates on repeat ties (innings 5, 7, ...).
    select bowling_team_id into v_innings1_bowling_team
      from innings where match_id = p_match_id and innings_no = 1;
    v_batting_team := case
      when v_innings_no % 2 = 1 then v_innings1_bowling_team
      else (case when v_innings1_bowling_team = v_match.team_a_id then v_match.team_b_id else v_match.team_a_id end)
    end;
  end if;

  v_bowling_team := case when v_batting_team = v_match.team_a_id then v_match.team_b_id else v_match.team_a_id end;

  insert into innings (match_id, innings_no, batting_team_id, bowling_team_id, is_super_over, started_at)
  values (p_match_id, v_innings_no, v_batting_team, v_bowling_team, v_innings_no >= 3, now())
  returning * into v_innings;

  update matches
     set status = (case when v_innings_no >= 3 then 'super_over' else 'live' end)::match_status,
         current_innings_no = v_innings_no
   where id = p_match_id;

  return v_innings;
end;
$$;

create or replace function public.record_delivery(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_innings innings;
  v_match matches;
  v_client_delivery_id uuid := (p->>'clientDeliveryId')::uuid;
  v_expected_seq bigint := coalesce((p->>'expectedSeq')::bigint, 0);
  v_existing deliveries;
  v_current_seq bigint;
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

  -- Idempotency: a duplicate clientDeliveryId is a no-op success, not an error.
  select * into v_existing from deliveries where client_delivery_id = v_client_delivery_id;
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'delivery', to_jsonb(v_existing));
  end if;

  select coalesce(max(seq), 0) into v_current_seq from deliveries where innings_id = v_innings.id and not is_deleted;
  if v_current_seq <> v_expected_seq then
    raise exception 'STALE_SEQ: expected last seq % but server has %', v_expected_seq, v_current_seq;
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

  return jsonb_build_object(
    'ok', true,
    'delivery', to_jsonb(v_delivery),
    'innings', (select jsonb_build_object('runs', total_runs, 'wickets', total_wickets, 'legalBalls', legal_balls)
                  from innings where id = v_innings.id)
  );
end;
$$;

create or replace function public.undo_last_delivery(p_innings_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_innings innings;
  v_match matches;
  v_delivery deliveries;
begin
  select * into v_innings from innings where id = p_innings_id;
  if v_innings.id is null then
    raise exception 'NOT_FOUND: no such innings';
  end if;
  select * into v_match from matches where id = v_innings.match_id;

  if v_match.is_locked then
    raise exception 'MATCH_LOCKED: this match is locked';
  end if;
  if not (public.is_super_admin() or public.can_score(v_match.id, auth.uid())) then
    raise exception 'FORBIDDEN: not authorized to undo a delivery on this match';
  end if;

  select * into v_delivery from deliveries
   where innings_id = p_innings_id and not is_deleted
   order by seq desc limit 1;
  if v_delivery.id is null then
    raise exception 'NOT_FOUND: no deliveries to undo in this innings';
  end if;

  update deliveries set is_deleted = true where id = v_delivery.id;

  insert into delivery_edits (delivery_id, edited_by_profile_id, edit_type, before, after, reason)
  values (v_delivery.id, auth.uid(), 'undo', to_jsonb(v_delivery), null, p_reason);

  return jsonb_build_object('ok', true, 'undoneDeliveryId', v_delivery.id);
end;
$$;

-- Corrects runs/extras/wicket-details/commentary on an already-recorded ball
-- without shifting anyone else's over/ball position — striker, non-striker,
-- bowler, over_no, ball_in_over, is_legal and seq are carried over from the
-- original row unchanged. Changing a ball's legality after the fact (e.g.
-- "that wide was actually legal") would require renumbering every
-- subsequent ball's over_no/ball_in_over, which this does not attempt —
-- undo back to that point and re-enter instead for that case.
create or replace function public.edit_delivery(p_delivery_id uuid, p_changes jsonb, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_old deliveries;
  v_match matches;
  v_new deliveries;
  v_wicket jsonb := p_changes->'wicket';
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

create or replace function public.end_innings(p_innings_id uuid, p_reason text)
returns innings
language plpgsql security definer set search_path = public as $$
declare
  v_innings innings;
  v_match matches;
begin
  select * into v_innings from innings where id = p_innings_id;
  if v_innings.id is null then
    raise exception 'NOT_FOUND: no such innings';
  end if;
  select * into v_match from matches where id = v_innings.match_id;

  if v_match.is_locked then
    raise exception 'MATCH_LOCKED: this match is locked';
  end if;
  if not (public.is_super_admin() or public.can_manage_match(v_match.id) or public.can_score(v_match.id, auth.uid())) then
    raise exception 'FORBIDDEN: not authorized to end this innings';
  end if;
  if p_reason not in ('all_out', 'overs_complete', 'target_reached', 'declared', 'abandoned') then
    raise exception 'INVALID_REASON: % is not a valid end reason', p_reason;
  end if;

  update innings set status = 'completed', end_reason = p_reason, ended_at = now()
   where id = p_innings_id
   returning * into v_innings;

  update matches set status = 'innings_break' where id = v_match.id and status <> 'completed';

  return v_innings;
end;
$$;

create or replace function public.complete_match(
  p_match_id uuid,
  p_result_type result_type,
  p_winner_team_id uuid default null,
  p_win_margin_runs int default null,
  p_win_margin_wickets int default null,
  p_result_text text default null,
  p_player_of_match_id uuid default null
)
returns matches
language plpgsql security definer set search_path = public as $$
declare
  v_match matches;
begin
  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'NOT_FOUND: no such match';
  end if;
  if v_match.is_locked then
    raise exception 'MATCH_LOCKED: this match is already locked';
  end if;
  if not (public.is_super_admin() or public.can_manage_match(p_match_id) or public.can_score(p_match_id, auth.uid())) then
    raise exception 'FORBIDDEN: not authorized to complete this match';
  end if;

  update matches set
    status = 'completed', result_type = p_result_type, winner_team_id = p_winner_team_id,
    win_margin_runs = p_win_margin_runs, win_margin_wickets = p_win_margin_wickets,
    result_text = p_result_text, player_of_match_id = p_player_of_match_id,
    completed_at = now(), is_locked = true
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

-- edit_delivery inserts a corrected row at the SAME seq as the soft-deleted
-- original (docs/10 § 3.4) — but the original index enforced uniqueness on
-- (innings_id, seq) across ALL rows, including soft-deleted ones, which
-- made that insert impossible (the deleted row still "holds" the seq).
-- Only live rows need a unique seq per innings.
drop index deliveries_innings_seq_idx;
create unique index deliveries_innings_seq_idx on deliveries (innings_id, seq) where not is_deleted;
