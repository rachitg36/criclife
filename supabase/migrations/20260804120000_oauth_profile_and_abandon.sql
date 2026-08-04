-- Phase 9 — two things a real user asked for on 2026-08-04.
--
-- 1. A Google sign-in should bring the person's picture and address with it.
--    `profiles` has had `avatar_url` since Phase 2 and nothing ever wrote to
--    it, so every avatar in the app is a coloured initial.
-- 2. A match should be cancellable mid-game, with a reason. `abandoned` has
--    been a valid `match_status` since Phase 2 and there has never been a way
--    to reach it — a match started by mistake was permanent.

-- ── 1. Carry OAuth identity onto the profile ─────────────────────────────
--
-- Google puts the picture in `raw_user_meta_data` under `avatar_url`, and
-- older/other providers use `picture`; take whichever is there. Same for the
-- name: `full_name`, then `name`, then the local part of the address, which
-- is what a magic-link signup with no metadata falls back to.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  );
  return new;
end;
$$;

-- The insert trigger fires once, at signup. Somebody who signed in by magic
-- link first and linked Google later — or whose Google picture changed — would
-- keep the profile they were created with forever. This keeps them in step.
--
-- Deliberately does NOT overwrite a non-null avatar_url: once a player has
-- chosen their own picture, an OAuth refresh must not replace it. Google is a
-- default, not an authority.

create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p set
    email = coalesce(new.email, p.email),
    avatar_url = coalesce(
      p.avatar_url,
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  where p.id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.sync_profile_from_auth();

-- Backfill anyone who signed up before this existed.
update public.profiles p
   set avatar_url = coalesce(
         u.raw_user_meta_data ->> 'avatar_url',
         u.raw_user_meta_data ->> 'picture'
       ),
       email = coalesce(p.email, u.email)
  from auth.users u
 where u.id = p.id
   and p.avatar_url is null;

-- A claimed player with no picture of their own inherits the profile's. The
-- player row is the cricketing identity and the profile is the account; they
-- are separate on purpose (a shadow player has no account at all), but there
-- is no reason to make someone upload the same face twice.
update public.players pl
   set photo_url = pr.avatar_url
  from public.profiles pr
 where pl.profile_id = pr.id
   and pl.photo_url is null
   and pr.avatar_url is not null;

-- ── 2. Abandon a match, with a reason ────────────────────────────────────
--
-- Rain, a lost ball, a fight, or simply started by mistake. Not a deletion:
-- `deliveries` is append-only (CLAUDE.md rule 3) and an abandoned match keeps
-- everything that was scored. The reason goes in `result_text`, which already
-- exists for exactly this kind of human-readable outcome.
--
-- Innings are closed too, so the audience view and the stats functions see a
-- finished match rather than one stuck in progress.

create or replace function public.abandon_match(p_match_id uuid, p_reason text default null)
returns matches
language plpgsql security definer set search_path = public as $$
declare
  v_match matches;
begin
  if not (public.is_super_admin() or public.can_manage_match(p_match_id)) then
    raise exception 'FORBIDDEN: not authorized to abandon this match';
  end if;

  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'NOT_FOUND: no such match';
  end if;
  if v_match.status = 'completed' then
    raise exception 'MATCH_LOCKED: this match is already complete';
  end if;

  update innings
     set status = 'abandoned',
         end_reason = 'abandoned',
         ended_at = coalesce(ended_at, now())
   where match_id = p_match_id and status = 'in_progress';

  update matches
     set status = 'abandoned',
         result_type = 'abandoned',
         result_text = coalesce(nullif(trim(p_reason), ''), 'Match abandoned'),
         completed_at = now(),
         is_locked = true
   where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$$;

revoke all on function public.abandon_match(uuid, text) from public, anon;
grant execute on function public.abandon_match(uuid, text) to authenticated;
