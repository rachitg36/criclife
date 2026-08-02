-- Phase 3 — docs/03-ROLES-PERMISSIONS.md § 2.2/2.3/4, docs/10-API-CONTRACT.md § 3.7.
--
-- Three gaps the Phase 2 policies can't close on their own:
--
-- 1. Creating a team is a chicken-and-egg problem: `teams_insert_own` lets
--    anyone insert a team with `owner_id = auth.uid()`, but the very next
--    step — adding that owner as a `team_members` row — needs
--    `is_team_manager(team_id)` to pass, which requires an *existing*
--    manager row on that team. There is none yet. A security-definer RPC
--    does the whole thing atomically instead of a policy trying to allow
--    "the first member of a brand-new team".
-- 2. "Invite an existing user" (docs/11 § 3, `/teams/:teamId/add-player`)
--    needs to search by handle/email. `profiles` is deliberately not
--    publicly readable (docs/03 § 6 — emails/phones never reach `anon`, and
--    there's no reason a random authenticated user should be able to browse
--    every profile either). `search_profiles` is a narrow read: handle,
--    display name, avatar only, matched, capped at 10 rows.
-- 3. docs/03 § 4 marks "Delete/archive team" as owner-only, stricter than
--    `is_team_admin()` (owner *or* admin) which backs the general
--    `teams_update` policy. `archive_team` and `transfer_team_ownership`
--    enforce the tighter owner-only rule directly rather than trying to
--    split `teams_update` into two policies for one column each.

create or replace function public.create_team(
  p_name text,
  p_short_code text,
  p_primary_color text default '#06b6d4',
  p_secondary_color text default null,
  p_home_ground text default null,
  p_city text default null
)
returns teams
language plpgsql security definer set search_path = public as $$
declare
  v_team teams;
  v_player_id uuid;
  v_slug text;
  v_display_name text;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN: must be signed in to create a team';
  end if;

  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug) || '-' || substr(md5(random()::text), 1, 4);

  insert into teams (name, short_code, slug, primary_color, secondary_color, home_ground, city, owner_id)
  values (p_name, p_short_code, v_slug, coalesce(p_primary_color, '#06b6d4'), p_secondary_color,
          p_home_ground, p_city, auth.uid())
  returning * into v_team;

  -- Reuse the caller's existing player record if onboarding already made one;
  -- otherwise mint a minimal one so they have a seat in their own team.
  select id into v_player_id from players where profile_id = auth.uid() order by created_at limit 1;

  if v_player_id is null then
    select display_name into v_display_name from profiles where id = auth.uid();
    insert into players (profile_id, full_name, created_by)
    values (auth.uid(), coalesce(v_display_name, 'Player'), auth.uid())
    returning id into v_player_id;
  end if;

  insert into team_members (team_id, player_id, team_role, joined_at)
  values (v_team.id, v_player_id, 'owner', now());

  return v_team;
end;
$$;

create or replace function public.create_shadow_player(
  p_team_id uuid,
  p_full_name text,
  p_primary_role player_role default 'batter',
  p_jersey_number int default null
)
returns players
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_code text;
begin
  if not (public.is_super_admin() or public.is_team_manager(p_team_id)) then
    raise exception 'FORBIDDEN: not a manager of this team';
  end if;

  v_code := upper(substr(md5(random()::text), 1, 8));

  insert into players (full_name, primary_role, jersey_number, created_by, claim_code)
  values (p_full_name, p_primary_role, p_jersey_number, auth.uid(), v_code)
  returning * into v_player;

  insert into team_members (team_id, player_id, team_role, joined_at)
  values (p_team_id, v_player.id, 'player', now());

  return v_player;
end;
$$;

-- Public-safe fields only; no email/phone. Any signed-in user may search —
-- the same trust level as being able to see a handle in the app already.
create or replace function public.search_profiles(p_query text)
returns table (id uuid, display_name text, handle citext, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.handle, p.avatar_url
    from profiles p
   where auth.uid() is not null
     and p_query is not null
     and length(trim(p_query)) > 0
     and (p.handle ilike '%' || p_query || '%' or p.email ilike p_query)
   order by p.display_name
   limit 10;
$$;

create or replace function public.add_existing_profile_to_team(
  p_team_id uuid,
  p_profile_id uuid,
  p_team_role team_role default 'player'
)
returns players
language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_display_name text;
begin
  if not (public.is_super_admin() or public.is_team_manager(p_team_id)) then
    raise exception 'FORBIDDEN: not a manager of this team';
  end if;

  select * into v_player from players where profile_id = p_profile_id order by created_at limit 1;

  if v_player.id is null then
    select display_name into v_display_name from profiles where id = p_profile_id;
    if v_display_name is null then
      raise exception 'PROFILE_NOT_FOUND: no profile matches this id';
    end if;
    insert into players (profile_id, full_name, created_by)
    values (p_profile_id, v_display_name, auth.uid())
    returning * into v_player;
  end if;

  if exists (
    select 1 from team_members
     where team_id = p_team_id and player_id = v_player.id and left_at is null
  ) then
    raise exception 'ALREADY_MEMBER: this player is already on the team';
  end if;

  insert into team_members (team_id, player_id, team_role, joined_at)
  values (p_team_id, v_player.id, p_team_role, now());

  return v_player;
end;
$$;

create or replace function public.suggest_role_change(
  p_player_id uuid,
  p_suggested_role player_role,
  p_note text default null
)
returns role_change_suggestions
language plpgsql security definer set search_path = public as $$
declare
  v_suggestion role_change_suggestions;
  v_is_manager boolean;
begin
  select exists (
    select 1 from team_members tm
     where tm.player_id = p_player_id
       and tm.left_at is null
       and public.is_team_manager(tm.team_id)
  ) into v_is_manager;

  if not (public.is_super_admin() or v_is_manager) then
    raise exception 'FORBIDDEN: not a manager of a team this player belongs to';
  end if;

  insert into role_change_suggestions (player_id, suggested_by, suggested_role, note, status)
  values (p_player_id, auth.uid(), p_suggested_role, p_note, 'pending')
  returning * into v_suggestion;

  insert into notifications (profile_id, type, payload)
  select pl.profile_id, 'role_suggestion', jsonb_build_object(
    'suggestionId', v_suggestion.id, 'suggestedRole', p_suggested_role
  )
  from players pl where pl.id = p_player_id and pl.profile_id is not null;

  return v_suggestion;
end;
$$;

create or replace function public.respond_to_role_suggestion(
  p_suggestion_id uuid,
  p_accept boolean
)
returns role_change_suggestions
language plpgsql security definer set search_path = public as $$
declare
  v_suggestion role_change_suggestions;
  v_locked boolean;
begin
  select * into v_suggestion from role_change_suggestions where id = p_suggestion_id;

  if v_suggestion.id is null then
    raise exception 'NOT_FOUND: no such suggestion';
  end if;

  if not public.is_player_self(v_suggestion.player_id) and not public.is_super_admin() then
    raise exception 'FORBIDDEN: only the player themself resolves a suggestion';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'ALREADY_RESOLVED: this suggestion was already %', v_suggestion.status;
  end if;

  if p_accept then
    select role_locked_by_admin into v_locked from players where id = v_suggestion.player_id;
    if v_locked and not public.is_super_admin() then
      raise exception 'ROLE_LOCKED: this player''s role is locked by an administrator';
    end if;
    update players set primary_role = v_suggestion.suggested_role where id = v_suggestion.player_id;
  end if;

  update role_change_suggestions
     set status = case when p_accept then 'accepted' else 'rejected' end,
         resolved_at = now()
   where id = p_suggestion_id
   returning * into v_suggestion;

  insert into notifications (profile_id, type, payload)
  values (
    v_suggestion.suggested_by, 'role_suggestion',
    jsonb_build_object('suggestionId', v_suggestion.id, 'status', v_suggestion.status)
  );

  return v_suggestion;
end;
$$;

create or replace function public.transfer_team_ownership(p_team_id uuid, p_new_owner_profile_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old_owner_id uuid;
  v_new_owner_player_id uuid;
  v_old_owner_player_id uuid;
begin
  select owner_id into v_old_owner_id from teams where id = p_team_id;

  if v_old_owner_id is null then
    raise exception 'NOT_FOUND: no such team';
  end if;

  if not (public.is_super_admin() or v_old_owner_id = auth.uid()) then
    raise exception 'FORBIDDEN: only the current owner may transfer ownership';
  end if;

  update teams set owner_id = p_new_owner_profile_id where id = p_team_id;

  select id into v_new_owner_player_id from players where profile_id = p_new_owner_profile_id limit 1;
  if v_new_owner_player_id is not null then
    update team_members set team_role = 'owner'
     where team_id = p_team_id and player_id = v_new_owner_player_id and left_at is null;
  end if;

  select id into v_old_owner_player_id from players where profile_id = v_old_owner_id limit 1;
  if v_old_owner_player_id is not null then
    update team_members set team_role = 'admin'
     where team_id = p_team_id and player_id = v_old_owner_player_id
       and left_at is null and team_role = 'owner';
  end if;
end;
$$;

create or replace function public.archive_team(p_team_id uuid, p_archived boolean default true)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (
    public.is_super_admin()
    or exists (select 1 from teams where id = p_team_id and owner_id = auth.uid())
  ) then
    raise exception 'FORBIDDEN: only the team owner may archive or restore this team';
  end if;

  update teams set is_archived = p_archived where id = p_team_id;
end;
$$;
