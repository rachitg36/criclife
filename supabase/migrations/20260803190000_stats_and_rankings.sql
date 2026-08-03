-- Phase 8 — statistics and rankings. docs/07-STATS-AND-RANKINGS.md.
--
-- Everything here derives from `deliveries`. Nothing is hand-entered, and
-- every function is idempotent: run it twice and you get the same answer, so a
-- correction to the ball log is fixed by re-running, never by patching a total.
--
-- DEVIATION FROM docs/12 AND docs/14, flagged rather than made silently:
-- the roadmap calls `finalize_match` and `recompute_rankings` **edge
-- functions**, and docs/14 § 6 budgets them as such. They are Postgres
-- functions here instead. Reasons, in order of weight:
--   1. `finalize_match` must be atomic with the match completing. As SQL it
--      runs in the same transaction; as an edge function it is a second
--      network hop that can fail after the match is already locked, leaving
--      stats permanently missing for that match.
--   2. It is testable. pgTAP exercises these in CI and in the local harness;
--      a Deno edge function is testable in neither (this sandbox has no
--      Docker — HANDOFF.md § 5.1).
--   3. It costs no edge invocations at all, which is strictly better for the
--      free tier than the ~50/month docs/14 budgeted.
-- Every other server-side operation in Phases 2–7 is a Postgres function for
-- the same reasons; this keeps one pattern instead of two.

-- ── qualification thresholds (docs/07 § 2.3) ─────────────────────────────
-- "Thresholds are configurable in app_settings — a small league needs lower
-- bars." Stored as one jsonb blob so adding a board later is a data change,
-- not a migration.

alter table app_settings
  add column if not exists ranking_thresholds jsonb not null default jsonb_build_object(
    'overall_min_matches', 5,
    'batting_min_innings', 5,
    'batting_min_balls', 60,
    'bowling_min_innings', 5,
    'bowling_min_balls', 180,
    'fielding_min_matches', 5
  );

-- Deliberately NOT seeding a row here. `ranking_threshold` already falls back
-- to its supplied default when `app_settings` is empty, and inserting one
-- collided with an existing Phase 2 pgTAP fixture that inserts its own — a
-- Phase 8 migration has no business changing what Phase 2 sees.

create or replace function public.ranking_threshold(p_key text, p_default numeric)
returns numeric
language sql stable set search_path = public as $$
  select coalesce((select (ranking_thresholds ->> p_key)::numeric from app_settings where id = 1), p_default);
$$;

-- ── format bucketing (docs/07 § 1.4) ─────────────────────────────────────
-- Par strike rate and par economy are format-dependent, and "format" here is
-- a bucket over `oversPerInnings`, not a stored column.

create or replace function public.format_bucket(p_overs numeric)
returns text
language sql immutable as $$
  select case
    when p_overs is null then 'other'
    when p_overs <= 10 then 't10'
    when p_overs <= 20 then 't20'
    when p_overs <= 50 then 'odi'
    else 'other'
  end;
$$;

create or replace function public.par_strike_rate(p_format text)
returns numeric
language sql immutable as $$
  select case p_format when 't10' then 150 when 't20' then 130 when 'odi' then 85 else 110 end::numeric;
$$;

create or replace function public.par_economy(p_format text)
returns numeric
language sql immutable as $$
  select case p_format when 't10' then 9.5 when 't20' then 8.0 when 'odi' then 5.5 else 7.0 end::numeric;
$$;

create or replace function public.clamp(p_value numeric, p_min numeric, p_max numeric)
returns numeric
language sql immutable as $$
  select least(greatest(p_value, p_min), p_max);
$$;

-- ── the three rating components (docs/07 § 2.1) ──────────────────────────
-- Split out so `player_match_stats` can store each independently: the batting
-- board ranks on batting points alone, and recomputing a board must never
-- need to re-derive it from a composite.

create or replace function public.batting_points(
  p_runs int, p_balls int, p_fours int, p_sixes int,
  p_is_out boolean, p_is_not_out boolean, p_format text
)
returns numeric
language sql immutable set search_path = public as $$
  select
      p_runs * 1.0
    + p_fours * 1.0
    + p_sixes * 2.0
    + case when p_runs >= 50 then 15 else 0 end
    + case when p_runs >= 100 then 35 else 0 end
    -- Strike-rate bonus needs a real sample; below 10 balls it is noise.
    + case
        when p_balls >= 10 then
          public.clamp(((p_runs::numeric / p_balls * 100) - public.par_strike_rate(p_format)) * p_balls / 100, -20, 30)
        else 0
      end
    -- A duck only costs you if you were actually dismissed for it.
    - case when p_is_out and p_runs = 0 then 8 else 0 end
    + case when p_is_not_out and p_runs >= 20 then 5 else 0 end;
$$;

create or replace function public.bowling_points(
  p_wickets int, p_maidens int, p_dots int, p_legal_balls int,
  p_runs_conceded int, p_balls_per_over int, p_format text
)
returns numeric
language sql immutable set search_path = public as $$
  select
      p_wickets * 20.0
    + p_maidens * 12.0
    + p_dots * 0.5
    + case when p_wickets >= 3 then 15 else 0 end
    + case when p_wickets >= 5 then 30 else 0 end
    + case
        when p_legal_balls >= 12 then
          public.clamp(
            (public.par_economy(p_format)
              - (p_runs_conceded::numeric / (p_legal_balls::numeric / p_balls_per_over)))
            * (p_legal_balls::numeric / p_balls_per_over) * 2,
            -20, 30)
        else 0
      end;
$$;

create or replace function public.fielding_points(
  p_catches int, p_stumpings int, p_run_outs int, p_assists int
)
returns numeric
language sql immutable as $$
  select p_catches * 8.0 + p_stumpings * 10.0 + p_run_outs * 10.0 + p_assists * 5.0;
$$;

-- ── per-match stats, derived from the ball log ───────────────────────────
-- One pass over `deliveries` per role. Deliberately recomputed from scratch
-- and upserted rather than incremented, so an undo or an edit that rewrites
-- history is corrected simply by calling this again.

create or replace function public.compute_match_stats(p_match_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_match matches%rowtype;
  v_config jsonb;
  v_bpo int;
  v_format text;
  v_rows int := 0;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  v_config := v_match.config;
  v_bpo := coalesce((v_config ->> 'ballsPerOver')::int, 6);
  v_format := public.format_bucket((v_config ->> 'oversPerInnings')::numeric);

  -- Everyone who appears in the match in any capacity: named in an XI, or
  -- turning up in the ball log at all (a substitute fielder takes a catch
  -- without ever being in the XI).
  with participants as (
    select ms.player_id, ms.team_id
      from match_squads ms
     where ms.match_id = p_match_id and ms.is_playing_xi
    union
    select d.striker_id, i.batting_team_id
      from deliveries d join innings i on i.id = d.innings_id
     where d.match_id = p_match_id and not d.is_deleted
    union
    select d.bowler_id, i.bowling_team_id
      from deliveries d join innings i on i.id = d.innings_id
     where d.match_id = p_match_id and not d.is_deleted
  ),
  batting as (
    select
      d.striker_id as player_id,
      sum(d.runs_batter)                                              as runs,
      -- A wide is not a ball faced (docs/07 § 1.1).
      count(*) filter (where d.extra_type is distinct from 'wide')    as balls_faced,
      count(*) filter (where d.is_boundary_four)                      as fours,
      count(*) filter (where d.is_boundary_six)                       as sixes
    from deliveries d
    where d.match_id = p_match_id and not d.is_deleted
    group by d.striker_id
  ),
  dismissals as (
    select d.dismissed_player_id as player_id
      from deliveries d
     where d.match_id = p_match_id and not d.is_deleted
       and d.is_wicket and d.dismissed_player_id is not null
       -- retired_hurt is a substitution, not a dismissal.
       and d.wicket_type is distinct from 'retired_hurt'
  ),
  bowling as (
    select
      d.bowler_id as player_id,
      count(*) filter (where d.is_legal)                              as legal_balls,
      -- Byes and leg-byes are not charged to the bowler (docs/07 § 1.2).
      sum(case when d.extra_type in ('bye', 'leg_bye') then 0 else d.runs_total end) as runs_conceded,
      count(*) filter (
        where d.is_wicket
          and d.wicket_type in ('bowled','caught','lbw','stumped','hit_wicket')
      )                                                               as wickets,
      count(*) filter (where d.is_legal and d.runs_total = 0)         as dots
    from deliveries d
    where d.match_id = p_match_id and not d.is_deleted
    group by d.bowler_id
  ),
  -- A maiden is a completed over off which the bowler conceded nothing.
  -- Grouped by (innings, over, bowler) so a mid-over bowler change cannot
  -- produce a phantom maiden for either of them.
  overs as (
    select d.innings_id, d.over_no, d.bowler_id,
           count(*) filter (where d.is_legal) as legal_balls,
           sum(case when d.extra_type in ('bye','leg_bye') then 0 else d.runs_total end) as conceded
      from deliveries d
     where d.match_id = p_match_id and not d.is_deleted
     group by d.innings_id, d.over_no, d.bowler_id
  ),
  maidens as (
    select bowler_id as player_id, count(*) as maidens
      from overs
     where legal_balls = v_bpo and conceded = 0
     group by bowler_id
  ),
  fielding as (
    select player_id,
           count(*) filter (where kind = 'catch')   as catches,
           count(*) filter (where kind = 'stumping') as stumpings,
           count(*) filter (where kind = 'run_out')  as run_outs,
           count(*) filter (where kind = 'assist')   as assists
    from (
      select d.fielder_id as player_id,
             case d.wicket_type
               when 'caught' then 'catch'
               when 'stumped' then 'stumping'
               when 'run_out' then 'run_out'
             end as kind
        from deliveries d
       where d.match_id = p_match_id and not d.is_deleted
         and d.is_wicket and d.fielder_id is not null
         and d.wicket_type in ('caught','stumped','run_out')
      union all
      select d.assist_fielder_id, 'assist'
        from deliveries d
       where d.match_id = p_match_id and not d.is_deleted
         and d.is_wicket and d.assist_fielder_id is not null
    ) x
    where player_id is not null
    group by player_id
  )
  insert into player_match_stats (
    match_id, player_id, team_id, did_bat, did_bowl,
    runs, balls_faced, fours, sixes, is_out, is_not_out, strike_rate,
    balls_bowled, runs_conceded, wickets, maidens, dots, economy,
    catches, run_outs, stumpings, is_player_of_match, match_result_for_player,
    rating_points
  )
  select
    p_match_id,
    p.player_id,
    p.team_id,
    coalesce(b.balls_faced, 0) > 0 or dm.player_id is not null,
    coalesce(bw.legal_balls, 0) > 0 or bw.player_id is not null,
    coalesce(b.runs, 0),
    coalesce(b.balls_faced, 0),
    coalesce(b.fours, 0),
    coalesce(b.sixes, 0),
    dm.player_id is not null,
    -- Not out only counts if they actually batted; a player who never came to
    -- the crease is "did not bat", which is neither out nor not out.
    coalesce(b.balls_faced, 0) > 0 and dm.player_id is null,
    case when coalesce(b.balls_faced, 0) > 0
         then round(b.runs::numeric / b.balls_faced * 100, 2) end,
    coalesce(bw.legal_balls, 0),
    coalesce(bw.runs_conceded, 0),
    coalesce(bw.wickets, 0),
    coalesce(md.maidens, 0),
    coalesce(bw.dots, 0),
    case when coalesce(bw.legal_balls, 0) > 0
         then round(bw.runs_conceded::numeric / (bw.legal_balls::numeric / v_bpo), 2) end,
    coalesce(f.catches, 0),
    coalesce(f.run_outs, 0),
    coalesce(f.stumpings, 0),
    v_match.player_of_match_id is not distinct from p.player_id,
    case
      when v_match.winner_team_id is null and v_match.result_type = 'tie' then 'tie'
      when v_match.winner_team_id is null then 'nr'
      when v_match.winner_team_id = p.team_id then 'won'
      else 'lost'
    end,
    null  -- rating_points is a second pass; it needs the opposition factor
  from participants p
  left join batting  b  on b.player_id  = p.player_id
  left join bowling  bw on bw.player_id = p.player_id
  left join maidens  md on md.player_id = p.player_id
  left join fielding f  on f.player_id  = p.player_id
  left join (select distinct player_id from dismissals) dm on dm.player_id = p.player_id
  on conflict (match_id, player_id) do update set
    team_id = excluded.team_id,
    did_bat = excluded.did_bat,
    did_bowl = excluded.did_bowl,
    runs = excluded.runs,
    balls_faced = excluded.balls_faced,
    fours = excluded.fours,
    sixes = excluded.sixes,
    is_out = excluded.is_out,
    is_not_out = excluded.is_not_out,
    strike_rate = excluded.strike_rate,
    balls_bowled = excluded.balls_bowled,
    runs_conceded = excluded.runs_conceded,
    wickets = excluded.wickets,
    maidens = excluded.maidens,
    dots = excluded.dots,
    economy = excluded.economy,
    catches = excluded.catches,
    run_outs = excluded.run_outs,
    stumpings = excluded.stumpings,
    is_player_of_match = excluded.is_player_of_match,
    match_result_for_player = excluded.match_result_for_player;

  get diagnostics v_rows = row_count;

  -- Second pass: the rating. Separate because the opposition factor depends
  -- on the opposition XI's ratings, which are only knowable once every row
  -- for this match exists.
  perform public.compute_match_ratings(p_match_id);

  return v_rows;
end;
$$;

-- ── ratings for one match (docs/07 § 2.1) ────────────────────────────────

create or replace function public.compute_match_ratings(p_match_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match matches%rowtype;
  v_bpo int;
  v_format text;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then return; end if;

  v_bpo := coalesce((v_match.config ->> 'ballsPerOver')::int, 6);
  v_format := public.format_bucket((v_match.config ->> 'oversPerInnings')::numeric);

  -- Opposition strength is snapshotted from career ratings *as they stand now*
  -- (docs/07 § 2.1: "snapshotted so it never changes retroactively"). A player
  -- with no career row yet contributes nothing rather than dragging the mean
  -- to zero, so early matches sit at the neutral end of the clamp.
  with opp as (
    select pms.team_id,
           avg(pcs.overall_rating) filter (where pcs.overall_rating is not null) as mean_rating
      from player_match_stats pms
      left join player_career_stats pcs on pcs.player_id = pms.player_id
     where pms.match_id = p_match_id
     group by pms.team_id
  ),
  components as (
    select
      pms.id,
      public.batting_points(pms.runs, pms.balls_faced, pms.fours, pms.sixes,
                            pms.is_out, pms.is_not_out, v_format) as bat,
      public.bowling_points(pms.wickets, pms.maidens, pms.dots, pms.balls_bowled,
                            pms.runs_conceded, v_bpo, v_format)   as bowl,
      public.fielding_points(pms.catches, pms.stumpings, pms.run_outs, 0) as field,
      case when pms.is_player_of_match then 25 else 0 end as potm,
      case pms.match_result_for_player when 'won' then 10 when 'tie' then 5 else 0 end as result,
      public.clamp(
        0.85 + coalesce((select o.mean_rating from opp o where o.team_id <> pms.team_id limit 1), 0) / 2000,
        0.85, 1.25) as opp_factor
    from player_match_stats pms
    where pms.match_id = p_match_id
  )
  update player_match_stats pms
     set rating_points = round((c.bat + c.bowl + c.field + c.potm + c.result) * c.opp_factor, 2)
    from components c
   where c.id = pms.id;
end;
$$;

-- ── career rollup for one player (docs/07 § 1, § 2.2) ────────────────────
-- A full rewrite of the row, every time. docs/14 § 4.4 chose a plain table
-- over a materialized view precisely so this could be a targeted rewrite for
-- one player rather than a refresh of everything.

create or replace function public.rebuild_career_stats(p_player_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_bpo constant int := 6;
begin
  with ordered as (
    -- Most recent match first: `rn` is "matches since", which drives the decay.
    select pms.*,
           m.completed_at,
           row_number() over (order by coalesce(m.completed_at, m.scheduled_at, m.created_at) desc) - 1 as matches_since,
           coalesce((m.config ->> 'ballsPerOver')::int, 6) as bpo
      from player_match_stats pms
      join matches m on m.id = pms.match_id
     where pms.player_id = p_player_id
       and m.status = 'completed'
  ),
  decayed as (
    select *,
           power(0.5, matches_since::numeric / 20) as decay,
           public.batting_points(runs, balls_faced, fours, sixes, is_out, is_not_out,
                                 'other') as bat_pts,
           public.bowling_points(wickets, maidens, dots, balls_bowled, runs_conceded,
                                 bpo, 'other') as bowl_pts,
           public.fielding_points(catches, stumpings, run_outs, 0) as field_pts
      from ordered
  ),
  agg as (
    select
      count(*)                                                   as matches,
      count(*) filter (where did_bat)                            as innings_batted,
      count(*) filter (where did_bowl)                           as innings_bowled,
      coalesce(sum(runs), 0)                                     as runs,
      coalesce(max(runs), 0)                                     as highest_score,
      coalesce(sum(balls_faced), 0)                              as balls_faced,
      count(*) filter (where did_bat and is_out)                 as dismissals,
      count(*) filter (where runs >= 50 and runs < 100)          as fifties,
      count(*) filter (where runs >= 100)                        as hundreds,
      count(*) filter (where did_bat and is_out and runs = 0)    as ducks,
      coalesce(sum(wickets), 0)                                  as wickets,
      coalesce(sum(runs_conceded), 0)                            as runs_conceded,
      coalesce(sum(balls_bowled), 0)                             as balls_bowled,
      count(*) filter (where wickets >= 3)                       as three_fers,
      count(*) filter (where wickets >= 5)                       as five_fers,
      coalesce(sum(catches), 0)                                  as catches,
      coalesce(sum(stumpings), 0)                                as stumpings,
      coalesce(sum(run_outs), 0)                                 as run_outs,
      sum(decay)                                                 as decay_sum,
      sum(coalesce(rating_points, 0) * decay)                    as overall_weighted,
      sum(bat_pts * decay)                                       as bat_weighted,
      sum(bowl_pts * decay)                                      as bowl_weighted,
      sum(field_pts * decay)                                     as field_weighted,
      avg(coalesce(rating_points, 0))                            as avg_career,
      avg(coalesce(rating_points, 0)) filter (where matches_since < 5) as avg_last5
    from decayed
  ),
  best as (
    select wickets as bb_w, runs_conceded as bb_r
      from decayed
     where did_bowl
     order by wickets desc, runs_conceded asc
     limit 1
  ),
  hs as (
    select runs, is_not_out from decayed where did_bat order by runs desc, is_not_out desc limit 1
  ),
  rated as (
    select
      a.*,
      b.bb_w, b.bb_r,
      h.is_not_out as hs_not_out,
      -- docs/07 § 2.2 formFactor, clamped so a hot streak nudges rather than
      -- doubles. Needs a career average to compare against at all.
      case when a.avg_career is null or a.avg_career = 0 then 1
           else public.clamp(1 + 0.15 * (coalesce(a.avg_last5, a.avg_career) / a.avg_career - 1), 0.85, 1.15)
      end as form_factor
    from agg a
    left join best b on true
    left join hs h on true
  )
  insert into player_career_stats (
    player_id, matches, innings_batted, innings_bowled, runs, highest_score,
    highest_score_not_out, batting_average, strike_rate, fifties, hundreds, ducks,
    balls_faced, wickets, best_bowling_wickets, best_bowling_runs, bowling_average,
    economy, three_wicket_hauls, five_wicket_hauls, catches, stumpings, run_outs,
    overall_rating, batting_rating, bowling_rating, allrounder_rating, fielding_rating,
    last_computed_at
  )
  select
    p_player_id, r.matches, r.innings_batted, r.innings_bowled, r.runs, r.highest_score,
    coalesce(r.hs_not_out, false),
    case when r.dismissals > 0 then round(r.runs::numeric / r.dismissals, 2) end,
    case when r.balls_faced > 0 then round(r.runs::numeric / r.balls_faced * 100, 2) end,
    r.fifties, r.hundreds, r.ducks, r.balls_faced, r.wickets,
    r.bb_w, r.bb_r,
    case when r.wickets > 0 then round(r.runs_conceded::numeric / r.wickets, 2) end,
    case when r.balls_bowled > 0 then round(r.runs_conceded::numeric / (r.balls_bowled::numeric / v_bpo), 2) end,
    r.three_fers, r.five_fers, r.catches, r.stumpings, r.run_outs,
    case when r.decay_sum > 0 then round(r.overall_weighted / r.decay_sum * r.form_factor, 2) end,
    case when r.decay_sum > 0 then round(r.bat_weighted   / r.decay_sum, 2) end,
    case when r.decay_sum > 0 then round(r.bowl_weighted  / r.decay_sum, 2) end,
    -- All-rounder is a geometric mean: strong at one and hopeless at the other
    -- scores near zero, which is the entire point of the board.
    case when r.decay_sum > 0
         then round(2 * sqrt(greatest(r.bat_weighted, 0) / r.decay_sum
                           * greatest(r.bowl_weighted, 0) / r.decay_sum), 2) end,
    case when r.decay_sum > 0 then round(r.field_weighted / r.decay_sum, 2) end,
    now()
  from rated r
  on conflict (player_id) do update set
    matches = excluded.matches,
    innings_batted = excluded.innings_batted,
    innings_bowled = excluded.innings_bowled,
    runs = excluded.runs,
    highest_score = excluded.highest_score,
    highest_score_not_out = excluded.highest_score_not_out,
    batting_average = excluded.batting_average,
    strike_rate = excluded.strike_rate,
    fifties = excluded.fifties,
    hundreds = excluded.hundreds,
    ducks = excluded.ducks,
    balls_faced = excluded.balls_faced,
    wickets = excluded.wickets,
    best_bowling_wickets = excluded.best_bowling_wickets,
    best_bowling_runs = excluded.best_bowling_runs,
    bowling_average = excluded.bowling_average,
    economy = excluded.economy,
    three_wicket_hauls = excluded.three_wicket_hauls,
    five_wicket_hauls = excluded.five_wicket_hauls,
    catches = excluded.catches,
    stumpings = excluded.stumpings,
    run_outs = excluded.run_outs,
    overall_rating = excluded.overall_rating,
    batting_rating = excluded.batting_rating,
    bowling_rating = excluded.bowling_rating,
    allrounder_rating = excluded.allrounder_rating,
    fielding_rating = excluded.fielding_rating,
    last_computed_at = excluded.last_computed_at;
end;
$$;

-- ── finalize_match — the one call the app makes ──────────────────────────

create or replace function public.finalize_match(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_players int;
  v_rebuilt int := 0;
  r record;
begin
  if not exists (select 1 from matches where id = p_match_id) then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  v_players := public.compute_match_stats(p_match_id);

  -- Only the players in this match need their careers rewritten. A league of
  -- 500 players does not get a full rebuild because one Sunday game ended.
  for r in select distinct player_id from player_match_stats where match_id = p_match_id loop
    perform public.rebuild_career_stats(r.player_id);
    v_rebuilt := v_rebuilt + 1;
  end loop;

  perform public.recompute_rankings();

  return jsonb_build_object('ok', true, 'players', v_players, 'careersRebuilt', v_rebuilt);
end;
$$;

-- ── recompute_rankings (docs/07 § 2.3, § 3) ─────────────────────────────
-- Writes today's snapshot for the global scope. Rank movement on the Ranks
-- page is this snapshot compared against the most recent earlier one, which is
-- why the table is keyed by date rather than overwritten in place.

create or replace function public.recompute_rankings()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_total int := 0;
  v_today date := current_date;
begin
  -- Idempotent for the day: re-running replaces today's numbers rather than
  -- colliding on the unique key.
  delete from ranking_snapshots where scope = 'global' and snapshot_date = v_today;

  with qualified as (
    select
      pcs.player_id,
      pcs.overall_rating, pcs.batting_rating, pcs.bowling_rating,
      pcs.allrounder_rating, pcs.fielding_rating,
      pcs.matches, pcs.innings_batted, pcs.innings_bowled,
      pcs.balls_faced,
      coalesce((select sum(balls_bowled) from player_match_stats p where p.player_id = pcs.player_id), 0) as balls_bowled
    from player_career_stats pcs
  ),
  boards as (
    select player_id, 'overall' as board, overall_rating as rating from qualified
     where matches >= public.ranking_threshold('overall_min_matches', 5)
       and overall_rating is not null
    union all
    select player_id, 'batting', batting_rating from qualified
     where innings_batted >= public.ranking_threshold('batting_min_innings', 5)
       and balls_faced >= public.ranking_threshold('batting_min_balls', 60)
       and batting_rating is not null
    union all
    select player_id, 'bowling', bowling_rating from qualified
     where innings_bowled >= public.ranking_threshold('bowling_min_innings', 5)
       and balls_bowled >= public.ranking_threshold('bowling_min_balls', 180)
       and bowling_rating is not null
    union all
    -- All-rounder requires qualifying for BOTH boards, not just having a
    -- non-null number (docs/07 § 2.3).
    select player_id, 'allrounder', allrounder_rating from qualified
     where innings_batted >= public.ranking_threshold('batting_min_innings', 5)
       and balls_faced >= public.ranking_threshold('batting_min_balls', 60)
       and innings_bowled >= public.ranking_threshold('bowling_min_innings', 5)
       and balls_bowled >= public.ranking_threshold('bowling_min_balls', 180)
       and allrounder_rating is not null
    union all
    select player_id, 'fielding', fielding_rating from qualified
     where matches >= public.ranking_threshold('fielding_min_matches', 5)
       and fielding_rating is not null
  )
  insert into ranking_snapshots (player_id, scope, board, rank, rating, snapshot_date)
  select player_id, 'global', board,
         rank() over (partition by board order by rating desc),
         rating, v_today
    from boards;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ── keep stats in step with the match lifecycle ─────────────────────────
-- `complete_match` (Phase 5) already sets status/result/lock. Finalising from
-- a trigger rather than from the client means stats cannot be skipped by a
-- scorer who closes the tab the moment the match ends.

create or replace function public.finalize_on_match_complete()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.finalize_match(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists matches_finalize_stats on matches;
create trigger matches_finalize_stats
  after update on matches
  for each row execute function public.finalize_on_match_complete();

-- ── grants ───────────────────────────────────────────────────────────────
-- Read-only helpers are callable by anyone (the Ranks page is public per
-- docs/11 § 2). The write paths are not: they run from the trigger, or from
-- an admin, never from a client.

grant execute on function public.format_bucket(numeric) to anon, authenticated;
grant execute on function public.par_strike_rate(text) to anon, authenticated;
grant execute on function public.par_economy(text) to anon, authenticated;
grant execute on function public.clamp(numeric, numeric, numeric) to anon, authenticated;
grant execute on function public.ranking_threshold(text, numeric) to anon, authenticated;

revoke execute on function public.compute_match_stats(uuid) from anon, authenticated;
revoke execute on function public.compute_match_ratings(uuid) from anon, authenticated;
revoke execute on function public.rebuild_career_stats(uuid) from anon, authenticated;
revoke execute on function public.recompute_rankings() from anon, authenticated;

-- `finalize_match` stays callable by a match manager: a Super Admin correcting
-- a delivery after the fact needs a way to re-derive the stats without
-- un-completing and re-completing the match.
create or replace function public.refinalize_match(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.can_manage_match(p_match_id)) then
    raise exception 'NO_PERMISSION';
  end if;
  return public.finalize_match(p_match_id);
end;
$$;

revoke execute on function public.finalize_match(uuid) from anon, authenticated;
grant execute on function public.refinalize_match(uuid) to authenticated;
