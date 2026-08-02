-- Phase 4 — docs/10-API-CONTRACT.md § 3.5-3.6, docs/03-ROLES-PERMISSIONS.md § 3,
-- docs/11-SCREENS-AND-ROUTES.md § 5.
--
-- `matches_insert` (Phase 2) already lets a team manager create the row
-- directly, so `create_match` isn't strictly load-bearing for RLS the way
-- `create_team` was — it exists so match creation and the initial owner
-- grant happen atomically in one call, matching docs/10's own description
-- ("create_match ... also creates public_slug + owner grant").
--
-- `set_toss` and `set_playing_xi` ARE load-bearing: `matches_write` and
-- `match_squads_write` already permit direct updates by a manager, but both
-- actions have validation (toss winner must be one of the two teams;
-- captain/keeper must be in the chosen XI; `set_playing_xi` replaces a
-- whole team's squad atomically) that a bare RLS policy can't express.
--
-- `start_innings` is pulled forward from the general match-lifecycle RPC
-- list (docs/10 § 3.6) because docs/11's `/matches/:matchId/setup` screen
-- explicitly ends with "openers and opening bowler" — but the `innings`
-- table (docs/02 § 6) has no column for the current striker/bowler; that
-- only exists per-delivery once scoring starts. So this RPC only creates
-- the innings row and flips the match live; picking openers stays with the
-- Phase 5 scorer pad, which is the thing that actually persists them (as
-- the first delivery's striker_id/non_striker_id/bowler_id).
--
-- handoff_tokens is a new table docs/02 never defines. docs/03 § 3.5
-- describes "Handoff QR — the scorer shows a QR code; the next person
-- scans it ... and instantly receives a grant," which needs somewhere to
-- keep a short-lived, single-use, revocable-by-expiry token. RLS is
-- enabled with zero policies — every access goes through the two
-- security-definer RPCs below, never a direct client query.

create table handoff_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  match_id uuid not null references matches (id) on delete cascade,
  issued_by_profile_id uuid not null references profiles (id),
  can_delegate boolean not null default false,
  scope text not null default 'full',
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by_profile_id uuid references profiles (id),
  created_at timestamptz not null default now()
);

comment on table handoff_tokens is
  'Short-lived single-use QR handoff codes. docs/03 § 3.5. Not in docs/02 — added here.';

create index handoff_tokens_token_idx on handoff_tokens (token);
create index handoff_tokens_match_id_idx on handoff_tokens (match_id);

alter table handoff_tokens enable row level security;

create or replace function public.create_match(
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_config jsonb,
  p_title text default null,
  p_venue text default null,
  p_scheduled_at timestamptz default null
)
returns matches
language plpgsql security definer set search_path = public as $$
declare
  v_match matches;
  v_slug text;
  v_code_a text;
  v_code_b text;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN: must be signed in to create a match';
  end if;
  if p_team_a_id = p_team_b_id then
    raise exception 'INVALID_TEAMS: a team cannot play itself';
  end if;
  if not (
    public.is_super_admin()
    or public.is_team_manager(p_team_a_id)
    or public.is_team_manager(p_team_b_id)
  ) then
    raise exception 'FORBIDDEN: must manage one of the two teams to create a match';
  end if;

  select short_code into v_code_a from teams where id = p_team_a_id;
  select short_code into v_code_b from teams where id = p_team_b_id;
  if v_code_a is null or v_code_b is null then
    raise exception 'NOT_FOUND: one of the teams does not exist';
  end if;

  v_slug := lower(v_code_a) || '-vs-' || lower(v_code_b) || '-' || substr(md5(random()::text), 1, 4);

  insert into matches (public_slug, title, team_a_id, team_b_id, venue, scheduled_at, config, created_by)
  values (v_slug, p_title, p_team_a_id, p_team_b_id, p_venue, p_scheduled_at, p_config, auth.uid())
  returning * into v_match;

  insert into scoring_grants (match_id, grantee_profile_id, granted_by_profile_id, can_delegate)
  values (v_match.id, auth.uid(), auth.uid(), true);

  return v_match;
end;
$$;

create or replace function public.set_toss(p_match_id uuid, p_winner_team_id uuid, p_decision text)
returns matches
language plpgsql security definer set search_path = public as $$
declare
  v_match matches;
begin
  if not (public.is_super_admin() or public.can_manage_match(p_match_id)) then
    raise exception 'FORBIDDEN: not authorized to set the toss for this match';
  end if;
  if p_decision not in ('bat', 'bowl') then
    raise exception 'INVALID_DECISION: decision must be bat or bowl';
  end if;

  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'NOT_FOUND: no such match';
  end if;
  if p_winner_team_id <> v_match.team_a_id and p_winner_team_id <> v_match.team_b_id then
    raise exception 'INVALID_TEAM: toss winner must be one of the two teams in this match';
  end if;

  update matches
     set toss_winner_team_id = p_winner_team_id, toss_decision = p_decision, status = 'toss'
   where id = p_match_id
   returning * into v_match;

  return v_match;
end;
$$;

create or replace function public.set_playing_xi(
  p_match_id uuid,
  p_team_id uuid,
  p_player_ids uuid[],
  p_captain_id uuid default null,
  p_keeper_id uuid default null
)
returns setof match_squads
language plpgsql security definer set search_path = public as $$
declare
  v_player_id uuid;
begin
  if not (public.is_super_admin() or public.can_manage_match(p_match_id)) then
    raise exception 'FORBIDDEN: not authorized to set the playing XI for this match';
  end if;
  if p_captain_id is not null and not (p_captain_id = any (p_player_ids)) then
    raise exception 'INVALID_CAPTAIN: captain must be in the playing XI';
  end if;
  if p_keeper_id is not null and not (p_keeper_id = any (p_player_ids)) then
    raise exception 'INVALID_KEEPER: keeper must be in the playing XI';
  end if;

  delete from match_squads where match_id = p_match_id and team_id = p_team_id;

  foreach v_player_id in array p_player_ids loop
    insert into match_squads (
      match_id, team_id, player_id, is_playing_xi, is_captain, is_wicket_keeper,
      batting_order, role_in_match
    )
    select
      p_match_id, p_team_id, v_player_id, true,
      coalesce(v_player_id = p_captain_id, false), coalesce(v_player_id = p_keeper_id, false),
      array_position(p_player_ids, v_player_id), pl.primary_role
    from players pl where pl.id = v_player_id;
  end loop;

  return query select * from match_squads where match_id = p_match_id and team_id = p_team_id;
end;
$$;

create or replace function public.start_innings(p_match_id uuid)
returns innings
language plpgsql security definer set search_path = public as $$
declare
  v_match matches;
  v_batting_team uuid;
  v_bowling_team uuid;
  v_innings_no int;
  v_innings innings;
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
  else
    select (case when i.batting_team_id = v_match.team_a_id then v_match.team_b_id else v_match.team_a_id end)
      into v_batting_team
      from innings i where i.match_id = p_match_id and i.innings_no = 1;
  end if;

  v_bowling_team := case when v_batting_team = v_match.team_a_id then v_match.team_b_id else v_match.team_a_id end;

  insert into innings (match_id, innings_no, batting_team_id, bowling_team_id, started_at)
  values (p_match_id, v_innings_no, v_batting_team, v_bowling_team, now())
  returning * into v_innings;

  update matches set status = 'live', current_innings_no = v_innings_no where id = p_match_id;

  return v_innings;
end;
$$;

create or replace function public.issue_scoring_grant(
  p_match_id uuid,
  p_grantee_profile_id uuid,
  p_can_delegate boolean default false,
  p_scope text default 'full',
  p_expires_at timestamptz default null,
  p_note text default null
)
returns scoring_grants
language plpgsql security definer set search_path = public as $$
declare
  v_grant scoring_grants;
  v_holds_delegate_grant boolean;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN: must be signed in to issue a scoring grant';
  end if;

  select exists (
    select 1 from scoring_grants g
     where g.match_id = p_match_id and g.grantee_profile_id = auth.uid()
       and g.status = 'active' and g.can_delegate
  ) into v_holds_delegate_grant;

  if not (
    public.is_super_admin() or public.can_manage_match(p_match_id) or v_holds_delegate_grant
  ) then
    raise exception 'FORBIDDEN: not authorized to issue scoring grants for this match';
  end if;

  if exists (
    select 1 from scoring_grants
     where match_id = p_match_id and grantee_profile_id = p_grantee_profile_id and status = 'active'
  ) then
    raise exception 'ALREADY_GRANTED: this person already holds an active grant for this match';
  end if;

  insert into scoring_grants (
    match_id, grantee_profile_id, granted_by_profile_id, can_delegate, scope, expires_at, note
  )
  values (p_match_id, p_grantee_profile_id, auth.uid(), p_can_delegate, p_scope, p_expires_at, p_note)
  returning * into v_grant;

  insert into notifications (profile_id, type, payload)
  values (
    p_grantee_profile_id, 'grant_issued', jsonb_build_object('matchId', p_match_id, 'grantId', v_grant.id)
  );

  return v_grant;
end;
$$;

create or replace function public.revoke_scoring_grant(p_grant_id uuid, p_reason text default null)
returns scoring_grants
language plpgsql security definer set search_path = public as $$
declare
  v_grant scoring_grants;
begin
  select * into v_grant from scoring_grants where id = p_grant_id;
  if v_grant.id is null then
    raise exception 'NOT_FOUND: no such grant';
  end if;

  if not (
    public.is_super_admin()
    or public.can_manage_match(v_grant.match_id)
    or v_grant.granted_by_profile_id = auth.uid()
    or v_grant.grantee_profile_id = auth.uid()
  ) then
    raise exception 'FORBIDDEN: not authorized to revoke this grant';
  end if;

  if v_grant.status <> 'active' then
    raise exception 'NOT_ACTIVE: this grant is already %', v_grant.status;
  end if;

  update scoring_grants
     set status = 'revoked', revoked_at = now(), revoked_by_profile_id = auth.uid(),
         note = coalesce(p_reason, note)
   where id = p_grant_id
   returning * into v_grant;

  insert into notifications (profile_id, type, payload)
  values (
    v_grant.grantee_profile_id, 'grant_revoked',
    jsonb_build_object('matchId', v_grant.match_id, 'grantId', v_grant.id)
  );

  return v_grant;
end;
$$;

create or replace function public.transfer_scoring_grant(
  p_grant_id uuid,
  p_to_profile_id uuid,
  p_keep_mine boolean default false
)
returns scoring_grants
language plpgsql security definer set search_path = public as $$
declare
  v_old scoring_grants;
  v_new scoring_grants;
begin
  select * into v_old from scoring_grants where id = p_grant_id;
  if v_old.id is null then
    raise exception 'NOT_FOUND: no such grant';
  end if;
  if not (public.is_super_admin() or v_old.grantee_profile_id = auth.uid()) then
    raise exception 'FORBIDDEN: only the current holder may transfer this grant';
  end if;
  if v_old.status <> 'active' then
    raise exception 'NOT_ACTIVE: this grant is already %', v_old.status;
  end if;
  if exists (
    select 1 from scoring_grants
     where match_id = v_old.match_id and grantee_profile_id = p_to_profile_id and status = 'active'
  ) then
    raise exception 'ALREADY_GRANTED: the recipient already holds an active grant for this match';
  end if;

  insert into scoring_grants (match_id, grantee_profile_id, granted_by_profile_id, can_delegate, scope, note)
  values (v_old.match_id, p_to_profile_id, auth.uid(), v_old.can_delegate, v_old.scope, 'transferred')
  returning * into v_new;

  insert into notifications (profile_id, type, payload)
  values (
    p_to_profile_id, 'grant_issued', jsonb_build_object('matchId', v_old.match_id, 'grantId', v_new.id)
  );

  if p_keep_mine then
    return v_new;
  end if;

  update scoring_grants
     set status = 'transferred', revoked_at = now(), revoked_by_profile_id = auth.uid(),
         transferred_to_grant_id = v_new.id
   where id = p_grant_id;

  return v_new;
end;
$$;

create or replace function public.create_handoff_token(p_match_id uuid, p_ttl_seconds int default 300)
returns handoff_tokens
language plpgsql security definer set search_path = public as $$
declare
  v_token handoff_tokens;
begin
  if not (
    public.is_super_admin()
    or public.can_manage_match(p_match_id)
    or public.can_score(p_match_id, auth.uid())
  ) then
    raise exception 'FORBIDDEN: not authorized to create a handoff token for this match';
  end if;

  insert into handoff_tokens (token, match_id, issued_by_profile_id, expires_at)
  values (
    upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
    p_match_id, auth.uid(), now() + make_interval(secs => p_ttl_seconds)
  )
  returning * into v_token;

  return v_token;
end;
$$;

create or replace function public.redeem_handoff_token(p_token text)
returns scoring_grants
language plpgsql security definer set search_path = public as $$
declare
  v_token handoff_tokens;
  v_grant scoring_grants;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN: must be signed in to redeem a handoff token';
  end if;

  select * into v_token from handoff_tokens
   where token = p_token and redeemed_at is null and expires_at > now();
  if v_token.id is null then
    raise exception 'TOKEN_INVALID: this handoff link has expired or was already used';
  end if;

  update handoff_tokens set redeemed_at = now(), redeemed_by_profile_id = auth.uid() where id = v_token.id;

  select * into v_grant from scoring_grants
   where match_id = v_token.match_id and grantee_profile_id = auth.uid() and status = 'active';
  if v_grant.id is not null then
    return v_grant;
  end if;

  insert into scoring_grants (match_id, grantee_profile_id, granted_by_profile_id, can_delegate, scope, note)
  values (
    v_token.match_id, auth.uid(), v_token.issued_by_profile_id, v_token.can_delegate, v_token.scope,
    'via handoff QR'
  )
  returning * into v_grant;

  insert into notifications (profile_id, type, payload)
  values (
    v_token.issued_by_profile_id, 'grant_issued',
    jsonb_build_object('matchId', v_token.match_id, 'redeemedBy', auth.uid())
  );

  return v_grant;
end;
$$;

-- The Scoring Rights Map (docs/03 § 3.4) needs to show each grant holder's
-- name and avatar, but `profiles` is deliberately self-or-Super-Admin-only
-- (docs/03 § 6) — a team manager has no read access to a scorer's profile
-- row otherwise. Mirrors `grants_read`'s own authorization exactly, just
-- widening which *columns* come back, the same shape as `search_profiles`.
create or replace function public.get_match_grants(p_match_id uuid)
returns table (
  id uuid,
  match_id uuid,
  grantee_profile_id uuid,
  granted_by_profile_id uuid,
  status grant_status,
  can_delegate boolean,
  scope text,
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  transferred_to_grant_id uuid,
  note text,
  grantee_display_name text,
  grantee_avatar_url text,
  granted_by_display_name text
)
language sql stable security definer set search_path = public as $$
  select
    g.id, g.match_id, g.grantee_profile_id, g.granted_by_profile_id,
    g.status, g.can_delegate, g.scope, g.granted_at, g.expires_at, g.revoked_at,
    g.transferred_to_grant_id, g.note,
    pg.display_name, pg.avatar_url, pb.display_name
  from scoring_grants g
  join profiles pg on pg.id = g.grantee_profile_id
  left join profiles pb on pb.id = g.granted_by_profile_id
  where g.match_id = p_match_id
    and (
      public.is_super_admin()
      or public.can_manage_match(p_match_id)
      or g.grantee_profile_id = auth.uid()
    )
  order by g.granted_at desc;
$$;
