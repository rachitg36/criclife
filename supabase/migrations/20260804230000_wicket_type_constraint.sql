-- A wicket with no dismissal type is not a state cricket has.
--
-- Migration 20260803191000 fixed the function that produced these rows (a
-- JSON `null` is not SQL NULL, so `p->'wicket'` on `{"wicket": null}` made
-- *every* delivery a wicket) and repaired the rows it had already written.
-- It repaired them under a condition that was too narrow:
--
--     where is_wicket and wicket_type is null and dismissed_player_id is null
--
-- The third clause is an assumption about how the row got that way, not part
-- of what makes it wrong. Any row with `is_wicket` and no `wicket_type` is
-- self-contradictory whatever its `dismissed_player_id` says, and one of them
-- is enough to take down a whole match: the client asserted the type was
-- there, fed `undefined` into the legality table, and threw
-- `Cannot read properties of undefined (reading 'normal')` — which blanked
-- the scorer pad and the public audience view alike. Reported from a phone
-- and a laptop on 2026-08-04, on a match that had been scoring fine.
--
-- So: repair on the real condition, then make it unrepresentable. A CHECK
-- constraint is the right shape here because there is no legitimate reason
-- for the pair to disagree, and because every writer already goes through
-- `_insert_scored_delivery` — the constraint costs nothing on the happy path
-- and converts a whole class of silent corruption into a loud insert error at
-- the moment it is caused, rather than a white screen an hour later.

update deliveries
   set is_wicket = false,
       is_boundary_four = (runs_batter = 4),
       is_boundary_six  = (runs_batter = 6)
 where is_wicket
   and wicket_type is null;

-- The mirror case: a type with no flag. Nothing known produces it, and it
-- would under-count wickets rather than crash, which is worse — a wrong score
-- that looks right.
update deliveries
   set is_wicket = true
 where not is_wicket
   and wicket_type is not null;

do $repair$
declare
  r record;
begin
  for r in select distinct innings_id from deliveries loop
    perform public.rebuild_innings(r.innings_id);
  end loop;
end;
$repair$;

alter table deliveries
  drop constraint if exists deliveries_wicket_type_consistent;

alter table deliveries
  add constraint deliveries_wicket_type_consistent
  check (is_wicket = (wicket_type is not null));
