-- Phase 6: record_deliveries_batch, the endpoint the offline sync worker
-- drains its Dexie queue against. docs/10-API-CONTRACT.md § 3.2.

begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000101', 'batchCaptainA@test.local'),
  ('00000000-0000-0000-0000-000000000102', 'batchCaptainB@test.local'),
  ('00000000-0000-0000-0000-000000000103', 'batchOutsider@test.local'),
  ('00000000-0000-0000-0000-000000000104', 'batchScorer@test.local');

insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000030', 'Batch Team A', 'BTA', '00000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000031', 'Batch Team B', 'BTB', '00000000-0000-0000-0000-000000000102');

insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000180', '00000000-0000-0000-0000-000000000101', 'BA Captain'),
  ('20000000-0000-0000-0000-000000000181', null, 'BA Striker'),
  ('20000000-0000-0000-0000-000000000182', null, 'BA NonStriker'),
  ('20000000-0000-0000-0000-000000000190', '00000000-0000-0000-0000-000000000102', 'BB Captain'),
  ('20000000-0000-0000-0000-000000000191', null, 'BB Bowler1'),
  ('20000000-0000-0000-0000-000000000192', null, 'BB Bowler2');

insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000180', 'captain'),
  ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000181', 'player'),
  ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000182', 'player'),
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000190', 'captain'),
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000191', 'player'),
  ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000192', 'player');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}';
select create_match(
  '10000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000031',
  '{"oversPerInnings":2,"ballsPerOver":6,"playersPerSide":3,"maxOversPerBowler":1,"wideRuns":1,"noBallRuns":1,"freeHitAfterNoBall":true}'::jsonb,
  'Batch Sync Test Match'
);
reset role;
reset request.jwt.claims;
select id as match_id from matches where title = 'Batch Sync Test Match' \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}';
select issue_scoring_grant(:'match_id', '00000000-0000-0000-0000-000000000104');
select set_toss(:'match_id', '10000000-0000-0000-0000-000000000030', 'bat');
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000030',
  array['20000000-0000-0000-0000-000000000180'::uuid, '20000000-0000-0000-0000-000000000181'::uuid, '20000000-0000-0000-0000-000000000182'::uuid],
  '20000000-0000-0000-0000-000000000180', null
);
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000031',
  array['20000000-0000-0000-0000-000000000190'::uuid, '20000000-0000-0000-0000-000000000191'::uuid, '20000000-0000-0000-0000-000000000192'::uuid],
  '20000000-0000-0000-0000-000000000190', null
);
select start_innings(:'match_id');
reset role;
reset request.jwt.claims;

select id as innings_id from innings where match_id = (:'match_id')::uuid and innings_no = 1 \gset

-- ── record_deliveries_batch: happy path ──────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}';
select throws_ok(
  format(
    $$ select record_deliveries_batch('{"inningsId":"%s","expectedSeq":0,"deliveries":[
      {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000181","nonStrikerId":"20000000-0000-0000-0000-000000000182","bowlerId":"20000000-0000-0000-0000-000000000191","runsOffBat":1,"extraType":null,"extraRuns":0}
    ]}'::jsonb) $$,
    :'innings_id', gen_random_uuid()
  ),
  'P0001', 'NO_GRANT: you do not hold an active scoring grant for this match',
  'an outsider cannot submit a batch'
);
reset role;
reset request.jwt.claims;

select gen_random_uuid() as bcid1 \gset
select gen_random_uuid() as bcid2 \gset
select gen_random_uuid() as bcid3 \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000104","role":"authenticated"}';

select record_deliveries_batch(format(
  '{"inningsId":"%s","expectedSeq":0,"deliveries":[
    {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000181","nonStrikerId":"20000000-0000-0000-0000-000000000182","bowlerId":"20000000-0000-0000-0000-000000000191","runsOffBat":1,"extraType":null,"extraRuns":0},
    {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000182","nonStrikerId":"20000000-0000-0000-0000-000000000181","bowlerId":"20000000-0000-0000-0000-000000000191","runsOffBat":4,"extraType":null,"extraRuns":0,"isBoundary":true},
    {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000182","nonStrikerId":"20000000-0000-0000-0000-000000000181","bowlerId":"20000000-0000-0000-0000-000000000191","runsOffBat":0,"extraType":null,"extraRuns":0}
  ]}',
  :'innings_id', :'bcid1', :'bcid2', :'bcid3')::jsonb) as batch1_result \gset

select is(
  (select count(*)::int from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  3, 'a 3-ball batch inserts exactly 3 rows'
);
select is(
  (:'batch1_result'::jsonb->'stoppedAt')::text, 'null',
  'a fully successful batch has no stoppedAt'
);
select is(
  jsonb_array_length(:'batch1_result'::jsonb->'results'), 3,
  'the batch returns one result per item'
);

-- ── STALE_SEQ: the whole batch is rejected up front ──────────────────────

select throws_ok(
  format(
    $$ select record_deliveries_batch('{"inningsId":"%s","expectedSeq":0,"deliveries":[
      {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000181","nonStrikerId":"20000000-0000-0000-0000-000000000182","bowlerId":"20000000-0000-0000-0000-000000000191","runsOffBat":1,"extraType":null,"extraRuns":0}
    ]}'::jsonb) $$,
    :'innings_id', gen_random_uuid()
  ),
  'P0001', null,
  'a stale expectedSeq rejects the whole batch'
);
select is(
  (select count(*)::int from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  3, 'the rejected batch inserted nothing'
);

-- ── A duplicate mid-batch doesn't stop it ────────────────────────────────

select coalesce(max(seq), 0) as seq_after_batch1
  from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset
select gen_random_uuid() as bcid4 \gset
select gen_random_uuid() as bcid5 \gset

select record_deliveries_batch(format(
  '{"inningsId":"%s","expectedSeq":%s,"deliveries":[
    {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000181","nonStrikerId":"20000000-0000-0000-0000-000000000182","bowlerId":"20000000-0000-0000-0000-000000000191","runsOffBat":4,"extraType":null,"extraRuns":0,"isBoundary":true},
    {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000181","nonStrikerId":"20000000-0000-0000-0000-000000000182","bowlerId":"20000000-0000-0000-0000-000000000191","runsOffBat":1,"extraType":null,"extraRuns":0},
    {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000182","nonStrikerId":"20000000-0000-0000-0000-000000000181","bowlerId":"20000000-0000-0000-0000-000000000191","runsOffBat":2,"extraType":null,"extraRuns":0}
  ]}',
  :'innings_id', :'seq_after_batch1', :'bcid2', :'bcid4', :'bcid5')::jsonb) as batch2_result \gset

select ok(
  ((:'batch2_result'::jsonb->'results'->0->>'duplicate')::boolean),
  'replaying an already-synced clientDeliveryId mid-batch is flagged as a duplicate'
);
select is(
  (select count(*)::int from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  5, 'the two genuinely new items after the duplicate were still inserted'
);

-- ── A hard error mid-batch stops it, but keeps earlier successes ────────
-- 5 legal balls exist already, so item 0 (bowler 191) is the 6th and final
-- ball of over 1. Item 1 hands over to bowler 192 to open over 2 with a
-- no-ball — legal, and sets up a free hit. Item 2 is a bowled wicket, which
-- is not a legal dismissal on that free hit, so it's the one that fails.

select coalesce(max(seq), 0) as seq_after_batch2
  from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted \gset
select gen_random_uuid() as bcid6 \gset
select gen_random_uuid() as bcid7 \gset
select gen_random_uuid() as bcid8 \gset

select record_deliveries_batch(format(
  '{"inningsId":"%s","expectedSeq":%s,"deliveries":[
    {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000181","nonStrikerId":"20000000-0000-0000-0000-000000000182","bowlerId":"20000000-0000-0000-0000-000000000191","runsOffBat":1,"extraType":null,"extraRuns":0},
    {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000182","nonStrikerId":"20000000-0000-0000-0000-000000000181","bowlerId":"20000000-0000-0000-0000-000000000192","runsOffBat":0,"extraType":"no_ball","extraRuns":0},
    {"clientDeliveryId":"%s","strikerId":"20000000-0000-0000-0000-000000000182","nonStrikerId":"20000000-0000-0000-0000-000000000181","bowlerId":"20000000-0000-0000-0000-000000000192","runsOffBat":0,"extraType":null,"extraRuns":0,"wicket":{"type":"bowled","dismissedPlayerId":"20000000-0000-0000-0000-000000000182"}}
  ]}',
  :'innings_id', :'seq_after_batch2', :'bcid6', :'bcid7', :'bcid8')::jsonb) as batch3_result \gset

select is(
  (:'batch3_result'::jsonb->>'stoppedAt')::int, 2,
  'the batch stops at the failing item''s index'
);
select is(
  (:'batch3_result'::jsonb->'results'->2->'error'->>'code'), 'ILLEGAL_DISMISSAL',
  'the stopping item''s error code is surfaced'
);
select is(
  (select count(*)::int from deliveries where innings_id = (:'innings_id')::uuid and not is_deleted),
  7, 'the two items before the failure were still inserted despite the batch stopping'
);

select * from finish();
rollback;
