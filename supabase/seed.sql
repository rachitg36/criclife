-- Local-dev seed data — 4 teams, 44 players (11 a side), 1 Super Admin.
-- Per Supabase CLI convention, seed.sql only ever runs against the LOCAL dev
-- database (via `supabase db reset`), never against a linked cloud project —
-- so inserting a fake `auth.users` row here for the Super Admin is the
-- standard, accepted pattern, not a shortcut around real auth.
--
-- Everyone except the Super Admin is seeded as a **shadow player**
-- (`profile_id = null`) — exactly what a Team Admin adding a squad of
-- teammates who haven't opened the app yet looks like in production. Each
-- has a `claim_code` so the "claim your player record" flow has something
-- real to test against.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@criclife.local')
on conflict (id) do nothing;

update profiles set is_super_admin = true
  where id = '00000000-0000-0000-0000-000000000001';

with team_seed (id, name, short_code, primary_color, city) as (
  values
    ('a0000000-0000-0000-0000-000000000001'::uuid, 'Mumbai Strikers', 'MUM', '#06b6d4', 'Mumbai'),
    ('a0000000-0000-0000-0000-000000000002'::uuid, 'Chennai Kings', 'CHE', '#f59e0b', 'Chennai'),
    ('a0000000-0000-0000-0000-000000000003'::uuid, 'Bangalore Royals', 'BLR', '#ef4444', 'Bangalore'),
    ('a0000000-0000-0000-0000-000000000004'::uuid, 'Delhi Titans', 'DEL', '#3b82f6', 'Delhi')
)
insert into teams (id, name, short_code, primary_color, city, owner_id)
select id, name, short_code, primary_color, city, '00000000-0000-0000-0000-000000000001'
from team_seed;

-- 11 players per team: names, batting hand, primary role, bowling style
-- cycle through a realistic mix rather than 44 identical rows.
with names (full_name) as (
  values
    ('Aarav Sharma'), ('Vihaan Patel'), ('Kabir Singh'), ('Arjun Rao'), ('Reyansh Iyer'),
    ('Vivaan Kumar'), ('Ayaan Khan'), ('Krishna Nair'), ('Ishaan Gupta'), ('Rohan Mehta'),
    ('Sai Reddy'), ('Aditya Verma'), ('Dhruv Joshi'), ('Kartik Pillai'), ('Yash Malhotra'),
    ('Aryan Chauhan'), ('Shaurya Bhat'), ('Advait Desai'), ('Rudra Menon'), ('Veer Choudhary'),
    ('Atharv Saxena'), ('Om Trivedi'), ('Parth Agarwal'), ('Dev Bose'), ('Nirvaan Kapoor'),
    ('Samar Chatterjee'), ('Ranveer Dutta'), ('Ayush Bansal'), ('Harsh Mishra'), ('Laksh Kulkarni'),
    ('Neel Shetty'), ('Rian Ghosh'), ('Vedant Shah'), ('Kian Rana'), ('Zayn Acharya'),
    ('Arnav Bedi'), ('Tanish Sinha'), ('Manan Thakur'), ('Yuvraj Sethi'), ('Ansh Bajaj'),
    ('Darsh Oberoi'), ('Riaan Sondhi'), ('Kiaan Vora'), ('Shivansh Chopra')
),
numbered as (
  select full_name, row_number() over () as n from names
),
roles as (
  select
    numbered.n,
    numbered.full_name,
    (array['a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
           'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004'])
      [((numbered.n - 1) / 11) + 1]::uuid as team_id,
    ((numbered.n - 1) % 11) + 1 as squad_position,
    case ((numbered.n - 1) % 11) + 1
      when 1 then 'wk_batter' when 2 then 'batter' when 3 then 'batter' when 4 then 'batter'
      when 5 then 'all_rounder' when 6 then 'all_rounder' when 7 then 'bowler' when 8 then 'bowler'
      when 9 then 'bowler' when 10 then 'bowler' else 'batter'
    end::player_role as primary_role,
    case when numbered.n % 5 = 0 then 'left' else 'right' end::batting_hand as batting_hand,
    (array['right_arm_fast', 'right_arm_medium', 'right_arm_off_break', 'left_arm_orthodox',
           'right_arm_fast_medium', 'left_arm_fast_medium', 'right_arm_leg_break', 'none'])
      [1 + (numbered.n % 8)]::bowling_style as bowling_style
  from numbered
),
inserted_players as (
  insert into players
    (id, full_name, short_name, primary_role, batting_hand, bowling_style, claim_code, created_by)
  select
    gen_random_uuid(),
    r.full_name,
    split_part(r.full_name, ' ', 1) || ' ' || left(split_part(r.full_name, ' ', 2), 1) || '.',
    r.primary_role,
    r.batting_hand,
    r.bowling_style,
    'CLAIM-' || lpad(r.n::text, 3, '0'),
    '00000000-0000-0000-0000-000000000001'
  from roles r
  returning id, full_name
)
insert into team_members (team_id, player_id, team_role, squad_number)
select
  r.team_id,
  ip.id,
  case r.squad_position when 1 then 'captain' when 2 then 'vice_captain' else 'player' end::team_role,
  r.squad_position
from roles r
join inserted_players ip on ip.full_name = r.full_name;
