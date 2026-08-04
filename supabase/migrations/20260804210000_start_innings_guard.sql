-- Phase 9 (fix) — start_innings could open a second innings on top of a live one.
--
-- A brand-new match showed "INNINGS 2 · Need 1 off 12" before a ball was
-- bowled: start_innings had run twice, and the second call happily created
-- innings 2 with a target of innings 1's zero runs plus one.
--
-- Nothing stopped it. The function checked the toss, the squads and (since
-- migration 17) whether either team was busy elsewhere — but never whether
-- *this* match already had an innings under way. A double tap was enough.

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
  v_busy_team text;
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

  -- Only on the *first* innings: innings 2 and the super over are the same
  -- match continuing, and would otherwise trip over their own match's status.
  if v_match.current_innings_no = 0 then
    select t.name into v_busy_team
      from matches m
      join teams t
        on t.id = case
             when m.team_a_id in (v_match.team_a_id, v_match.team_b_id) then m.team_a_id
             else m.team_b_id
           end
     where m.id <> p_match_id
       and m.status in ('live', 'innings_break', 'super_over')
       and (
         m.team_a_id in (v_match.team_a_id, v_match.team_b_id)
         or m.team_b_id in (v_match.team_a_id, v_match.team_b_id)
       )
     limit 1;

    if v_busy_team is not null then
      raise exception
        'TEAM_BUSY: % is already in a live match. Finish or abandon it first.', v_busy_team;
    end if;
  end if;

  -- An innings is already under way. Without this, a second press of "Start
  -- the innings" — a double tap, a stale screen, a retry after a slow
  -- response — opened innings 2 on a match that had not bowled a ball, with a
  -- target of 1 because innings 1 had scored nothing. Reported exactly that
  -- way on a brand-new match.
  if exists (select 1 from innings where match_id = p_match_id and status = 'in_progress') then
    raise exception 'INNINGS_IN_PROGRESS: an innings of this match is already under way';
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
