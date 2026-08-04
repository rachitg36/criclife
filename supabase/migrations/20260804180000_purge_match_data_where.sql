-- Phase 9 (fix) — `DELETE requires a WHERE clause`.
--
-- Supabase enables the `safeupdate` guard for its API roles, so a bare DELETE
-- with no WHERE is rejected — including inside a `security definer` function,
-- because the guard is a per-role setting and the function runs under the
-- caller's. The local scratch database has no such guard, which is exactly why
-- this passed here and failed on a phone.
--
-- `where true` is the intended escape hatch: it says "yes, all rows, on
-- purpose", which for this function is the whole point. Every other DELETE in
-- this codebase has a real WHERE, and the guard should stay on.

create or replace function public.purge_match_data(p_confirm text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_matches int;
  v_deliveries int;
begin
  if not public.is_super_admin() then
    raise exception 'FORBIDDEN: only a super admin can purge match data';
  end if;

  -- A typed confirmation, because `security definer` plus one stray call is
  -- the whole database. The client asks the human to type this exact word.
  if p_confirm is distinct from 'DELETE' then
    raise exception 'CONFIRM_REQUIRED: pass the confirmation phrase to purge';
  end if;

  select count(*) into v_matches from matches;
  select count(*) into v_deliveries from deliveries;

  -- Children first: `deliveries` has an append-only trigger that blocks
  -- DELETE, so it is disabled for the length of this statement only. This is
  -- the one place in the codebase allowed to do that, and it is why the
  -- function is going away before launch (CLAUDE.md rule 3).
  alter table deliveries disable trigger user;
  delete from delivery_edits where true;
  delete from deliveries where true;
  alter table deliveries enable trigger user;

  delete from batting_card_entries where true;
  delete from bowling_card_entries where true;
  delete from innings_intervals where true;
  delete from innings where true;
  delete from handoff_tokens where true;
  delete from scoring_grants where true;
  delete from match_squads where true;
  delete from player_match_stats where true;
  delete from player_career_stats where true;
  delete from ranking_snapshots where true;
  delete from notifications where true;
  delete from matches where true;

  -- Not touched, on purpose: teams, team_members, players, profiles,
  -- role_change_suggestions, rules_profiles, app_settings. The squads are the
  -- part worth keeping.

  insert into audit_log (actor_profile_id, action, entity_type, entity_id, before)
  values (
    auth.uid(), 'purge_match_data', 'matches', null,
    jsonb_build_object('matches', v_matches, 'deliveries', v_deliveries)
  );

  return jsonb_build_object('ok', true, 'matches', v_matches, 'deliveries', v_deliveries);
end;
$$;

revoke all on function public.purge_match_data(text) from public, anon;
grant execute on function public.purge_match_data(text) to authenticated;
