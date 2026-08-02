-- docs/02-DATA-MODEL.md — extensions and enum types.
--
-- Only the columns the doc explicitly declares via `create type ... as enum`
-- become real Postgres enums here. Everything the doc's own column tables
-- mark as plain `text` (e.g. `matches.toss_decision`, `innings.status`,
-- `notifications.type`) stays `text` — a CHECK constraint is added at the
-- table definition instead, so the documented column type isn't silently
-- changed, just constrained.

-- Supabase's own convention: extensions live in a dedicated `extensions`
-- schema (see supabase/config.toml's api.extra_search_path), not `public` —
-- otherwise every internal extension function pollutes the public schema
-- that gets exposed as the API surface. Only citext is actually used here
-- (gen_random_uuid() is a PostgreSQL 13+ built-in — pgcrypto isn't needed).
create schema if not exists extensions;
create extension if not exists citext with schema extensions;

create type player_role as enum
  ('batter', 'bowler', 'all_rounder', 'wicket_keeper', 'wk_batter');

create type batting_hand as enum ('right', 'left');

create type bowling_style as enum (
  'right_arm_fast', 'right_arm_fast_medium', 'right_arm_medium',
  'right_arm_off_break', 'right_arm_leg_break',
  'left_arm_fast', 'left_arm_fast_medium', 'left_arm_medium',
  'left_arm_orthodox', 'left_arm_chinaman', 'none'
);

create type team_role as enum
  ('owner', 'admin', 'captain', 'vice_captain', 'player');

create type match_status as enum
  ('scheduled', 'toss', 'live', 'innings_break', 'super_over', 'completed', 'abandoned');

create type result_type as enum
  ('win', 'tie', 'draw', 'no_result', 'abandoned', 'super_over_win', 'forfeit');

create type grant_status as enum ('active', 'revoked', 'expired', 'transferred');

create type extra_type as enum
  ('wide', 'no_ball', 'bye', 'leg_bye', 'penalty');

create type wicket_type as enum
  ('bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket',
   'retired_out', 'retired_hurt', 'obstructing_the_field',
   'handled_the_ball', 'timed_out', 'hit_ball_twice');
