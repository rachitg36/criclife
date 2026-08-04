-- Phase 9: a team cannot be in two live matches at once.

begin;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'busyA@test.local'),
  ('00000000-0000-0000-0000-0000000000b2'::uuid, 'busyB@test.local');
insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-0000000000a1', 'Busy A', 'BSA', '00000000-0000-0000-0000-0000000000b1'),
  ('10000000-0000-0000-0000-0000000000a2', 'Busy B', 'BSB', '00000000-0000-0000-0000-0000000000b2'),
  ('10000000-0000-0000-0000-0000000000a3', 'Busy C', 'BSC', '00000000-0000-0000-0000-0000000000b1');
insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'BA One'),
  ('20000000-0000-0000-0000-0000000000c2', null, 'BA Two'),
  ('20000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b2', 'BB One'),
  ('20000000-0000-0000-0000-0000000000c4', null, 'BB Two'),
  ('20000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b1', 'BC One'),
  ('20000000-0000-0000-0000-0000000000c6', null, 'BC Two');
insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000c1', 'captain'),
  ('10000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000c2', 'player'),
  ('10000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000c3', 'captain'),
  ('10000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000c4', 'player'),
  ('10000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000c5', 'captain'),
  ('10000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000c6', 'player');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

create function pg_temp.setup(p_match uuid, p_a uuid, p_b uuid, p_pa uuid[], p_pb uuid[])
returns void language plpgsql as $$
begin
  perform set_toss(p_match, p_a, 'bat');
  perform set_playing_xi(p_match, p_a, p_pa, p_pa[1], null);
  perform set_playing_xi(p_match, p_b, p_pb, p_pb[1], null);
end;
$$;

select create_match(
  '10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a2',
  '{"oversPerInnings":5,"ballsPerOver":6,"playersPerSide":2,"maxOversPerBowler":5,"wideRuns":1,"noBallRuns":1,"freeHitAfterNoBall":false}'::jsonb,
  'Busy One'
);
select id as m1 from matches where title = 'Busy One' \gset
select pg_temp.setup((:'m1')::uuid, '10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a2',
  array['20000000-0000-0000-0000-0000000000c1'::uuid,'20000000-0000-0000-0000-0000000000c2'::uuid],
  array['20000000-0000-0000-0000-0000000000c3'::uuid,'20000000-0000-0000-0000-0000000000c4'::uuid]);
select start_innings(:'m1');

-- A second match sharing Busy A must refuse.
select create_match(
  '10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a3',
  '{"oversPerInnings":5,"ballsPerOver":6,"playersPerSide":2,"maxOversPerBowler":5,"wideRuns":1,"noBallRuns":1,"freeHitAfterNoBall":false}'::jsonb,
  'Busy Two'
);
select id as m2 from matches where title = 'Busy Two' \gset
select pg_temp.setup((:'m2')::uuid, '10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a3',
  array['20000000-0000-0000-0000-0000000000c1'::uuid,'20000000-0000-0000-0000-0000000000c2'::uuid],
  array['20000000-0000-0000-0000-0000000000c5'::uuid,'20000000-0000-0000-0000-0000000000c6'::uuid]);

select throws_ok(
  format($$ select start_innings('%s'::uuid) $$, :'m2'),
  'P0001', 'TEAM_BUSY: Busy A is already in a live match. Finish or abandon it first.',
  'a team already playing cannot start a second match, and is named'
);

-- The same match continuing is not a second match. Innings 1 has to *end*
-- first — this used to start innings 2 on top of a live innings 1, which is
-- not a sequence the app can produce and which migration 23 now refuses.
select end_innings(
  (select id from innings where match_id = (:'m1')::uuid and innings_no = 1),
  'all_out'
);
select lives_ok(
  format($$ select start_innings('%s'::uuid) $$, :'m1'),
  'innings 2 of the live match itself still starts, once innings 1 has ended'
);

-- Abandoning the first frees both sides.
select abandon_match(:'m1', 'Rain');
select lives_ok(
  format($$ select start_innings('%s'::uuid) $$, :'m2'),
  'abandoning the first match lets the second start — the rule has an escape hatch'
);

select is(
  (select count(*)::int from matches where status in ('live','innings_break','super_over')
     and (team_a_id = '10000000-0000-0000-0000-0000000000a1'
       or team_b_id = '10000000-0000-0000-0000-0000000000a1')),
  1, 'and Busy A is in exactly one live match again'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
