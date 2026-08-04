-- Phase 9 — a clean slate, for as long as this is pre-production.
--
-- Two days of testing left a database full of half-played matches, and there
-- was no way to clear them short of the SQL Editor. This is the button.
--
-- **It is deliberately temporary.** Once real matches exist, deleting them all
-- is not a feature — it is an incident. `docs/12`'s launch checklist should
-- carry "drop `purge_match_data`" next to "invite the first club", and the
-- function raises loudly enough that nobody mistakes it for routine.
--
-- Scope: matches and everything derived from them. Teams, players, profiles
-- and their memberships are *kept* — the point is to replay fixtures against
-- the same squads, not to start the account again.

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
  delete from delivery_edits;
  delete from deliveries;
  alter table deliveries enable trigger user;

  delete from batting_card_entries;
  delete from bowling_card_entries;
  delete from innings_intervals;
  delete from innings;
  delete from handoff_tokens;
  delete from scoring_grants;
  delete from match_squads;
  delete from player_match_stats;
  delete from player_career_stats;
  delete from ranking_snapshots;
  delete from notifications;
  delete from matches;

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
