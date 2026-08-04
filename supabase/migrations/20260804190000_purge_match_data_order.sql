-- Phase 9 (fix) — purge_match_data deleted in the wrong order.
--
--   update or delete on table "deliveries" violates foreign key constraint
--   "batting_card_entries_dismissal_delivery_id_fkey"
--
-- `batting_card_entries.dismissal_delivery_id` points at the ball that got the
-- batter out, so the card entries have to go *before* the deliveries. They were
-- after, because the original order was written from "children of innings"
-- rather than from the actual foreign keys.
--
-- Ordered by reference now, deepest first, with the referencing table named in
-- a comment so the next edit has something to check against.

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

  insert into audit_log (actor_profile_id, action, entity_type, entity_id, before)
  values (auth.uid(), 'purge_match_data', 'matches', null,
          jsonb_build_object('matches', v_matches, 'deliveries', v_deliveries));

  return jsonb_build_object('ok', true, 'matches', v_matches, 'deliveries', v_deliveries);
end;
$$;

revoke all on function public.purge_match_data(text) from public, anon;
grant execute on function public.purge_match_data(text) to authenticated;
