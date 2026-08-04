-- Diagnostic, not a migration. Safe to run; changes nothing.
--
-- ONE statement on purpose. The first version of this file was three separate
-- selects, and Supabase's SQL Editor only shows the result of the last one —
-- so it silently swallowed the answer that mattered. A single row with every
-- answer in it cannot do that.
--
-- What it is asking: does this database have the Phase 8 JSON-null fix
-- (migration 20260803191000) inside `_insert_scored_delivery`?
--
-- Without it, `p->'wicket'` on {"wicket": null} is 'null'::jsonb, which is NOT
-- SQL NULL — so every ordinary delivery is stored as a wicket with no wicket
-- type. That is the row that threw `Cannot read properties of undefined
-- (reading 'normal')`, and since migration 20260804230000 added the CHECK
-- constraint it is an insert that now *fails*, which presents as every ball
-- refusing to sync on every device, with no bowling rule involved.

select
  (select count(*) from pg_proc where proname = '_insert_scored_delivery')
    as insert_fn_count,
  (select bool_or(prosrc like '%nullif(p->''wicket''%')
     from pg_proc where proname = '_insert_scored_delivery')
    as json_null_fix_applied,          -- must be TRUE
  (select count(*) from deliveries where is_wicket <> (wicket_type is not null))
    as contradictory_rows,             -- must be 0
  (select count(*) from pg_constraint
     where conrelid = 'deliveries'::regclass
       and conname = 'deliveries_wicket_type_consistent')
    as constraint_present,             -- must be 1
  (select count(*) from deliveries) as total_deliveries;
