-- Phase 9: OAuth identity on the profile, and abandoning a match.

begin;
select plan(16);

-- ── the signup trigger carries a Google identity ─────────────────────────

insert into auth.users (id, email, raw_user_meta_data) values (
  '00000000-0000-0000-0000-0000000000f7'::uuid,
  'googler@test.local',
  '{"full_name":"Goog Ler","avatar_url":"https://lh3.example/pic.jpg"}'::jsonb
);

select is(
  (select display_name from profiles where id = '00000000-0000-0000-0000-0000000000f7'),
  'Goog Ler', 'a Google signup takes its display name from full_name'
);
select is(
  (select avatar_url from profiles where id = '00000000-0000-0000-0000-0000000000f7'),
  'https://lh3.example/pic.jpg', 'and its picture, which nothing ever wrote before'
);
select is(
  (select email::text from profiles where id = '00000000-0000-0000-0000-0000000000f7'),
  'googler@test.local', 'and its address'
);

-- Older providers spell it `picture`.
insert into auth.users (id, email, raw_user_meta_data) values (
  '00000000-0000-0000-0000-0000000000f8'::uuid,
  'pict@test.local',
  '{"name":"Pic Ture","picture":"https://lh3.example/two.jpg"}'::jsonb
);
select is(
  (select avatar_url from profiles where id = '00000000-0000-0000-0000-0000000000f8'),
  'https://lh3.example/two.jpg', 'a `picture` claim works as well as `avatar_url`'
);
select is(
  (select display_name from profiles where id = '00000000-0000-0000-0000-0000000000f8'),
  'Pic Ture', 'and `name` works as well as `full_name`'
);

-- A magic-link signup has no metadata at all and must still work.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f9'::uuid, 'plain@test.local');
select is(
  (select display_name from profiles where id = '00000000-0000-0000-0000-0000000000f9'),
  'plain', 'a signup with no metadata still falls back to the local part'
);
select ok(
  (select avatar_url is null from profiles where id = '00000000-0000-0000-0000-0000000000f9'),
  'and has no avatar rather than an empty string'
);

-- ── linking Google later, and never clobbering a chosen picture ──────────

update auth.users
   set raw_user_meta_data = '{"avatar_url":"https://lh3.example/late.jpg"}'::jsonb
 where id = '00000000-0000-0000-0000-0000000000f9';
select is(
  (select avatar_url from profiles where id = '00000000-0000-0000-0000-0000000000f9'),
  'https://lh3.example/late.jpg',
  'linking an OAuth identity later fills in the picture the signup could not'
);

update profiles set avatar_url = 'https://mine.example/chosen.png'
 where id = '00000000-0000-0000-0000-0000000000f7';
update auth.users
   set raw_user_meta_data = '{"avatar_url":"https://lh3.example/changed.jpg"}'::jsonb
 where id = '00000000-0000-0000-0000-0000000000f7';
select is(
  (select avatar_url from profiles where id = '00000000-0000-0000-0000-0000000000f7'),
  'https://mine.example/chosen.png',
  'a picture the player chose is never overwritten by an OAuth refresh'
);

-- ── abandon_match ────────────────────────────────────────────────────────

insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000090', 'Aband A', 'ABA', '00000000-0000-0000-0000-0000000000f7'),
  ('10000000-0000-0000-0000-000000000091', 'Aband B', 'ABB', '00000000-0000-0000-0000-0000000000f8');
insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000500', '00000000-0000-0000-0000-0000000000f7', 'A Cap'),
  ('20000000-0000-0000-0000-000000000501', null, 'A Two'),
  ('20000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-0000000000f8', 'B Cap'),
  ('20000000-0000-0000-0000-000000000511', null, 'B Two');
insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000090', '20000000-0000-0000-0000-000000000500', 'captain'),
  ('10000000-0000-0000-0000-000000000090', '20000000-0000-0000-0000-000000000501', 'player'),
  ('10000000-0000-0000-0000-000000000091', '20000000-0000-0000-0000-000000000510', 'captain'),
  ('10000000-0000-0000-0000-000000000091', '20000000-0000-0000-0000-000000000511', 'player');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f7","role":"authenticated"}';
select create_match(
  '10000000-0000-0000-0000-000000000090', '10000000-0000-0000-0000-000000000091',
  '{"oversPerInnings":5,"ballsPerOver":6,"playersPerSide":2,"maxOversPerBowler":5,"wideRuns":1,"noBallRuns":1,"freeHitAfterNoBall":true}'::jsonb,
  'Abandon Test Match'
);
select id as match_id from matches where title = 'Abandon Test Match' \gset

select set_toss(:'match_id', '10000000-0000-0000-0000-000000000090', 'bat');
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000090',
  array['20000000-0000-0000-0000-000000000500'::uuid, '20000000-0000-0000-0000-000000000501'::uuid],
  '20000000-0000-0000-0000-000000000500', null
);
select set_playing_xi(
  :'match_id', '10000000-0000-0000-0000-000000000091',
  array['20000000-0000-0000-0000-000000000510'::uuid, '20000000-0000-0000-0000-000000000511'::uuid],
  '20000000-0000-0000-0000-000000000510', null
);
select start_innings(:'match_id');
reset role;
reset request.jwt.claims;

-- An outsider cannot abandon somebody else's match.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f9","role":"authenticated"}';
select throws_ok(
  format($$ select abandon_match('%s'::uuid, 'nice try') $$, :'match_id'),
  'P0001', 'FORBIDDEN: not authorized to abandon this match',
  'only a manager can abandon a match'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f7","role":"authenticated"}';
select abandon_match(:'match_id', '  Rain  ');

select is((select status::text from matches where id = (:'match_id')::uuid), 'abandoned',
  'the match is abandoned');
select is((select result_type::text from matches where id = (:'match_id')::uuid), 'abandoned',
  'and carries an abandoned result');
select is((select result_text from matches where id = (:'match_id')::uuid), 'Rain',
  'the reason is stored, trimmed');
select ok((select is_locked from matches where id = (:'match_id')::uuid),
  'and the match is locked, so no further ball can be scored');
select is(
  (select count(*)::int from innings where match_id = (:'match_id')::uuid and status = 'in_progress'),
  0, 'no innings is left in progress');
select is(
  (select end_reason::text from innings where match_id = (:'match_id')::uuid and innings_no = 1),
  'abandoned', 'the innings records why it ended');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
