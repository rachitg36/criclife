-- docs/02-DATA-MODEL.md §9 (data integrity) and docs/03-ROLES-PERMISSIONS.md §5
-- (helper functions). Every security definer function pins search_path per
-- docs/03 §7's security checklist.

-- ── Auth helpers ────────────────────────────────────────────────────────

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_super_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.is_team_manager(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from team_members tm
      join players pl on pl.id = tm.player_id
     where tm.team_id = p_team_id
       and pl.profile_id = auth.uid()
       and tm.left_at is null
       and tm.team_role in ('owner', 'admin', 'captain', 'vice_captain')
  );
$$;

-- Narrower than is_team_manager(): docs/03 §4's permission matrix reserves
-- team-level edits (name, colours, archiving) to owner/admin, distinct from
-- match-level management (create match, issue grants) which also lets
-- captain/vice_captain through via is_team_manager().
create or replace function public.is_team_admin(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from team_members tm
      join players pl on pl.id = tm.player_id
     where tm.team_id = p_team_id
       and pl.profile_id = auth.uid()
       and tm.left_at is null
       and tm.team_role in ('owner', 'admin')
  ) or exists (
    select 1 from teams t where t.id = p_team_id and t.owner_id = auth.uid()
  );
$$;

create or replace function public.is_player_self(p_player_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from players pl where pl.id = p_player_id and pl.profile_id = auth.uid()
  );
$$;

create or replace function public.can_manage_match(p_match_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
     where m.id = p_match_id
       and ( m.created_by = auth.uid()
          or public.is_team_manager(m.team_a_id)
          or public.is_team_manager(m.team_b_id) )
  );
$$;

create or replace function public.can_score(p_match_id uuid, p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
     where p.id = p_profile_id and p.is_super_admin
  ) or exists (
    select 1 from scoring_grants g
     where g.match_id = p_match_id
       and g.grantee_profile_id = p_profile_id
       and g.status = 'active'
       and (g.expires_at is null or g.expires_at > now())
  );
$$;

-- ── New-user provisioning ───────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── updated_at maintenance ──────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on profiles
  for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on players
  for each row execute function public.set_updated_at();
create trigger role_change_suggestions_set_updated_at before update on role_change_suggestions
  for each row execute function public.set_updated_at();
create trigger teams_set_updated_at before update on teams
  for each row execute function public.set_updated_at();
create trigger matches_set_updated_at before update on matches
  for each row execute function public.set_updated_at();
create trigger rules_profiles_set_updated_at before update on rules_profiles
  for each row execute function public.set_updated_at();

-- ── matches.is_locked enforcement ───────────────────────────────────────
-- docs/03-ROLES-PERMISSIONS.md §5 "matches": lock enforcement lives in a
-- BEFORE UPDATE trigger, not just RLS, so it also holds for security-definer
-- RPCs that bypass the calling role's own RLS.

create or replace function public.enforce_match_lock()
returns trigger
language plpgsql set search_path = public as $$
begin
  if old.is_locked and not public.is_super_admin() then
    raise exception 'MATCH_LOCKED: only a Super Admin may modify a completed, locked match';
  end if;
  return new;
end;
$$;

create trigger matches_enforce_lock before update on matches
  for each row execute function public.enforce_match_lock();

-- ── deliveries: append-only ──────────────────────────────────────────────
-- docs/02 §9 rule 1: physical deletes are blocked by a BEFORE DELETE trigger
-- (RLS's `deliveries_no_delete using (false)` policy is the same rule
-- enforced a second way, for defense in depth).

create or replace function public.block_delivery_delete()
returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'DELIVERIES_APPEND_ONLY: deliveries cannot be physically deleted — soft-delete via is_deleted';
end;
$$;

create trigger deliveries_block_delete before delete on deliveries
  for each row execute function public.block_delivery_delete();

-- ── rebuild_innings: the safety net ─────────────────────────────────────
-- docs/02 §9 rule 3 / §6: recomputes every denormalised total and card entry
-- from `deliveries`, the source of truth. Also the body of the AAI/AAU
-- trigger below, so the trigger and the manual "rebuild" path can never
-- drift apart — they're the same code.

create or replace function public.rebuild_innings(p_innings_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update innings i set
    total_runs = coalesce(agg.runs, 0),
    total_wickets = coalesce(agg.wickets, 0),
    legal_balls = coalesce(agg.legal_balls, 0),
    extras_wides = coalesce(agg.wides, 0),
    extras_no_balls = coalesce(agg.no_balls, 0),
    extras_byes = coalesce(agg.byes, 0),
    extras_leg_byes = coalesce(agg.leg_byes, 0),
    extras_penalty = coalesce(agg.penalty, 0)
  from (
    select
      sum(d.runs_total) as runs,
      count(*) filter (where d.is_wicket) as wickets,
      count(*) filter (where d.is_legal) as legal_balls,
      sum(d.runs_extras) filter (where d.extra_type = 'wide') as wides,
      sum(d.runs_extras) filter (where d.extra_type = 'no_ball') as no_balls,
      sum(d.runs_extras) filter (where d.extra_type = 'bye') as byes,
      sum(d.runs_extras) filter (where d.extra_type = 'leg_bye') as leg_byes,
      sum(d.runs_extras) filter (where d.extra_type = 'penalty') as penalty
    from deliveries d
    where d.innings_id = p_innings_id and not d.is_deleted
  ) agg
  where i.id = p_innings_id;

  -- Batting card: one row per player who faced a ball, in the order they
  -- first came to the crease, with their dismissal (if any) joined in.
  with live as (
    select * from deliveries where innings_id = p_innings_id and not is_deleted
  ),
  batting as (
    select
      striker_id as player_id,
      sum(runs_batter) as runs,
      count(*) filter (where extra_type is distinct from 'wide') as balls,
      count(*) filter (where is_boundary_four) as fours,
      count(*) filter (where is_boundary_six) as sixes,
      min(seq) as first_seq
    from live
    group by striker_id
  ),
  dismissals as (
    select
      d.dismissed_player_id as player_id,
      d.id as dismissal_delivery_id,
      case
        when d.wicket_type = 'retired_hurt' then 'retired_hurt'
        when d.wicket_type = 'retired_out' then 'retired_out'
        else 'out'
      end as status,
      case d.wicket_type
        when 'bowled' then 'b ' || coalesce(bowler.short_name, bowler.full_name)
        when 'caught' then case when fielder.id is not null
          then 'c ' || coalesce(fielder.short_name, fielder.full_name) || ' b ' || coalesce(bowler.short_name, bowler.full_name)
          else 'c & b ' || coalesce(bowler.short_name, bowler.full_name) end
        when 'lbw' then 'lbw b ' || coalesce(bowler.short_name, bowler.full_name)
        when 'stumped' then 'st ' || coalesce(fielder.short_name, fielder.full_name) || ' b ' || coalesce(bowler.short_name, bowler.full_name)
        when 'hit_wicket' then 'hit wicket b ' || coalesce(bowler.short_name, bowler.full_name)
        when 'run_out' then case when fielder.id is not null
          then 'run out (' || coalesce(fielder.short_name, fielder.full_name) || ')'
          else 'run out' end
        when 'obstructing_the_field' then 'obstructing the field'
        when 'handled_the_ball' then 'obstructing the field'
        when 'hit_ball_twice' then 'hit the ball twice'
        when 'timed_out' then 'timed out'
        when 'retired_out' then 'retired out'
        when 'retired_hurt' then 'retired hurt'
      end as dismissal_text
    from live d
    join players bowler on bowler.id = d.bowler_id
    left join players fielder on fielder.id = d.fielder_id
    where d.is_wicket
  )
  insert into batting_card_entries
    (innings_id, player_id, position, runs, balls, fours, sixes, status, dismissal_delivery_id, dismissal_text)
  select
    p_innings_id,
    b.player_id,
    row_number() over (order by b.first_seq),
    b.runs,
    b.balls,
    b.fours,
    b.sixes,
    coalesce(w.status, 'not_out'),
    w.dismissal_delivery_id,
    w.dismissal_text
  from batting b
  left join dismissals w on w.player_id = b.player_id
  on conflict (innings_id, player_id) do update set
    position = excluded.position,
    runs = excluded.runs,
    balls = excluded.balls,
    fours = excluded.fours,
    sixes = excluded.sixes,
    status = excluded.status,
    dismissal_delivery_id = excluded.dismissal_delivery_id,
    dismissal_text = excluded.dismissal_text;

  delete from batting_card_entries bce
   where bce.innings_id = p_innings_id
     and not exists (
       select 1 from deliveries l
        where l.innings_id = p_innings_id and not l.is_deleted and l.striker_id = bce.player_id
     );

  -- Bowling card. A maiden is an over where exactly one bowler bowled every
  -- legal ball and conceded 0 chargeable runs (byes/leg-byes don't count
  -- against the bowler, but do NOT gift a maiden either if the over
  -- otherwise had no batted/extra runs — an all-leg-bye over IS a maiden).
  with live as (
    select * from deliveries where innings_id = p_innings_id and not is_deleted
  ),
  per_over as (
    select
      over_no,
      count(distinct bowler_id) as bowler_count,
      (array_agg(bowler_id))[1] as sole_bowler_id,
      sum(case when extra_type in ('bye', 'leg_bye') then 0 else runs_total end) as chargeable_runs
    from live
    group by over_no
  ),
  maidens as (
    select sole_bowler_id as bowler_id, count(*) as maiden_overs
    from per_over
    where bowler_count = 1 and chargeable_runs = 0
    group by sole_bowler_id
  )
  insert into bowling_card_entries
    (innings_id, player_id, overs_legal_balls, maidens, runs_conceded, wickets, wides, no_balls, dots, fours_conceded, sixes_conceded)
  select
    p_innings_id,
    d.bowler_id,
    count(*) filter (where d.is_legal),
    coalesce(max(m.maiden_overs), 0),
    sum(case when d.extra_type in ('bye', 'leg_bye') then 0 else d.runs_total end),
    count(*) filter (where d.is_wicket and d.wicket_type in ('bowled', 'caught', 'lbw', 'stumped', 'hit_wicket')),
    count(*) filter (where d.extra_type = 'wide'),
    count(*) filter (where d.extra_type = 'no_ball'),
    count(*) filter (where d.is_legal and d.runs_total = 0),
    count(*) filter (where d.is_boundary_four),
    count(*) filter (where d.is_boundary_six)
  from live d
  left join maidens m on m.bowler_id = d.bowler_id
  group by d.bowler_id
  on conflict (innings_id, player_id) do update set
    overs_legal_balls = excluded.overs_legal_balls,
    maidens = excluded.maidens,
    runs_conceded = excluded.runs_conceded,
    wickets = excluded.wickets,
    wides = excluded.wides,
    no_balls = excluded.no_balls,
    dots = excluded.dots,
    fours_conceded = excluded.fours_conceded,
    sixes_conceded = excluded.sixes_conceded;

  delete from bowling_card_entries bce
   where bce.innings_id = p_innings_id
     and not exists (
       select 1 from deliveries l
        where l.innings_id = p_innings_id and not l.is_deleted and l.bowler_id = bce.player_id
     );
end;
$$;

create or replace function public.deliveries_trigger_rebuild()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.rebuild_innings(coalesce(new.innings_id, old.innings_id));
  return coalesce(new, old);
end;
$$;

create trigger deliveries_after_write
  after insert or update on deliveries
  for each row execute function public.deliveries_trigger_rebuild();

-- ── Privilege-escalation guards ──────────────────────────────────────────
-- Belt-and-suspenders: even if a future RLS policy were written too broadly,
-- these stop the two highest-value escalations outright for real end-user
-- requests. Gated on `auth.role() = 'authenticated'` so seed scripts and
-- admin backends (running as service_role/postgres, not through PostgREST)
-- can still set up initial data without tripping over their own safety net.

create or replace function public.prevent_self_super_admin_change()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_super_admin is distinct from old.is_super_admin
     and auth.role() = 'authenticated'
     and not public.is_super_admin() then
    raise exception 'FORBIDDEN: only a Super Admin may change is_super_admin';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_promotion
  before update on profiles
  for each row execute function public.prevent_self_super_admin_change();

create or replace function public.prevent_self_team_role_change()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.team_role is distinct from old.team_role
     and auth.role() = 'authenticated'
     and not public.is_team_admin(old.team_id) then
    raise exception 'FORBIDDEN: only a team owner/admin may change team_role';
  end if;
  return new;
end;
$$;

create trigger team_members_prevent_self_role_change
  before update on team_members
  for each row execute function public.prevent_self_team_role_change();

-- ── Column-limited admin-fields RPC ──────────────────────────────────────
-- docs/03-ROLES-PERMISSIONS.md §5 "players": a Team Admin's write path is
-- this RPC, never a direct UPDATE — it physically cannot touch the
-- player-owned role/identity columns, which is a stronger guarantee than a
-- policy condition that could later be edited to be too permissive.

create or replace function public.update_player_admin_fields(
  p_player_id uuid,
  p_full_name text,
  p_jersey_number int
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team_id uuid;
begin
  select tm.team_id into v_team_id
    from team_members tm
   where tm.player_id = p_player_id and tm.left_at is null
   limit 1;

  if v_team_id is null or not (public.is_super_admin() or public.is_team_manager(v_team_id)) then
    raise exception 'FORBIDDEN: not a manager of this player''s team';
  end if;

  update players
     set full_name = p_full_name,
         jersey_number = p_jersey_number
   where id = p_player_id;
end;
$$;
