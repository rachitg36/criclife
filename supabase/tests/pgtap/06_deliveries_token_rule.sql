-- THE core acceptance test for Phase 2 (docs/12-ROADMAP.md): "a non-admin
-- cannot write a delivery by any route." can_score() must be the *only* path
-- in — not team management, not being a captain, nothing else. Also covers
-- completed-match immutability and the append-only guarantee.

begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'super@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'captain@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', 'scorer@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', 'rando@test.local');
update profiles set is_super_admin = true where id = '00000000-0000-0000-0000-0000000000d1';

insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000005', 'Team D1', 'TD1', '00000000-0000-0000-0000-0000000000d2'),
  ('10000000-0000-0000-0000-000000000006', 'Team D2', 'TD2', '00000000-0000-0000-0000-0000000000d2');

insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-0000000000d2', 'Captain'),
  ('20000000-0000-0000-0000-000000000031', null, 'Striker'),
  ('20000000-0000-0000-0000-000000000032', null, 'Non-striker'),
  ('20000000-0000-0000-0000-000000000033', null, 'Bowler');

insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000030', 'captain');

insert into matches (id, team_a_id, team_b_id, config, created_by) values (
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000006',
  '{"oversPerInnings":20,"ballsPerOver":6,"playersPerSide":11}'::jsonb,
  '00000000-0000-0000-0000-0000000000d2'
);

insert into innings (id, match_id, innings_no, batting_team_id, bowling_team_id) values (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  1,
  '10000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000006'
);

-- The captain manages the match but has never been granted scoring rights.
-- The scorer has an active grant. Rando has neither.
insert into scoring_grants (match_id, grantee_profile_id, granted_by_profile_id) values (
  '30000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-0000000000d3',
  '00000000-0000-0000-0000-0000000000d2'
);

-- 1. anon cannot insert a delivery.
set local role anon;
select throws_ok(
  $$ insert into deliveries (innings_id, match_id, over_no, ball_in_over, is_legal,
       striker_id, non_striker_id, bowler_id, runs_batter, scored_by_profile_id, client_delivery_id)
     values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 1, true,
       '20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000032',
       '20000000-0000-0000-0000-000000000033', 0, '00000000-0000-0000-0000-0000000000d4',
       gen_random_uuid()) $$,
  '42501', null,
  'anon cannot insert a delivery'
);
reset role;

-- 2. A signed-in user with no relation to the match cannot insert.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}';
select throws_ok(
  $$ insert into deliveries (innings_id, match_id, over_no, ball_in_over, is_legal,
       striker_id, non_striker_id, bowler_id, runs_batter, scored_by_profile_id, client_delivery_id)
     values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 1, true,
       '20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000032',
       '20000000-0000-0000-0000-000000000033', 0, '00000000-0000-0000-0000-0000000000d4',
       gen_random_uuid()) $$,
  '42501', null,
  'a random signed-in user (no grant) cannot insert a delivery'
);
reset role;
reset request.jwt.claims;

-- 3. The team's own captain — who manages the match but holds no scoring
--    grant — STILL cannot insert. This is the whole point of the two
--    orthogonal axes in docs/03 §1.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select throws_ok(
  $$ insert into deliveries (innings_id, match_id, over_no, ball_in_over, is_legal,
       striker_id, non_striker_id, bowler_id, runs_batter, scored_by_profile_id, client_delivery_id)
     values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 1, true,
       '20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000032',
       '20000000-0000-0000-0000-000000000033', 0, '00000000-0000-0000-0000-0000000000d2',
       gen_random_uuid()) $$,
  '42501', null,
  'the team captain cannot insert a delivery without a scoring grant — managing the match is not enough'
);
reset role;
reset request.jwt.claims;

-- 4. A grant holder trying to credit the ball to someone else's profile fails
--    (scored_by_profile_id must be their own auth.uid()).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select throws_ok(
  $$ insert into deliveries (innings_id, match_id, over_no, ball_in_over, is_legal,
       striker_id, non_striker_id, bowler_id, runs_batter, scored_by_profile_id, client_delivery_id)
     values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 1, true,
       '20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000032',
       '20000000-0000-0000-0000-000000000033', 0, '00000000-0000-0000-0000-0000000000d2',
       gen_random_uuid()) $$,
  '42501', null,
  'a grant holder cannot attribute a delivery to a different profile'
);
reset role;
reset request.jwt.claims;

-- 5. The grant holder CAN insert, crediting themselves.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
insert into deliveries (innings_id, match_id, over_no, ball_in_over, is_legal,
    striker_id, non_striker_id, bowler_id, runs_batter, scored_by_profile_id, client_delivery_id)
  values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 1, true,
    '20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000032',
    '20000000-0000-0000-0000-000000000033', 4, '00000000-0000-0000-0000-0000000000d3',
    '11111111-0000-0000-0000-000000000001');
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from deliveries where innings_id = '50000000-0000-0000-0000-000000000001'), 1,
  'the scoring-grant holder successfully recorded a delivery'
);

-- 6. The denormalised innings total updated via the trigger.
select is(
  (select total_runs from innings where id = '50000000-0000-0000-0000-000000000001'), 4,
  'the deliveries trigger kept innings.total_runs in sync'
);

-- 7. Lock the match (as the Super Admin) — now even the grant holder is blocked.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
update matches set is_locked = true where id = '30000000-0000-0000-0000-000000000002';
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select throws_ok(
  $$ insert into deliveries (innings_id, match_id, over_no, ball_in_over, is_legal,
       striker_id, non_striker_id, bowler_id, runs_batter, scored_by_profile_id, client_delivery_id)
     values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 2, true,
       '20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000032',
       '20000000-0000-0000-0000-000000000033', 1, '00000000-0000-0000-0000-0000000000d3',
       gen_random_uuid()) $$,
  '42501', null,
  'a completed/locked match blocks further inserts, even from the grant holder'
);
reset role;
reset request.jwt.claims;

-- 8. ...and even the Super Admin cannot insert into a LOCKED match directly —
--    docs/03 §2.1's documented flow is unlock first, then edit.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok(
  $$ insert into deliveries (innings_id, match_id, over_no, ball_in_over, is_legal,
       striker_id, non_striker_id, bowler_id, runs_batter, scored_by_profile_id, client_delivery_id)
     values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 2, true,
       '20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000032',
       '20000000-0000-0000-0000-000000000033', 1, '00000000-0000-0000-0000-0000000000d1',
       gen_random_uuid()) $$,
  '42501', null,
  'even a Super Admin must unlock the match before inserting — the policy has no admin bypass on purpose'
);

-- 9. Super Admin unlocks the match (allowed: enforce_match_lock trigger permits Super Admin).
update matches set is_locked = false where id = '30000000-0000-0000-0000-000000000002';
reset role;
reset request.jwt.claims;

select is(
  (select is_locked from matches where id = '30000000-0000-0000-0000-000000000002'), false,
  'a Super Admin can unlock a completed match'
);

-- 10. Now the grant holder can score again.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
insert into deliveries (innings_id, match_id, over_no, ball_in_over, is_legal,
    striker_id, non_striker_id, bowler_id, runs_batter, scored_by_profile_id, client_delivery_id)
  values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0, 2, true,
    '20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000032',
    '20000000-0000-0000-0000-000000000033', 1, '00000000-0000-0000-0000-0000000000d3',
    '11111111-0000-0000-0000-000000000002');
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from deliveries where innings_id = '50000000-0000-0000-0000-000000000001'), 2,
  'after unlocking, the grant holder can resume scoring'
);

-- 11. Nobody can physically delete a delivery — not even the Super Admin.
-- RLS's `using (false)` policy means the row is simply never matched (0 rows
-- deleted, no exception) — the delete-denying policy alone is the guarantee
-- here, since the BEFORE DELETE trigger never even fires on a row RLS
-- already hid.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
delete from deliveries where innings_id = '50000000-0000-0000-0000-000000000001';
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from deliveries where innings_id = '50000000-0000-0000-0000-000000000001'), 2,
  'deliveries are append-only — even a Super Admin''s delete matches zero rows under RLS'
);

-- 12. The second layer: service_role bypasses RLS entirely (as a real admin
-- backend script would), and the BEFORE DELETE trigger is what stops it there.
set local role service_role;
select throws_ok(
  $$ delete from deliveries where innings_id = '50000000-0000-0000-0000-000000000001' $$,
  'P0001', 'DELIVERIES_APPEND_ONLY: deliveries cannot be physically deleted — soft-delete via is_deleted',
  'even service_role (which bypasses RLS) is stopped by the BEFORE DELETE trigger'
);
reset role;

-- 13. anon can still read the deliveries (public audience view).
set local role anon;
select is(
  (select count(*)::int from deliveries where innings_id = '50000000-0000-0000-0000-000000000001'), 2,
  'anon can read deliveries — the audience view needs this'
);
reset role;

select * from finish();
rollback;
