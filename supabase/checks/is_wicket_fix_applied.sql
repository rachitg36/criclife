-- Diagnostic, not a migration. Safe to run on either project; changes nothing.
--
-- Answers one question: does this database have the Phase 8 JSON-null fix
-- (migration 20260803191000) in `_insert_scored_delivery`?
--
-- Without it, `p->'wicket'` on {"wicket": null} is 'null'::jsonb, which is NOT
-- SQL NULL — so every ordinary delivery is stored as a wicket with no wicket
-- type. That is the row that threw `Cannot read properties of undefined
-- (reading 'normal')`, and since 20260804230000 added the CHECK constraint it
-- is also an insert that now fails outright — i.e. every ball would stop
-- syncing, on every device, with no bowling rule involved.

select
  proname,
  prosrc like '%nullif(p->''wicket''%' as json_null_fix_applied
from pg_proc
where proname = '_insert_scored_delivery';

-- Rows that should not exist. Zero is the expected answer.
select count(*) as contradictory_rows
from deliveries
where is_wicket <> (wicket_type is not null);

-- Is the constraint actually there?
select conname
from pg_constraint
where conrelid = 'deliveries'::regclass
  and conname = 'deliveries_wicket_type_consistent';
