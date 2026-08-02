-- docs/03-ROLES-PERMISSIONS.md §2.3 — a player owns their own playing-role
-- fields; nobody else can, not even a Team Admin. Super Admin always can.
-- The lock flag freezes even the player's own access.

begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'teamadmin@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'alice@test.local');
update profiles set is_super_admin = true where id = '00000000-0000-0000-0000-0000000000a1';

insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000001', 'Mumbai Strikers', 'MUM', '00000000-0000-0000-0000-0000000000a2');

insert into players (id, profile_id, full_name, primary_role) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'Team Admin Player', 'batter'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a3', 'Alice Player', 'batter');

insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'admin'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'player');

-- Alice can change her own role.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
update players set primary_role = 'bowler' where id = '20000000-0000-0000-0000-000000000002';
reset role;
reset request.jwt.claims;

select is(
  (select primary_role::text from players where id = '20000000-0000-0000-0000-000000000002'),
  'bowler',
  'a player can change their own primary_role'
);

-- The team admin cannot change Alice's role — not even for their own team.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
update players set primary_role = 'wicket_keeper' where id = '20000000-0000-0000-0000-000000000002';
reset role;
reset request.jwt.claims;

select is(
  (select primary_role::text from players where id = '20000000-0000-0000-0000-000000000002'),
  'bowler',
  'a Team Admin''s attempt to change another player''s role is silently a no-op (RLS filters the row out)'
);

-- update_player_admin_fields lets a team manager touch full_name/jersey_number, never the role.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select update_player_admin_fields('20000000-0000-0000-0000-000000000002', 'A. Player', 99);
reset role;
reset request.jwt.claims;

select is(
  (select full_name from players where id = '20000000-0000-0000-0000-000000000002'),
  'A. Player',
  'a Team Admin can rename a player via update_player_admin_fields'
);
select is(
  (select primary_role::text from players where id = '20000000-0000-0000-0000-000000000002'),
  'bowler',
  'update_player_admin_fields never touches primary_role'
);

-- Lock the role, then even Alice herself is blocked.
update players set role_locked_by_admin = true where id = '20000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
update players set primary_role = 'all_rounder' where id = '20000000-0000-0000-0000-000000000002';
reset role;
reset request.jwt.claims;

select is(
  (select primary_role::text from players where id = '20000000-0000-0000-0000-000000000002'),
  'bowler',
  'once role_locked_by_admin is set, even the player themself cannot change their role'
);

-- Super Admin can override the lock.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
update players set primary_role = 'all_rounder' where id = '20000000-0000-0000-0000-000000000002';
reset role;
reset request.jwt.claims;

select is(
  (select primary_role::text from players where id = '20000000-0000-0000-0000-000000000002'),
  'all_rounder',
  'a Super Admin can change a player''s role even while it is locked'
);

-- Anyone (even anon) can read the public players table. Counts the two rows
-- this test itself created, rather than asserting an absolute total — this
-- suite may run against a freshly migrated database or one with seed.sql's
-- 44 players already loaded.
set local role anon;
select is(
  (select count(*)::int from players
    where id in ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')),
  2,
  'anon can read the public players table'
);
reset role;

select * from finish();
rollback;
