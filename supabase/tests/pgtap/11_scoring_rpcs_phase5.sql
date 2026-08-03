-- Phase 5 RPCs: record_delivery, undo_last_delivery, edit_delivery,
-- end_innings, complete_match, and the fixed super-over batting-team logic
-- in start_innings. docs/10-API-CONTRACT.md § 3.1, 3.3, 3.4, 3.6.

begin;
select plan(33);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'captainScoreA@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'captainScoreB@test.local'),
  ('00000000-0000-0000-0000-0000000000f3', 'outsiderScore@test.local'),
  ('00000000-0000-0000-0000-0000000000f4', 'scorerHolder@test.local');

insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000020', 'Scorer Team A', 'SCA', '00000000-0000-0000-0000-0000000000f1'),
  ('10000000-0000-0000-0000-000000000021', 'Scorer Team B', 'SCB', '00000000-0000-0000-0000-0000000000f2');

insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000080', '00000000-0000-0000-0000-0000000000f1', 'A Captain'),
  ('20000000-0000-0000-0000-000000000081', null, 'A Striker'),
  ('20000000-0000-0000-0000-000000000082', null, 'A NonStriker'),
  ('20000000-0000-0000-0000-000000000090', '00000000-0000-0000-0000-0000000000f2', 'B Captain'),
  ('20000000-0000-0000-0000-000000000091', null, 'B Bowler1'),
  ('20000000-0000-0000-0000-000000000092', null, 'B Bowler2');

insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000080', 'captain'),
  ('10000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000081', 'player'),
  ('10000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000082', 'player'),
  ('10000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000090', 'captain'),
  ('10000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000091', 'player'),
  ('10000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000092', 'player');

-- Small config: 2 overs, 6 balls/over, 3-a-side, 1 max over/bowler — lets
-- BOWLER_LIMIT and CONSECUTIVE_OVER trigger without a huge fixture.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select create_match(
  '10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000021',
  '{"oversPerInnings":2,"ballsPerOver":6,"playersPerSide":3,"maxOversPerBowler":1,"wideRuns":1,"noBallRuns":1,"freeHitAfterNoBall":true}'::jsonb,
  'Scoring Test Match'
);
reset role;
reset request.jwt.claims;
select id as match_id from matches where title = 'Scoring Test Match' \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select issue_scoring_grant(:'match_id', '00000000-0000-0000-0000-0000000000f4');
select set_toss(:'match_id', '10000000-0000-0000-0000-000000000020', 'bat');
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000020',
  array['20000000-0000-0000-0000-000000000080'::uuid, '20000000-0000-0000-0000-000000000081'::uuid, '20000000-0000-0000-0000-000000000082'::uuid],
  '20000000-0000-0000-0000-000000000080', null
);
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000021',
  array['20000000-0000-0000-0000-000000000090'::uuid, '20000000-0000-0000-0000-000000000091'::uuid, '20000000-0000-0000-0000-000000000092'::uuid],
  '20000000-0000-0000-0000-000000000090', null
);
select start_innings(:'match_id');
reset role;
reset request.jwt.claims;

select id as innings_id from innings where match_id = (:'match_id')::uuid and innings_no = 1 \gset

select is(
  (select batting_team_id from innings where id = (:'innings_id')::uuid),
  '10000000-0000-0000-0000-000000000020'::uuid,
  'innings 1 batting team follows the toss decision (bat)'
);

-- ── record_delivery ──────────────────────────────────────────────────────

select gen_random_uuid() as cid1 \gset
select gen_random_uuid() as cid2 \gset
select gen_random_uuid() as cid3 \gset
select gen_random_uuid() as cid4 \gset
select gen_random_uuid() as cid5 \gset
select gen_random_uuid() as cid6 \gset
select gen_random_uuid() as cid7 \gset
select gen_random_uuid() as cid8 \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
select throws_ok(
  format(
    $$ select record_delivery('{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":0,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":1,"extraType":null,"extraRuns":0}'::jsonb) $$,
    :'innings_id', :'cid1'
  ),
  'P0001', 'NO_GRANT: you do not hold an active scoring grant for this match',
  'a random signed-in user with no grant cannot record a delivery'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}';

-- Ball 1: 1 run off the bat.
select record_delivery(format(
  '{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":0,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":1,"extraType":null,"extraRuns":0}',
  :'innings_id', :'cid1')::jsonb);

select is(
  (select over_no from deliveries where innings_id = (:'innings_id')::uuid order by seq limit 1), 0,
  'the first ball is over_no 0'
);
select is(
  (select ball_in_over from deliveries where innings_id = (:'innings_id')::uuid order by seq limit 1), 1,
  'the first ball is ball_in_over 1'
);

-- Stale seq: still claiming expectedSeq 0, but a ball already landed.
select throws_ok(
  format(
    $$ select record_delivery('{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":0,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":1,"extraType":null,"extraRuns":0}'::jsonb) $$,
    :'innings_id', :'cid2'
  ),
  'P0001', null,
  'a stale expectedSeq is rejected'
);

-- Replaying ball 1's exact clientDeliveryId is idempotent, not an error.
select (record_delivery(format(
  '{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":99,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":1,"extraType":null,"extraRuns":0}',
  :'innings_id', :'cid1')::jsonb)->>'duplicate')::boolean as is_dup \gset

select ok(:'is_dup'::boolean, 'replaying the same clientDeliveryId returns duplicate:true, not an error');
select is(
  (select count(*)::int from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted), 1,
  'the duplicate submission did not insert a second row'
);

-- Ball 2: a wide — illegal, repeats ball_in_over 2, seq still advances.
select current_seq from (
  select coalesce(max(seq), 0) as current_seq from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted
) s \gset

select record_delivery(format(
  '{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":%s,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":0,"extraType":"wide","extraRuns":0}',
  :'innings_id', :'cid2', :'current_seq')::jsonb);

select ok(
  not (select is_legal from deliveries where client_delivery_id = (:'cid2')::uuid),
  'a wide is recorded as illegal'
);
select is(
  (select ball_in_over from deliveries where client_delivery_id = (:'cid2')::uuid), 2,
  'an illegal ball repeats the next legal ball_in_over position'
);

-- Ball 3: a no-ball — creates a free hit for the next ball.
select coalesce(max(seq), 0) as current_seq from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset
select record_delivery(format(
  '{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":%s,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":0,"extraType":"no_ball","extraRuns":0}',
  :'innings_id', :'cid3', :'current_seq')::jsonb);

select ok(
  (select creates_free_hit from deliveries where client_delivery_id = (:'cid3')::uuid),
  'a no-ball creates a free hit (config.freeHitAfterNoBall)'
);

-- Ball 4: the next ball is correctly flagged as the free hit.
select coalesce(max(seq), 0) as current_seq from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset
select record_delivery(format(
  '{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":%s,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":1,"extraType":null,"extraRuns":0}',
  :'innings_id', :'cid4', :'current_seq')::jsonb);

select ok(
  (select is_free_hit from deliveries where client_delivery_id = (:'cid4')::uuid),
  'the ball after a no-ball is correctly flagged as a free hit'
);

-- On a free hit, a bowled dismissal is illegal.
select coalesce(max(seq), 0) as current_seq from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset
select coalesce(max(seq), 0) as stale_seq_for_illegal_test from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset

-- (re-flag another no-ball so the NEXT ball is again a free hit, to test cleanly)
select record_delivery(format(
  '{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":%s,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":0,"extraType":"no_ball","extraRuns":0}',
  :'innings_id', :'cid5', :'current_seq')::jsonb);
select coalesce(max(seq), 0) as current_seq from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset

select throws_ok(
  format(
    $$ select record_delivery('{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":%s,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":0,"extraType":null,"extraRuns":0,"wicket":{"type":"bowled","dismissedPlayerId":"20000000-0000-0000-0000-000000000081"}}'::jsonb) $$,
    :'innings_id', :'cid6', :'current_seq'
  ),
  'P0001', null,
  'a bowled dismissal is illegal on a free hit'
);

-- Consume the pending free hit and fill out the rest of over 1 (need 4 more
-- legal balls: legal count is 2 so far — cid1 and cid4). Each call is its
-- own top-level statement so the expectedSeq subquery re-evaluates fresh.
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000091', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000091', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000091', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000091', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));

select is(
  (select count(*)::int from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted and is_legal),
  6, 'over 1 is complete: 6 legal balls recorded'
);

-- CONSECUTIVE_OVER: the same bowler cannot open over 2.
select coalesce(max(seq), 0) as current_seq from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset
select throws_ok(
  format(
    $$ select record_delivery('{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":%s,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":1,"extraType":null,"extraRuns":0}'::jsonb) $$,
    :'innings_id', :'cid7', :'current_seq'
  ),
  'P0001', null,
  'the same bowler cannot open the next over'
);

-- A different bowler opens over 2, then fills it (6 legal balls).
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000092', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000092', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000092', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000092', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000092', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));
select record_delivery(jsonb_build_object(
  'inningsId', :'innings_id', 'clientDeliveryId', gen_random_uuid(),
  'expectedSeq', (select coalesce(max(seq), 0) from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  'strikerId', '20000000-0000-0000-0000-000000000081', 'nonStrikerId', '20000000-0000-0000-0000-000000000082',
  'bowlerId', '20000000-0000-0000-0000-000000000092', 'runsOffBat', 0, 'extraType', null, 'extraRuns', 0
));

select is(
  (select count(*)::int from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted and is_legal),
  12, 'over 2 is complete: 12 legal balls recorded'
);

-- BOWLER_LIMIT: the over-1 bowler already bowled their one allowed over.
select coalesce(max(seq), 0) as current_seq from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset
select throws_ok(
  format(
    $$ select record_delivery('{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":%s,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":1,"extraType":null,"extraRuns":0}'::jsonb) $$,
    :'innings_id', :'cid8', :'current_seq'
  ),
  'P0001', null,
  'a bowler already at maxOversPerBowler cannot be given another over'
);
reset role;
reset request.jwt.claims;

-- ── undo_last_delivery ───────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
select throws_ok(
  format($$ select undo_last_delivery('%s') $$, :'innings_id'),
  'P0001', 'FORBIDDEN: not authorized to undo a delivery on this match',
  'an outsider cannot undo a delivery'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}';
select (select client_delivery_id from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted order by seq desc limit 1) as last_cid \gset
select undo_last_delivery(:'innings_id', 'mis-tap');
reset role;
reset request.jwt.claims;

select ok(
  (select is_deleted from deliveries where client_delivery_id = (:'last_cid')::uuid),
  'undo_last_delivery soft-deletes the most recent ball'
);
select is(
  (select edit_type from delivery_edits where delivery_id = (
    select id from deliveries where client_delivery_id = (:'last_cid')::uuid
  )),
  'undo',
  'undo_last_delivery writes an audit row'
);

-- ── edit_delivery ────────────────────────────────────────────────────────

select id as edit_target from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted order by seq limit 1 \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}';
select edit_delivery(:'edit_target', '{"runsOffBat": 2}'::jsonb, 'was actually 2 runs');
reset role;
reset request.jwt.claims;

select ok(
  (select is_deleted from deliveries where id = (:'edit_target')::uuid),
  'edit_delivery soft-deletes the original row'
);
select is(
  (select count(*)::int from deliveries where seq = (select seq from deliveries where id = (:'edit_target')::uuid) and not is_deleted),
  1,
  'exactly one live row now occupies that seq — the corrected one'
);
select is(
  (select runs_batter from deliveries where seq = (select seq from deliveries where id = (:'edit_target')::uuid) and not is_deleted),
  2,
  'the corrected row has the new runs value'
);
select is(
  (select count(*)::int from delivery_edits where delivery_id = (:'edit_target')::uuid and edit_type = 'correct'),
  1,
  'edit_delivery writes a correct-type audit row'
);

-- ── end_innings / complete_match ─────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
select throws_ok(
  format($$ select end_innings('%s', 'overs_complete') $$, :'innings_id'),
  'P0001', 'FORBIDDEN: not authorized to end this innings',
  'an outsider cannot end the innings'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}';
select end_innings(:'innings_id', 'overs_complete');
reset role;
reset request.jwt.claims;

select is(
  (select status from innings where id = (:'innings_id')::uuid), 'completed',
  'end_innings marks the innings completed'
);
select is(
  (select status::text from matches where id = (:'match_id')::uuid), 'innings_break',
  'end_innings moves the match to innings_break'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}';
select complete_match(:'match_id', 'win', '10000000-0000-0000-0000-000000000020', 10, null, 'Scorer Team A won by 10 runs');
reset role;
reset request.jwt.claims;

select is(
  (select status::text from matches where id = (:'match_id')::uuid), 'completed',
  'complete_match marks the match completed'
);
select ok(
  (select is_locked from matches where id = (:'match_id')::uuid),
  'complete_match locks the match'
);

-- MATCH_LOCKED now blocks further scoring, even for the grant holder.
select coalesce(max(seq), 0) as current_seq from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}';
select throws_ok(
  format(
    $$ select record_delivery('{"inningsId":"%s","clientDeliveryId":"%s","expectedSeq":%s,"strikerId":"20000000-0000-0000-0000-000000000081","nonStrikerId":"20000000-0000-0000-0000-000000000082","bowlerId":"20000000-0000-0000-0000-000000000091","runsOffBat":1,"extraType":null,"extraRuns":0}'::jsonb) $$,
    :'innings_id', :'cid8', :'current_seq'
  ),
  'P0001', 'MATCH_LOCKED: this match is locked',
  'a locked match blocks further deliveries, even for the grant holder'
);
reset role;
reset request.jwt.claims;

-- ── super over batting-team convention ──────────────────────────────────
-- A fresh match, unlock-free, to test start_innings' innings-3+ logic in
-- isolation (real end-of-match conditions aren't needed to exercise it).

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select create_match(
  '10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000021',
  '{"oversPerInnings":1,"ballsPerOver":6,"playersPerSide":3,"maxOversPerBowler":1}'::jsonb,
  'Super Over Test Match'
);
reset role;
reset request.jwt.claims;
select id as so_match_id from matches where title = 'Super Over Test Match' \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select set_toss(:'so_match_id', '10000000-0000-0000-0000-000000000020', 'bat');
select set_playing_xi(
  :'so_match_id', '10000000-0000-0000-0000-000000000020',
  array['20000000-0000-0000-0000-000000000080'::uuid, '20000000-0000-0000-0000-000000000081'::uuid, '20000000-0000-0000-0000-000000000082'::uuid],
  '20000000-0000-0000-0000-000000000080', null
);
select set_playing_xi(
  :'so_match_id', '10000000-0000-0000-0000-000000000021',
  array['20000000-0000-0000-0000-000000000090'::uuid, '20000000-0000-0000-0000-000000000091'::uuid, '20000000-0000-0000-0000-000000000092'::uuid],
  '20000000-0000-0000-0000-000000000090', null
);
select start_innings(:'so_match_id'); -- innings 1: team A bats (toss)
select start_innings(:'so_match_id'); -- innings 2: team B bats
select start_innings(:'so_match_id'); -- innings 3 (super over): team B bowled first in innings 1, so bats first here
select start_innings(:'so_match_id'); -- innings 4
reset role;
reset request.jwt.claims;

select is(
  (select batting_team_id from innings where match_id = (:'so_match_id')::uuid and innings_no = 3),
  '10000000-0000-0000-0000-000000000021'::uuid,
  'super over (innings 3) is batted first by the team that bowled first in innings 1'
);
select is(
  (select batting_team_id from innings where match_id = (:'so_match_id')::uuid and innings_no = 4),
  '10000000-0000-0000-0000-000000000020'::uuid,
  'innings 4 flips back to the other team'
);
select ok(
  (select is_super_over from innings where match_id = (:'so_match_id')::uuid and innings_no = 3),
  'innings 3 is flagged is_super_over'
);
select is(
  (select status::text from matches where id = (:'so_match_id')::uuid), 'super_over',
  'the match status reflects the super over'
);

select * from finish();
rollback;
