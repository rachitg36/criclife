-- docs/02-DATA-MODEL.md §7, §8 — stats & rankings, plus cross-cutting tables.
-- The actual computation (rating formula, recompute_rankings) is Phase 8;
-- this migration only creates the storage shape.

create table player_match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  player_id uuid not null references players (id),
  team_id uuid not null references teams (id),
  did_bat boolean not null default false,
  did_bowl boolean not null default false,
  runs int not null default 0,
  balls_faced int not null default 0,
  fours int not null default 0,
  sixes int not null default 0,
  is_out boolean not null default false,
  is_not_out boolean not null default false,
  strike_rate numeric(6, 2),
  balls_bowled int not null default 0,
  runs_conceded int not null default 0,
  wickets int not null default 0,
  maidens int not null default 0,
  dots int not null default 0,
  economy numeric(5, 2),
  catches int not null default 0,
  run_outs int not null default 0,
  stumpings int not null default 0,
  is_player_of_match boolean not null default false,
  match_result_for_player text check (match_result_for_player in ('won', 'lost', 'tie', 'nr')),
  rating_points numeric(7, 2),

  unique (match_id, player_id)
);

create index player_match_stats_player_id_idx on player_match_stats (player_id);

create table player_career_stats (
  player_id uuid primary key references players (id) on delete cascade,
  matches int not null default 0,
  innings_batted int not null default 0,
  innings_bowled int not null default 0,
  runs int not null default 0,
  highest_score int not null default 0,
  highest_score_not_out boolean not null default false,
  batting_average numeric(6, 2),
  strike_rate numeric(6, 2),
  fifties int not null default 0,
  hundreds int not null default 0,
  ducks int not null default 0,
  balls_faced int not null default 0,
  wickets int not null default 0,
  best_bowling_wickets int,
  best_bowling_runs int,
  bowling_average numeric(6, 2),
  economy numeric(5, 2),
  three_wicket_hauls int not null default 0,
  five_wicket_hauls int not null default 0,
  catches int not null default 0,
  stumpings int not null default 0,
  run_outs int not null default 0,
  overall_rating numeric(7, 2),
  batting_rating numeric(7, 2),
  bowling_rating numeric(7, 2),
  allrounder_rating numeric(7, 2),
  fielding_rating numeric(7, 2),
  last_computed_at timestamptz
);

comment on table player_career_stats is
  'Plain table (not an MV — see docs/14 §4.4). Fully rewritten by '
  'recompute_rankings on match completion and nightly.';

create table ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  scope text not null,
  board text not null check (board in ('overall', 'batting', 'bowling', 'allrounder', 'fielding')),
  rank int not null,
  rating numeric(7, 2) not null,
  snapshot_date date not null,

  unique (player_id, scope, board, snapshot_date)
);

create index ranking_snapshots_lookup_idx on ranking_snapshots (scope, board, snapshot_date);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on audit_log (entity_type, entity_id);
create index audit_log_actor_idx on audit_log (actor_profile_id);

create table app_settings (
  id int primary key check (id = 1),
  app_name text not null default 'CricLife',
  default_rules_profile_id uuid references rules_profiles (id),
  default_overs int not null default 20,
  allow_public_audience boolean not null default true,
  allow_self_signup boolean not null default true,
  branding jsonb not null default '{}'::jsonb
);

comment on table app_settings is 'Single-row table, Super Admin only.';

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  type text not null
    check (type in ('grant_issued', 'grant_revoked', 'match_starting', 'role_suggestion', 'rank_change')),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_profile_id_idx on notifications (profile_id) where read_at is null;
