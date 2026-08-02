-- docs/03-ROLES-PERMISSIONS.md §3 (the scoring token) and §4 matrix rows for
-- match creation/editing and grant issue/revoke.

begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'captainA@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'scorerA@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'outsider@test.local'),
  ('00000000-0000-0000-0000-0000000000c4', 'captainB@test.local');

insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000003', 'Team A', 'TMA', '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-000000000004', 'Team B', 'TMB', '00000000-0000-0000-0000-0000000000c4');

insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-0000000000c1', 'Captain A'),
  ('20000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000c4', 'Captain B');

insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000020', 'captain'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000021', 'captain');

-- Captain A can create a match between the two teams (matrix: Create match ✅ for captain).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
insert into matches (id, team_a_id, team_b_id, config, created_by) values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004',
  '{"oversPerInnings":20,"ballsPerOver":6,"playersPerSide":11}'::jsonb,
  '00000000-0000-0000-0000-0000000000c1'
);
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from matches where id = '30000000-0000-0000-0000-000000000001'), 1,
  'a captain can create a match for their team'
);

-- An outsider (no relation to either team) cannot edit the match.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
update matches set title = 'Hijacked' where id = '30000000-0000-0000-0000-000000000001';
reset role;
reset request.jwt.claims;

select is(
  (select title from matches where id = '30000000-0000-0000-0000-000000000001'), null,
  'an outsider cannot edit a match they have no connection to'
);

-- Captain B (the opposing captain) CAN edit match config too (can_manage_match checks either team).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}';
update matches set title = 'Season Opener' where id = '30000000-0000-0000-0000-000000000001';
reset role;
reset request.jwt.claims;

select is(
  (select title from matches where id = '30000000-0000-0000-0000-000000000001'), 'Season Opener',
  'either team''s captain can manage the match'
);

-- Captain A issues a scoring grant to a spectator/scorer.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
insert into scoring_grants (id, match_id, grantee_profile_id, granted_by_profile_id) values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c2',
  '00000000-0000-0000-0000-0000000000c1'
);
reset role;
reset request.jwt.claims;

select is(
  (select status::text from scoring_grants where id = '40000000-0000-0000-0000-000000000001'), 'active',
  'a team captain can issue a scoring grant'
);

-- The outsider cannot issue themself a grant (not a manager, no can_delegate grant).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select throws_ok(
  $$ insert into scoring_grants (match_id, grantee_profile_id, granted_by_profile_id) values (
       '30000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000c3',
       '00000000-0000-0000-0000-0000000000c3'
     ) $$,
  '42501',
  null,
  'a random user cannot self-issue a scoring grant'
);
reset role;
reset request.jwt.claims;

-- A grant holder without can_delegate cannot delegate further.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select throws_ok(
  $$ insert into scoring_grants (match_id, grantee_profile_id, granted_by_profile_id) values (
       '30000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-0000000000c3',
       '00000000-0000-0000-0000-0000000000c2'
     ) $$,
  '42501',
  null,
  'a grant holder without can_delegate cannot issue further grants'
);
reset role;
reset request.jwt.claims;

-- The grant holder can revoke (transfer/revoke own).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
update scoring_grants set status = 'revoked', revoked_at = now(), revoked_by_profile_id = '00000000-0000-0000-0000-0000000000c2'
  where id = '40000000-0000-0000-0000-000000000001';
reset role;
reset request.jwt.claims;

select is(
  (select status::text from scoring_grants where id = '40000000-0000-0000-0000-000000000001'), 'revoked',
  'a grant holder can revoke their own grant'
);

-- can_score() reflects the grant's live status.
select ok(
  not can_score('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2'),
  'can_score() is false once the grant is revoked'
);

-- Re-issue and confirm can_score() is true for an active grant.
insert into scoring_grants (match_id, grantee_profile_id, granted_by_profile_id) values (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c2',
  '00000000-0000-0000-0000-0000000000c1'
);
select ok(
  can_score('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2'),
  'can_score() is true for an active grant holder'
);

select * from finish();
rollback;
