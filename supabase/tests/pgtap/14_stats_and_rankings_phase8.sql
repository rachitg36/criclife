-- Phase 8: statistics and rankings. docs/07-STATS-AND-RANKINGS.md.
--
-- Scores a real (tiny) match through the real RPCs, completes it, and checks
-- that the derived numbers are what the spec says they should be. Nothing here
-- inserts a stat directly — that is the whole point of "everything is derived
-- from deliveries".

begin;
select plan(30);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'statsCaptainA@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'statsCaptainB@test.local');

insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000060', 'Stats Team A', 'STA', '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-000000000061', 'Stats Team B', 'STB', '00000000-0000-0000-0000-0000000000c2');

insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000300', '00000000-0000-0000-0000-0000000000c1', 'S Captain'),
  ('20000000-0000-0000-0000-000000000301', null, 'S Striker'),
  ('20000000-0000-0000-0000-000000000302', null, 'S NonStriker'),
  ('20000000-0000-0000-0000-000000000310', '00000000-0000-0000-0000-0000000000c2', 'S OppCaptain'),
  ('20000000-0000-0000-0000-000000000311', null, 'S Bowler'),
  ('20000000-0000-0000-0000-000000000312', null, 'S Fielder');

insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000060', '20000000-0000-0000-0000-000000000300', 'captain'),
  ('10000000-0000-0000-0000-000000000060', '20000000-0000-0000-0000-000000000301', 'player'),
  ('10000000-0000-0000-0000-000000000060', '20000000-0000-0000-0000-000000000302', 'player'),
  ('10000000-0000-0000-0000-000000000061', '20000000-0000-0000-0000-000000000310', 'captain'),
  ('10000000-0000-0000-0000-000000000061', '20000000-0000-0000-0000-000000000311', 'player'),
  ('10000000-0000-0000-0000-000000000061', '20000000-0000-0000-0000-000000000312', 'player');

-- ── pure formula checks, before any match exists ─────────────────────────

select is(public.format_bucket(20), 't20', 'a 20-over game buckets as T20');
select is(public.format_bucket(10), 't10', 'a 10-over game buckets as T10');
select is(public.format_bucket(50), 'odi', 'a 50-over game buckets as ODI');
select is(public.format_bucket(null), 'other', 'an unknown length buckets as other');

select is(
  round(public.batting_points(50, 30, 6, 1, false, true, 't20'), 2),
  -- 50 runs + 6 fours + (1 six x2) + 15 (fifty) + SR bonus + 5 (not out >= 20)
  -- SR = 166.67, par 130 -> (36.67 x 30 / 100) = 11.00
  (50 + 6 + 2 + 15 + 11.00 + 5)::numeric,
  'a fifty scores runs + boundaries + milestone + strike-rate bonus + not-out'
);

select is(
  public.batting_points(0, 3, 0, 0, true, false, 't20'),
  -8::numeric,
  'a duck costs 8, and under 10 balls there is no strike-rate term'
);

select is(
  public.batting_points(0, 3, 0, 0, false, false, 't20'),
  0::numeric,
  'nought not out is not a duck — the penalty needs a dismissal'
);

select ok(
  public.bowling_points(5, 1, 10, 24, 15, 6, 't20')
    > public.bowling_points(5, 1, 10, 24, 40, 6, 't20'),
  'conceding fewer runs for the same wickets scores higher'
);

select is(
  public.fielding_points(2, 1, 1, 2),
  2 * 8 + 1 * 10 + 1 * 10 + 2 * 5::numeric,
  'fielding points follow the docs/07 table exactly'
);

select is(public.clamp(50, 0, 10), 10::numeric, 'clamp holds the ceiling');
select is(public.clamp(-50, 0, 10), 0::numeric, 'clamp holds the floor');

-- ── a real, tiny match ───────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select create_match(
  '10000000-0000-0000-0000-000000000060', '10000000-0000-0000-0000-000000000061',
  '{"oversPerInnings":1,"ballsPerOver":6,"playersPerSide":3,"maxOversPerBowler":1,"wideRuns":1,"noBallRuns":1,"freeHitAfterNoBall":true}'::jsonb,
  'Stats Test Match'
);
select id as match_id from matches where title = 'Stats Test Match' \gset

select set_toss(:'match_id', '10000000-0000-0000-0000-000000000060', 'bat');
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000060',
  array['20000000-0000-0000-0000-000000000300'::uuid, '20000000-0000-0000-0000-000000000301'::uuid, '20000000-0000-0000-0000-000000000302'::uuid],
  '20000000-0000-0000-0000-000000000300', null
);
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000061',
  array['20000000-0000-0000-0000-000000000310'::uuid, '20000000-0000-0000-0000-000000000311'::uuid, '20000000-0000-0000-0000-000000000312'::uuid],
  '20000000-0000-0000-0000-000000000310', null
);
select start_innings(:'match_id');
select id as innings_id from innings where match_id = (:'match_id')::uuid and innings_no = 1 \gset

-- Six balls: 4, 6, dot, 1 wide, dot, caught, 2.
-- Striker 301 throughout except where noted; bowler 311; fielder 312.
select record_delivery(jsonb_build_object(
  'clientDeliveryId', gen_random_uuid(), 'inningsId', :'innings_id', 'expectedSeq', 0,
  'strikerId', '20000000-0000-0000-0000-000000000301', 'nonStrikerId', '20000000-0000-0000-0000-000000000302',
  'bowlerId', '20000000-0000-0000-0000-000000000311',
  'runsOffBat', 4, 'extraType', null, 'extraRuns', 0, 'isBoundary', true, 'wicket', null));

select record_delivery(jsonb_build_object(
  'clientDeliveryId', gen_random_uuid(), 'inningsId', :'innings_id', 'expectedSeq', (select max(seq) from deliveries where innings_id = (:'innings_id')::uuid),
  'strikerId', '20000000-0000-0000-0000-000000000301', 'nonStrikerId', '20000000-0000-0000-0000-000000000302',
  'bowlerId', '20000000-0000-0000-0000-000000000311',
  'runsOffBat', 6, 'extraType', null, 'extraRuns', 0, 'isBoundary', true, 'wicket', null));

select record_delivery(jsonb_build_object(
  'clientDeliveryId', gen_random_uuid(), 'inningsId', :'innings_id', 'expectedSeq', (select max(seq) from deliveries where innings_id = (:'innings_id')::uuid),
  'strikerId', '20000000-0000-0000-0000-000000000301', 'nonStrikerId', '20000000-0000-0000-0000-000000000302',
  'bowlerId', '20000000-0000-0000-0000-000000000311',
  'runsOffBat', 0, 'extraType', null, 'extraRuns', 0, 'isBoundary', false, 'wicket', null));

select record_delivery(jsonb_build_object(
  'clientDeliveryId', gen_random_uuid(), 'inningsId', :'innings_id', 'expectedSeq', (select max(seq) from deliveries where innings_id = (:'innings_id')::uuid),
  'strikerId', '20000000-0000-0000-0000-000000000301', 'nonStrikerId', '20000000-0000-0000-0000-000000000302',
  'bowlerId', '20000000-0000-0000-0000-000000000311',
  'runsOffBat', 0, 'extraType', 'wide', 'extraRuns', 0, 'isBoundary', false, 'wicket', null));

select record_delivery(jsonb_build_object(
  'clientDeliveryId', gen_random_uuid(), 'inningsId', :'innings_id', 'expectedSeq', (select max(seq) from deliveries where innings_id = (:'innings_id')::uuid),
  'strikerId', '20000000-0000-0000-0000-000000000301', 'nonStrikerId', '20000000-0000-0000-0000-000000000302',
  'bowlerId', '20000000-0000-0000-0000-000000000311',
  'runsOffBat', 0, 'extraType', null, 'extraRuns', 0, 'isBoundary', false, 'wicket', null));

select record_delivery(jsonb_build_object(
  'clientDeliveryId', gen_random_uuid(), 'inningsId', :'innings_id', 'expectedSeq', (select max(seq) from deliveries where innings_id = (:'innings_id')::uuid),
  'strikerId', '20000000-0000-0000-0000-000000000301', 'nonStrikerId', '20000000-0000-0000-0000-000000000302',
  'bowlerId', '20000000-0000-0000-0000-000000000311',
  'runsOffBat', 0, 'extraType', null, 'extraRuns', 0, 'isBoundary', false,
  'wicket', jsonb_build_object('type','caught','dismissedPlayerId','20000000-0000-0000-0000-000000000301','fielderId','20000000-0000-0000-0000-000000000312')));

reset role;
reset request.jwt.claims;

-- Derive stats without completing the match, so the assertions below are about
-- the computation rather than the trigger.
select compute_match_stats(:'match_id');

select is(
  (select runs from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000301'),
  10,
  'the striker is credited with 4 + 6 = 10 runs'
);

select is(
  (select balls_faced from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000301'),
  5,
  'a wide is not a ball faced — five of the six deliveries count'
);

select is(
  (select fours from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000301'),
  1, 'one four'
);

select is(
  (select sixes from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000301'),
  1, 'one six'
);

select ok(
  (select is_out from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000301'),
  'the dismissed batter is marked out'
);

select is(
  (select wickets from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000311'),
  1,
  'the bowler is credited with the caught dismissal'
);

select is(
  (select balls_bowled from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000311'),
  5,
  'the wide does not count toward the bowler''s legal balls'
);

select is(
  (select runs_conceded from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000311'),
  11,
  'the bowler is charged 4 + 6 + 1 wide = 11'
);

select is(
  (select catches from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000312'),
  1,
  'the fielder gets the catch'
);

select is(
  (select runs_extras from deliveries
    where match_id = (:'match_id')::uuid and extra_type = 'wide'),
  1,
  'a wide stores the automatic run the config specifies, not the client''s zero'
);

select is(
  (select total_runs from innings where id = (:'innings_id')::uuid),
  11,
  'the innings total includes the automatic wide run'
);

select is(
  (select total_wickets from innings where id = (:'innings_id')::uuid),
  1,
  'only the actual dismissal counts as a wicket, not every delivery'
);

select is(
  (select count(*)::int from deliveries
    where match_id = (:'match_id')::uuid and is_wicket and wicket_type is null),
  0,
  'no delivery is left flagged as a wicket without a dismissal type'
);

select is(
  (select maidens from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000311'),
  0,
  'an over that went for 11 is not a maiden'
);

select ok(
  (select rating_points from player_match_stats where match_id = (:'match_id')::uuid and player_id = '20000000-0000-0000-0000-000000000301') is not null,
  'rating points are filled in by the second pass'
);

-- ── career rollup ────────────────────────────────────────────────────────
-- The match is not completed, so a career rebuild should find nothing: career
-- stats only ever count completed matches.

select rebuild_career_stats('20000000-0000-0000-0000-000000000301');
select is(
  (select matches from player_career_stats where player_id = '20000000-0000-0000-0000-000000000301'),
  0,
  'an in-progress match contributes nothing to career stats'
);

-- ── ranking thresholds ───────────────────────────────────────────────────

select is(
  public.ranking_threshold('overall_min_matches', 5),
  5::numeric,
  'the overall board threshold comes from app_settings'
);

select is(
  public.ranking_threshold('no_such_key', 42),
  42::numeric,
  'an unknown threshold key falls back to the supplied default'
);

select recompute_rankings();
select is(
  (select count(*)::int from ranking_snapshots
    where scope = 'global' and player_id = '20000000-0000-0000-0000-000000000301'),
  0,
  'a player with one incomplete match does not appear on any board'
);

select * from finish();
rollback;
