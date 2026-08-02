-- docs/02-DATA-MODEL.md §6 — the match log. `deliveries` is the single
-- source of truth; everything else here is either denormalised (maintained
-- by trigger, see 20260802120500_functions_and_triggers.sql) or an audit trail.

create table innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  innings_no int not null,
  batting_team_id uuid not null references teams (id),
  bowling_team_id uuid not null references teams (id),
  is_super_over boolean not null default false,
  total_runs int not null default 0,
  total_wickets int not null default 0,
  legal_balls int not null default 0,
  extras_wides int not null default 0,
  extras_no_balls int not null default 0,
  extras_byes int not null default 0,
  extras_leg_byes int not null default 0,
  extras_penalty int not null default 0,
  target int,
  revised_target int,
  revised_overs numeric(4, 1),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'declared', 'abandoned')),
  end_reason text
    check (end_reason in ('all_out', 'overs_complete', 'target_reached', 'declared', 'abandoned')),
  started_at timestamptz,
  ended_at timestamptz,

  unique (match_id, innings_no)
);

create index innings_match_id_idx on innings (match_id);

create sequence deliveries_seq_seq;

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references innings (id) on delete cascade,
  match_id uuid not null references matches (id),
  seq bigint not null default nextval('deliveries_seq_seq'),
  over_no int not null,
  ball_in_over int not null,
  is_legal boolean not null,
  striker_id uuid not null references players (id),
  non_striker_id uuid not null references players (id),
  bowler_id uuid not null references players (id),
  runs_batter int not null default 0,
  runs_extras int not null default 0,
  extra_type extra_type,
  runs_total int generated always as (runs_batter + runs_extras) stored,
  is_wicket boolean not null default false,
  wicket_type wicket_type,
  dismissed_player_id uuid references players (id),
  fielder_id uuid references players (id),
  assist_fielder_id uuid references players (id),
  is_free_hit boolean not null default false,
  creates_free_hit boolean not null default false,
  is_boundary_four boolean not null default false,
  is_boundary_six boolean not null default false,
  shot_x numeric,
  shot_y numeric,
  pitch_x numeric,
  pitch_y numeric,
  commentary text,
  scored_by_profile_id uuid not null references profiles (id),
  client_delivery_id uuid not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table deliveries is
  'The single source of truth for everything. Append-only. Every stat, chart, '
  'and ranking is derived from this table.';

create unique index deliveries_innings_seq_idx on deliveries (innings_id, seq);
create unique index deliveries_client_delivery_id_idx on deliveries (client_delivery_id);
create index deliveries_match_over_ball_idx on deliveries (match_id, over_no, ball_in_over);
create index deliveries_striker_idx on deliveries (striker_id) where not is_deleted;
create index deliveries_bowler_idx on deliveries (bowler_id) where not is_deleted;
create index deliveries_dismissed_player_idx on deliveries (dismissed_player_id) where is_wicket;

create table delivery_edits (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references deliveries (id) on delete cascade,
  edited_by_profile_id uuid not null references profiles (id),
  edit_type text not null check (edit_type in ('correct', 'undo', 'restore')),
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index delivery_edits_delivery_id_idx on delivery_edits (delivery_id);

create table innings_intervals (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references innings (id) on delete cascade,
  type text not null
    check (type in ('drinks', 'rain', 'injury', 'powerplay_start', 'powerplay_end', 'strategic_timeout')),
  at_over numeric(4, 1),
  overs_lost numeric(4, 1),
  started_at timestamptz,
  ended_at timestamptz,
  note text
);

create index innings_intervals_innings_id_idx on innings_intervals (innings_id);

create table batting_card_entries (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references innings (id) on delete cascade,
  player_id uuid not null references players (id),
  position int,
  runs int not null default 0,
  balls int not null default 0,
  fours int not null default 0,
  sixes int not null default 0,
  status text not null default 'did_not_bat'
    check (status in ('not_out', 'out', 'retired_hurt', 'retired_out', 'did_not_bat')),
  dismissal_delivery_id uuid references deliveries (id),
  dismissal_text text,
  minutes_at_crease int,

  unique (innings_id, player_id)
);

create index batting_card_entries_innings_id_idx on batting_card_entries (innings_id);

create table bowling_card_entries (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references innings (id) on delete cascade,
  player_id uuid not null references players (id),
  overs_legal_balls int not null default 0,
  maidens int not null default 0,
  runs_conceded int not null default 0,
  wickets int not null default 0,
  wides int not null default 0,
  no_balls int not null default 0,
  dots int not null default 0,
  fours_conceded int not null default 0,
  sixes_conceded int not null default 0,

  unique (innings_id, player_id)
);

create index bowling_card_entries_innings_id_idx on bowling_card_entries (innings_id);
