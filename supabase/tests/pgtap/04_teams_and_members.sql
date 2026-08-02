-- docs/03-ROLES-PERMISSIONS.md §4 matrix — team creation is open to any
-- signed-in user (they become owner); editing team details is Owner/Admin
-- ONLY (captain/vice_captain do NOT get this, unlike match-level actions).

begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'captain@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'rando@test.local');

-- Any signed-in user can create their own team.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000002', 'Chennai Kings', 'CHE', '00000000-0000-0000-0000-0000000000b1');
reset role;
reset request.jwt.claims;

select is(
  (select owner_id from teams where id = '10000000-0000-0000-0000-000000000002'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'a signed-in user can create their own team'
);

insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-0000000000b2', 'Captain Player');
insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000010', 'captain');

-- Owner can edit team details.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
update teams set city = 'Chennai' where id = '10000000-0000-0000-0000-000000000002';
reset role;
reset request.jwt.claims;

select is(
  (select city from teams where id = '10000000-0000-0000-0000-000000000002'), 'Chennai',
  'the team owner can edit team details'
);

-- Captain CANNOT edit team details (matrix: only Owner/Admin, unlike match actions).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
update teams set city = 'Wrong City' where id = '10000000-0000-0000-0000-000000000002';
reset role;
reset request.jwt.claims;

select is(
  (select city from teams where id = '10000000-0000-0000-0000-000000000002'), 'Chennai',
  'a captain cannot edit team details — that is Owner/Admin only'
);

-- Captain CAN add a player to the team (matrix: Add player ✅ for captain).
insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000b3', 'Rando Player');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
insert into team_members (team_id, player_id, team_role)
  values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000011', 'player');
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from team_members where team_id = '10000000-0000-0000-0000-000000000002'), 2,
  'a captain can add a player to the team'
);

-- A random outsider (not a member of this team) cannot add a player.
insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000012', null, 'Shadow Player');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
select throws_ok(
  $$ insert into team_members (team_id, player_id, team_role)
       values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000012', 'player') $$,
  '42501',
  'new row violates row-level security policy for table "team_members"',
  'an outsider (rando is a plain member, not a manager) cannot add another player'
);
reset role;
reset request.jwt.claims;

-- A team member cannot promote themself to admin via a direct update — the
-- row is theirs (is_player_self matches USING), so the guard trigger fires
-- rather than RLS silently filtering the row out.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
select throws_ok(
  $$ update team_members set team_role = 'admin'
       where team_id = '10000000-0000-0000-0000-000000000002' and player_id = '20000000-0000-0000-0000-000000000011' $$,
  'P0001',
  'FORBIDDEN: only a team owner/admin may change team_role',
  'a plain member cannot change their own team_role, even on their own membership row'
);
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
