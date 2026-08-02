-- docs/02-DATA-MODEL.md §4, §5 — matches, squads, and the scoring token.

create table rules_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  config jsonb not null,
  is_system boolean not null default false,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table rules_profiles is
  'Named presets copied (not referenced) into matches.config at creation, per §4.1.';

create table matches (
  id uuid primary key default gen_random_uuid(),
  public_slug text unique,
  title text,
  tournament_id uuid, -- FK to tournaments — v1.1, table does not exist yet
  team_a_id uuid not null references teams (id),
  team_b_id uuid not null references teams (id),
  venue text,
  scheduled_at timestamptz,
  status match_status not null default 'scheduled',
  config jsonb not null,
  toss_winner_team_id uuid references teams (id),
  toss_decision text check (toss_decision in ('bat', 'bowl')),
  current_innings_no int not null default 0,
  result_type result_type,
  winner_team_id uuid references teams (id),
  win_margin_runs int,
  win_margin_wickets int,
  player_of_match_id uuid references players (id),
  result_text text,
  created_by uuid references profiles (id),
  completed_at timestamptz,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint matches_teams_distinct check (team_a_id <> team_b_id)
);

create index matches_team_a_idx on matches (team_a_id);
create index matches_team_b_idx on matches (team_b_id);
create index matches_status_idx on matches (status);

create table match_squads (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  team_id uuid not null references teams (id),
  player_id uuid not null references players (id),
  is_playing_xi boolean not null default true,
  is_captain boolean not null default false,
  is_wicket_keeper boolean not null default false,
  batting_order int,
  role_in_match player_role,

  unique (match_id, player_id)
);

create index match_squads_match_id_idx on match_squads (match_id);

create table scoring_grants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  grantee_profile_id uuid not null references profiles (id),
  granted_by_profile_id uuid not null references profiles (id),
  status grant_status not null default 'active',
  can_delegate boolean not null default false,
  scope text not null default 'full'
    check (scope in ('full', 'innings_1', 'innings_2', 'commentary_only')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by_profile_id uuid references profiles (id),
  transferred_to_grant_id uuid references scoring_grants (id),
  note text
);

comment on table scoring_grants is
  'The scoring token. Append-mostly; revocation is a status change, never a delete.';

create unique index one_active_grant_per_user_per_match
  on scoring_grants (match_id, grantee_profile_id)
  where status = 'active';

create index scoring_grants_match_id_idx on scoring_grants (match_id);
