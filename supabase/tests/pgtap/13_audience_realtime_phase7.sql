-- Phase 7: the audience view's realtime feed and its anonymous read surface.
-- docs/06-AUDIENCE-VIEW.md § 3, docs/03-ROLES-PERMISSIONS.md § 6.
--
-- The publication half of this matters more than it looks: without it the
-- client subscribes successfully and simply never receives a row (see the
-- migration's own comment), which is exactly the kind of failure that survives
-- a phase unnoticed.

begin;
select plan(14);

-- ── the publication exists and carries the four tables ───────────────────

select has_table('public', 'deliveries', 'deliveries exists');

select ok(
  exists (select 1 from pg_publication where pubname = 'supabase_realtime'),
  'the supabase_realtime publication exists'
);

select ok(
  exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deliveries'
  ),
  'deliveries is published — the ball-by-ball feed can actually arrive'
);

select ok(
  exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'innings'
  ),
  'innings is published — totals and innings-break transitions arrive'
);

select ok(
  exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches'
  ),
  'matches is published — completion and lock changes arrive'
);

select ok(
  exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scoring_grants'
  ),
  'scoring_grants is published — Phase 5 live revocation finally works'
);

-- ── replica identity ─────────────────────────────────────────────────────
-- An undo is an UPDATE (is_deleted = true). A subscriber filtering on
-- match_id needs that column present in the old tuple, which is what FULL
-- ('f') provides; the default ('d') carries only the primary key.

select is(
  (select relreplident::text from pg_class where oid = 'public.deliveries'::regclass),
  'f',
  'deliveries uses REPLICA IDENTITY FULL so a filtered undo event survives'
);

-- Deliberately left at the default — see the migration's comment on why FULL
-- on a row rewritten every ball is pure free-tier WAL cost.
select is(
  (select relreplident::text from pg_class where oid = 'public.innings'::regclass),
  'd',
  'innings keeps the default replica identity'
);

-- ── the anonymous read surface the audience view depends on ─────────────
-- Every one of these has to be readable with no session at all, or the public
-- link is not public. Checked as a policy fact rather than by querying, so a
-- failure names the missing policy.

select ok(
  exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'matches' and cmd = 'SELECT' and qual = 'true'
  ),
  'matches is publicly readable'
);

select ok(
  exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'innings' and cmd = 'SELECT' and qual = 'true'
  ),
  'innings is publicly readable'
);

select ok(
  exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'deliveries' and cmd = 'SELECT' and qual = 'true'
  ),
  'deliveries is publicly readable'
);

select ok(
  exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'match_squads' and cmd = 'SELECT' and qual = 'true'
  ),
  'match_squads is publicly readable'
);

select ok(
  exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'players' and cmd = 'SELECT' and qual = 'true'
  ),
  'players is publicly readable — the scorecard needs names'
);

-- The one that must NOT be: profiles are never public (docs/03 § 6). A
-- spectator sees cricketing identities, never login accounts.
select ok(
  not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT' and qual = 'true'
  ),
  'profiles is still NOT publicly readable'
);

select * from finish();
rollback;
