-- Phase 7 — the audience view's realtime feed. docs/06-AUDIENCE-VIEW.md § 3.
--
-- GAP FOUND WHILE BUILDING PHASE 7 (see HANDOFF.md § 6.4):
-- Phases 5 and 6 already subscribe to `postgres_changes` — RequireScoringGrant
-- and ScoringRightsMapPage both watch `scoring_grants` for live revocation —
-- but *nothing has ever added a table to the `supabase_realtime` publication*.
-- Supabase's Realtime server only replays changes for tables in that
-- publication, so every one of those subscriptions has been silently inert:
-- the channel connects, the client reports SUBSCRIBED, and no row event ever
-- arrives. It looks healthy, which is why it survived two phases.
--
-- docs/02-DATA-MODEL.md never mentions the publication (it describes tables,
-- not replication), and docs/09 § 4 assumes Realtime "just works" — this is
-- the schema-side half of that assumption, and it has to be an explicit
-- migration or a fresh project comes up with a dead socket.

-- ── the publication ───────────────────────────────────────────────────────
-- A real Supabase project ships with `supabase_realtime` already created (and
-- empty). A bare local Postgres — which is what supabase/tests/run-local.sh
-- gives us, see HANDOFF.md § 5.1 — has no such thing, so create it when
-- absent rather than assuming either environment.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ── the tables the audience and the scorer actually listen to ────────────
-- Adding a table twice is an error, not a no-op, so each is guarded. Only
-- tables with a public-read RLS policy are listed: Realtime re-checks RLS per
-- subscriber, so publishing a locked-down table would not leak it — but it
-- would ship WAL for events no anonymous spectator can ever receive.
--
--   deliveries      — the ball-by-ball feed, the whole point of the view
--   innings         — totals, status changes (innings break, all out)
--   matches         — status/lock changes (match completed, result set)
--   scoring_grants  — Phase 5's live revocation, dead until now

do $$
declare
  t text;
begin
  foreach t in array array['deliveries', 'innings', 'matches', 'scoring_grants'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── replica identity ─────────────────────────────────────────────────────
-- `deliveries` is the one table whose UPDATEs matter to a subscriber that
-- filters by `match_id`: an undo is a soft delete (`is_deleted = true`), i.e.
-- an UPDATE, and the audience must drop that ball from the feed. With the
-- default replica identity the old tuple carries only the primary key, so a
-- `match_id=eq.…` filter has nothing to match against on the old record and
-- the event can be dropped before it reaches the client. FULL puts every
-- column in the WAL for that row.
--
-- Deliberately NOT applied to the other three: nothing filters their UPDATEs
-- on a non-key column, and FULL is pure WAL overhead for a row that changes
-- on every single ball (`innings` totals) — the exact opposite of what a free
-- tier wants.

alter table deliveries replica identity full;
