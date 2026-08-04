-- Phase 9 (fix) — `null value in column "entity_id" of relation "audit_log"`.
--
-- audit_log.entity_id is NOT NULL and the purge passed null, because a
-- database-wide delete has no single entity to point at. The insert is the
-- last statement in the function, so the whole transaction rolled back and
-- nothing was ever deleted — the failure was safe, just useless.
--
-- The actor is the only id that means anything for an app-wide action, and
-- `action` already carries what happened. Third and final correction to this
-- function; the two before it were a missing WHERE and a foreign-key ordering,
-- both of which the local harness could not have caught (no safeupdate guard,
-- no seeded matches). Verified here against the real column constraints
-- instead of from memory.

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
  if p_confirm is distinct from 'DELETE' then
    raise exception 'CONFIRM_REQUIRED: pass the confirmation phrase to purge';
  end if;

  select count(*) into v_matches from matches;
  select count(*) into v_deliveries from deliveries;

  -- → deliveries, innings, players
  delete from batting_card_entries where true;
  delete from bowling_card_entries where true;

  -- → deliveries. The append-only trigger blocks DELETE, so it is off for the
  -- length of these two statements. The only place allowed to do this, and the
  -- clearest reason this whole function is temporary (CLAUDE.md rule 3).
  alter table deliveries disable trigger user;
  delete from delivery_edits where true;
  delete from deliveries where true;
  alter table deliveries enable trigger user;

  -- → innings
  delete from innings_intervals where true;
  -- → matches
  delete from innings where true;
  -- → scoring_grants
  delete from handoff_tokens where true;
  -- → matches
  delete from scoring_grants where true;
  delete from match_squads where true;
  delete from player_match_stats where true;
  -- → players only, but meaningless once the matches behind them are gone
  delete from player_career_stats where true;
  delete from ranking_snapshots where true;
  delete from notifications where true;
  delete from matches where true;

  -- Kept on purpose: teams, team_members, players, profiles,
  -- role_change_suggestions, rules_profiles, app_settings.

  -- `entity_id` is NOT NULL, and a purge has no single entity. The actor is
  -- the only id that means anything here, and `action` carries what happened —
  -- which is how every other app-wide entry in this table will have to read.
  insert into audit_log (actor_profile_id, action, entity_type, entity_id, before)
  values (auth.uid(), 'purge_match_data', 'profiles', auth.uid(),
          jsonb_build_object('matches', v_matches, 'deliveries', v_deliveries));

  return jsonb_build_object('ok', true, 'matches', v_matches, 'deliveries', v_deliveries);
end;
$$;

revoke all on function public.purge_match_data(text) from public, anon;
grant execute on function public.purge_match_data(text) to authenticated;
