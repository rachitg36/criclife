-- Phase 4 RPCs: create_match, set_toss, set_playing_xi, start_innings,
-- issue/revoke/transfer_scoring_grant, create/redeem_handoff_token.
-- docs/03-ROLES-PERMISSIONS.md § 3, docs/10-API-CONTRACT.md § 3.5-3.6.

begin;
select plan(33);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'captainA4@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'captainB4@test.local'),
  ('00000000-0000-0000-0000-0000000000d3', 'outsider4@test.local'),
  ('00000000-0000-0000-0000-0000000000d4', 'scorerA4@test.local'),
  ('00000000-0000-0000-0000-0000000000d5', 'scorerB4@test.local');

insert into teams (id, name, short_code, owner_id) values
  ('10000000-0000-0000-0000-000000000010', 'Delhi Titans', 'DEL', '00000000-0000-0000-0000-0000000000d1'),
  ('10000000-0000-0000-0000-000000000011', 'Pune Riders', 'PUN', '00000000-0000-0000-0000-0000000000d2');

insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000070', '00000000-0000-0000-0000-0000000000d1', 'Captain A'),
  ('20000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-0000000000d2', 'Captain B'),
  ('20000000-0000-0000-0000-000000000072', null, 'Batter A2'),
  ('20000000-0000-0000-0000-000000000073', null, 'Batter A3'),
  ('20000000-0000-0000-0000-000000000074', null, 'Bowler B2'),
  ('20000000-0000-0000-0000-000000000075', null, 'Bowler B3');

insert into team_members (team_id, player_id, team_role) values
  ('10000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000070', 'captain'),
  ('10000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000072', 'player'),
  ('10000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000073', 'player'),
  ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000071', 'captain'),
  ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000074', 'player'),
  ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000075', 'player');

-- ── create_match ─────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select throws_ok(
  $$ select create_match(
       '10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000011',
       '{"oversPerInnings":20}'::jsonb
     ) $$,
  'P0001', 'FORBIDDEN: must manage one of the two teams to create a match',
  'an outsider cannot create a match between two other teams'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select create_match(
  '10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000011',
  '{"oversPerInnings":20,"ballsPerOver":6,"playersPerSide":2}'::jsonb, 'Season Opener'
);
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from matches where title = 'Season Opener'), 1,
  'a team captain can create a match'
);

select is(
  (select g.status::text from scoring_grants g
     join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d1'),
  'active',
  'create_match issues the creator an initial active grant'
);

select ok(
  (select can_delegate from scoring_grants g
     join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d1'),
  'the initial owner grant can delegate'
);

-- ── set_toss ─────────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select throws_ok(
  format($$ select set_toss('%s', '10000000-0000-0000-0000-000000000010', 'bat') $$,
    (select id from matches where title = 'Season Opener')),
  'P0001', 'FORBIDDEN: not authorized to set the toss for this match',
  'an outsider cannot set the toss'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok(
  format($$ select set_toss('%s', '10000000-0000-0000-0000-000000000010', 'field') $$,
    (select id from matches where title = 'Season Opener')),
  'P0001', 'INVALID_DECISION: decision must be bat or bowl',
  'an invalid toss decision is rejected'
);
select throws_ok(
  format($$ select set_toss('%s', '10000000-0000-0000-0000-000000000099', 'bat') $$,
    (select id from matches where title = 'Season Opener')),
  'P0001', 'INVALID_TEAM: toss winner must be one of the two teams in this match',
  'a team not in this match cannot be the toss winner'
);
select set_toss(
  (select id from matches where title = 'Season Opener'),
  '10000000-0000-0000-0000-000000000010', 'bat'
);
reset role;
reset request.jwt.claims;

select is(
  (select status::text from matches where title = 'Season Opener'), 'toss',
  'set_toss moves the match to toss status'
);

-- ── set_playing_xi ───────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select throws_ok(
  format($$ select set_playing_xi('%s', '10000000-0000-0000-0000-000000000010',
       array['20000000-0000-0000-0000-000000000070'::uuid], null, null) $$,
    (select id from matches where title = 'Season Opener')),
  'P0001', 'FORBIDDEN: not authorized to set the playing XI for this match',
  'an outsider cannot set a playing XI'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok(
  format($$ select set_playing_xi('%s', '10000000-0000-0000-0000-000000000010',
       array['20000000-0000-0000-0000-000000000070'::uuid, '20000000-0000-0000-0000-000000000072'::uuid],
       '20000000-0000-0000-0000-000000000099', null) $$,
    (select id from matches where title = 'Season Opener')),
  'P0001', 'INVALID_CAPTAIN: captain must be in the playing XI',
  'a captain who is not in the chosen XI is rejected'
);

select set_playing_xi(
  (select id from matches where title = 'Season Opener'),
  '10000000-0000-0000-0000-000000000010',
  array['20000000-0000-0000-0000-000000000070'::uuid, '20000000-0000-0000-0000-000000000072'::uuid],
  '20000000-0000-0000-0000-000000000070', null
);
select set_playing_xi(
  (select id from matches where title = 'Season Opener'),
  '10000000-0000-0000-0000-000000000011',
  array['20000000-0000-0000-0000-000000000071'::uuid, '20000000-0000-0000-0000-000000000074'::uuid],
  '20000000-0000-0000-0000-000000000071', '20000000-0000-0000-0000-000000000074'
);
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from match_squads ms join matches m on m.id = ms.match_id
    where m.title = 'Season Opener' and ms.team_id = '10000000-0000-0000-0000-000000000010'),
  2,
  'set_playing_xi writes the chosen XI for team A'
);

select ok(
  (select is_captain from match_squads ms join matches m on m.id = ms.match_id
    where m.title = 'Season Opener' and ms.player_id = '20000000-0000-0000-0000-000000000070'),
  'the designated captain is flagged'
);

select ok(
  (select is_wicket_keeper from match_squads ms join matches m on m.id = ms.match_id
    where m.title = 'Season Opener' and ms.player_id = '20000000-0000-0000-0000-000000000074'),
  'the designated keeper is flagged'
);

-- ── start_innings ────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select start_innings((select id from matches where title = 'Season Opener'));
reset role;
reset request.jwt.claims;

select is(
  (select status::text from matches where title = 'Season Opener'), 'live',
  'start_innings moves the match to live'
);

select is(
  (select batting_team_id from innings i join matches m on m.id = i.match_id
    where m.title = 'Season Opener' and i.innings_no = 1),
  '10000000-0000-0000-0000-000000000010'::uuid,
  'the toss winner who chose to bat becomes the first batting team'
);

-- start_innings without a toss/XI fails (fresh match with no setup at all).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select create_match(
  '10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000011',
  '{"oversPerInnings":20}'::jsonb, 'No Toss Yet'
);
select throws_ok(
  format($$ select start_innings('%s') $$, (select id from matches where title = 'No Toss Yet')),
  'P0001', 'TOSS_REQUIRED: set the toss before starting the innings',
  'start_innings refuses to start before a toss is recorded'
);
reset role;
reset request.jwt.claims;

-- ── issue / revoke / transfer scoring grants ────────────────────────────

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select throws_ok(
  format($$ select issue_scoring_grant('%s', '00000000-0000-0000-0000-0000000000d4') $$,
    (select id from matches where title = 'Season Opener')),
  'P0001', 'FORBIDDEN: not authorized to issue scoring grants for this match',
  'an outsider cannot issue a scoring grant'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select issue_scoring_grant((select id from matches where title = 'Season Opener'), '00000000-0000-0000-0000-0000000000d4');
select throws_ok(
  format($$ select issue_scoring_grant('%s', '00000000-0000-0000-0000-0000000000d4') $$,
    (select id from matches where title = 'Season Opener')),
  'P0001', 'ALREADY_GRANTED: this person already holds an active grant for this match',
  'issuing a duplicate active grant is rejected'
);
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from notifications
    where profile_id = '00000000-0000-0000-0000-0000000000d4' and type = 'grant_issued'),
  1,
  'the grantee is notified of the new grant'
);

-- The grant holder transfers to another scorer, keeping their own too.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}';
select transfer_scoring_grant(
  (select g.id from scoring_grants g join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d4'),
  '00000000-0000-0000-0000-0000000000d5', true
);
reset role;
reset request.jwt.claims;

select is(
  (select g.status::text from scoring_grants g join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d4'),
  'active',
  'keep_mine=true leaves the original grant active (an issue, not a transfer)'
);
select is(
  (select g.status::text from scoring_grants g join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d5'),
  'active',
  'the new holder gets an active grant'
);

-- Now a real transfer (keep_mine=false, default) — old grant becomes transferred.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d5","role":"authenticated"}';
select transfer_scoring_grant(
  (select g.id from scoring_grants g join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d5'),
  '00000000-0000-0000-0000-0000000000d3'
);
reset role;
reset request.jwt.claims;

select is(
  (select g.status::text from scoring_grants g join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d5'),
  'transferred',
  'a real transfer marks the old grant transferred'
);
select ok(
  (select transferred_to_grant_id is not null from scoring_grants g join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d5'),
  'the old grant records which new grant it transferred to'
);

-- Revoke. Use the team manager (d1, passes can_manage_match) to isolate the
-- NOT_ACTIVE check from the separate authorization check.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok(
  format($$ select revoke_scoring_grant('%s') $$,
    (select g.id from scoring_grants g join matches m on m.id = g.match_id
      where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d5')),
  'P0001', 'NOT_ACTIVE: this grant is already transferred',
  'a non-active grant cannot be revoked again'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select revoke_scoring_grant(
  (select g.id from scoring_grants g join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d3')
);
reset role;
reset request.jwt.claims;

select is(
  (select g.status::text from scoring_grants g join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d3'),
  'revoked',
  'a holder can revoke their own grant'
);
select is(
  (select count(*)::int from notifications
    where profile_id = '00000000-0000-0000-0000-0000000000d3' and type = 'grant_revoked'),
  1,
  'the (former) holder is notified of the revocation'
);

-- ── handoff tokens ───────────────────────────────────────────────────────

set local role anon;
select throws_ok(
  format($$ select create_handoff_token('%s') $$, (select id from matches where title = 'Season Opener')),
  'P0001', null,
  'anon cannot create a handoff token'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select create_handoff_token((select id from matches where title = 'Season Opener'), 300);
reset role;
reset request.jwt.claims;

select is((select count(*)::int from handoff_tokens), 1, 'create_handoff_token stores one token');

-- handoff_tokens has zero SELECT policies by design (only the two RPCs ever
-- touch it) — capture the token here, as the unrestricted connecting role,
-- rather than re-querying it as `authenticated` later, which would
-- correctly see nothing.
select token as tok from handoff_tokens limit 1 \gset

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select redeem_handoff_token(:'tok');
reset role;
reset request.jwt.claims;

select is(
  (select g.status::text from scoring_grants g join matches m on m.id = g.match_id
    where m.title = 'Season Opener' and g.grantee_profile_id = '00000000-0000-0000-0000-0000000000d2'),
  'active',
  'redeeming a valid handoff token grants the redeemer scoring rights'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select throws_ok(
  'select redeem_handoff_token(' || quote_literal(:'tok') || ')',
  'P0001', 'TOKEN_INVALID: this handoff link has expired or was already used',
  'a handoff token cannot be redeemed twice'
);
reset role;
reset request.jwt.claims;

-- ── get_match_grants — the Scoring Rights Map's read path ──────────────

-- d3 is not a manager, but DID hold (and lost) a grant earlier in this
-- file — get_match_grants should show exactly that one row, not the
-- whole match's grant history.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select is(
  (select count(*)::int from get_match_grants((select id from matches where title = 'Season Opener'))),
  1,
  'a non-manager sees only their own grant row via get_match_grants, not the whole match'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select ok(
  (select count(*)::int from get_match_grants((select id from matches where title = 'Season Opener'))) > 0,
  'the match manager sees grants via get_match_grants'
);
select is(
  (select grantee_display_name from get_match_grants((select id from matches where title = 'Season Opener'))
    where grantee_profile_id = '00000000-0000-0000-0000-0000000000d1' limit 1),
  (select display_name from profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  'get_match_grants surfaces the grantee''s display name, which profiles RLS would otherwise hide'
);
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
