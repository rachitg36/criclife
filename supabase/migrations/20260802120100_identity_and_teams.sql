-- docs/02-DATA-MODEL.md §2, §3 — identity & teams.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  handle citext unique,
  avatar_url text,
  email citext,
  phone text,
  is_super_admin boolean not null default false,
  theme_pref text not null default 'system'
    check (theme_pref in ('dark', 'light', 'system')),
  accent_pref text not null default 'cyan',
  haptics_enabled boolean not null default true,
  sound_enabled boolean not null default false,
  scorer_hand text not null default 'right'
    check (scorer_hand in ('left', 'right')),
  reduced_motion_override boolean,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'Mirrors auth.users. Created by trigger on signup.';

create table players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id) on delete set null,
  full_name text not null,
  short_name text,
  jersey_number int,
  date_of_birth date,
  photo_url text,
  primary_role player_role not null default 'batter',
  secondary_role player_role,
  batting_hand batting_hand not null default 'right',
  bowling_style bowling_style,
  bio text,
  role_locked_by_admin boolean not null default false,
  created_by uuid references profiles (id),
  claim_code text unique,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table players is
  'The cricketing identity. Separable from a login (profile_id null = shadow player).';

create table role_change_suggestions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  suggested_by uuid not null references profiles (id),
  suggested_role player_role not null,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_code text not null,
  slug text unique,
  logo_url text,
  primary_color text not null default '#06b6d4',
  secondary_color text,
  home_ground text,
  city text,
  founded_year int,
  owner_id uuid not null references profiles (id),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  player_id uuid not null references players (id) on delete cascade,
  team_role team_role not null default 'player',
  squad_number int,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  is_active boolean generated always as (left_at is null) stored
);

create unique index team_members_one_active_membership
  on team_members (team_id, player_id)
  where left_at is null;

create index team_members_player_id_idx on team_members (player_id) where left_at is null;
create index team_members_team_id_idx on team_members (team_id) where left_at is null;
