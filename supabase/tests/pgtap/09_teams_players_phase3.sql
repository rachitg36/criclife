-- Phase 3 RPCs: create_team, create_shadow_player, search_profiles,
-- add_existing_profile_to_team, suggest/respond_to_role_suggestion,
-- transfer_team_ownership, archive_team.
-- docs/03-ROLES-PERMISSIONS.md § 2.2, § 2.3, § 4; docs/10-API-CONTRACT.md § 3.7.

begin;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'newowner@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'hasplayer@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'manager@test.local'),
  ('00000000-0000-0000-0000-0000000000c4', 'outsider@test.local'),
  ('00000000-0000-0000-0000-0000000000c5', 'target-player@test.local'),
  ('00000000-0000-0000-0000-0000000000c6', 'no-player-yet@test.local');

-- ── create_team: anon is rejected ───────────────────────────────────────
set local role anon;
select throws_ok(
  $$ select create_team('Rejected FC', 'REJ') $$,
  'P0001', 'FORBIDDEN: must be signed in to create a team',
  'anon cannot create a team'
);
reset role;

-- ── create_team: no existing player row -> one is minted, owner set ────
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select create_team('New Owner FC', 'NOF');
reset role;
reset request.jwt.claims;

select is(
  (select owner_id from teams where name = 'New Owner FC'),
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'create_team sets owner_id to the caller'
);

select is(
  (select tm.team_role::text from team_members tm
     join teams t on t.id = tm.team_id
     join players pl on pl.id = tm.player_id
    where t.name = 'New Owner FC' and pl.profile_id = '00000000-0000-0000-0000-0000000000c1'),
  'owner',
  'create_team adds the caller as an owner team_member'
);

-- ── create_team: caller already has a players row -> reused, not duplicated ─
insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-0000000000c2', 'Has Player Already');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select create_team('Reused Player FC', 'RPF');
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from players where profile_id = '00000000-0000-0000-0000-0000000000c2'), 1,
  'create_team reuses an existing players row instead of minting a second one'
);

-- ── create_shadow_player: only a team manager may call it ───────────────
insert into players (id, profile_id, full_name) values
  ('20000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-0000000000c3', 'Manager Player');
insert into team_members (team_id, player_id, team_role) values
  ((select id from teams where name = 'New Owner FC'), '20000000-0000-0000-0000-000000000051', 'admin');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}';
select throws_ok(
  format($$ select create_shadow_player('%s', 'Should Fail') $$,
    (select id from teams where name = 'New Owner FC')),
  'P0001', 'FORBIDDEN: not a manager of this team',
  'a non-manager cannot create a shadow player on someone else''s team'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select create_shadow_player((select id from teams where name = 'New Owner FC'), 'Shadow Recruit');
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from players where full_name = 'Shadow Recruit' and claim_code is not null), 1,
  'a manager can create a shadow player with a claim code'
);

select is(
  (select tm.team_role::text from team_members tm
     join players pl on pl.id = tm.player_id
    where pl.full_name = 'Shadow Recruit'),
  'player',
  'the shadow player is added to the team as a plain player'
);

-- ── search_profiles: anon gets nothing back (not an error, just no rows) ─
set local role anon;
select is(
  (select count(*)::int from search_profiles('target-player')), 0,
  'anon search_profiles returns no rows'
);
reset role;

update profiles set handle = 'target_player' where id = '00000000-0000-0000-0000-0000000000c5';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select is(
  (select count(*)::int from search_profiles('target_player')), 1,
  'a signed-in user can find a profile by handle'
);
reset role;
reset request.jwt.claims;

-- ── add_existing_profile_to_team ────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}';
select throws_ok(
  format($$ select add_existing_profile_to_team('%s', '00000000-0000-0000-0000-0000000000c5') $$,
    (select id from teams where name = 'New Owner FC')),
  'P0001', 'FORBIDDEN: not a manager of this team',
  'a non-manager cannot add an existing profile to the team'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select add_existing_profile_to_team(
  (select id from teams where name = 'New Owner FC'), '00000000-0000-0000-0000-0000000000c5'
);
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from team_members tm
     join players pl on pl.id = tm.player_id
    where pl.profile_id = '00000000-0000-0000-0000-0000000000c5'
      and tm.team_id = (select id from teams where name = 'New Owner FC')), 1,
  'add_existing_profile_to_team mints a player row and adds it to the team'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select throws_ok(
  format($$ select add_existing_profile_to_team('%s', '00000000-0000-0000-0000-0000000000c5') $$,
    (select id from teams where name = 'New Owner FC')),
  'P0001', 'ALREADY_MEMBER: this player is already on the team',
  'adding the same profile twice is rejected'
);
reset role;
reset request.jwt.claims;

-- ── suggest_role_change / respond_to_role_suggestion ────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}';
select throws_ok(
  format($$ select suggest_role_change('%s', 'all_rounder') $$,
    (select pl.id from players pl where pl.profile_id = '00000000-0000-0000-0000-0000000000c5')),
  'P0001', 'FORBIDDEN: not a manager of a team this player belongs to',
  'a non-manager cannot suggest a role change'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select suggest_role_change(
  (select pl.id from players pl where pl.profile_id = '00000000-0000-0000-0000-0000000000c5'),
  'all_rounder', 'Looked handy with the ball too'
);
reset role;
reset request.jwt.claims;

select is(
  (select status from role_change_suggestions
    where player_id = (select id from players where profile_id = '00000000-0000-0000-0000-0000000000c5')),
  'pending',
  'suggest_role_change creates a pending suggestion'
);

select is(
  (select count(*)::int from notifications
    where profile_id = '00000000-0000-0000-0000-0000000000c5' and type = 'role_suggestion'),
  1,
  'the target player is notified of the suggestion'
);

-- Someone who is neither the player nor Super Admin cannot resolve it.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select throws_ok(
  format($$ select respond_to_role_suggestion('%s', true) $$,
    (select id from role_change_suggestions
      where player_id = (select id from players where profile_id = '00000000-0000-0000-0000-0000000000c5'))),
  'P0001', 'FORBIDDEN: only the player themself resolves a suggestion',
  'the suggesting manager cannot accept their own suggestion on the player''s behalf'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}';
select respond_to_role_suggestion(
  (select id from role_change_suggestions
    where player_id = (select id from players where profile_id = '00000000-0000-0000-0000-0000000000c5')),
  true
);
reset role;
reset request.jwt.claims;

select is(
  (select primary_role::text from players where profile_id = '00000000-0000-0000-0000-0000000000c5'),
  'all_rounder',
  'accepting the suggestion updates the player''s primary_role'
);

-- role_locked_by_admin blocks even the player from accepting a suggestion.
update players set role_locked_by_admin = true
 where profile_id = '00000000-0000-0000-0000-0000000000c5';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select suggest_role_change(
  (select id from players where profile_id = '00000000-0000-0000-0000-0000000000c5'), 'bowler'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c5","role":"authenticated"}';
select throws_ok(
  format($$ select respond_to_role_suggestion('%s', true) $$,
    (select id from role_change_suggestions
      where player_id = (select id from players where profile_id = '00000000-0000-0000-0000-0000000000c5')
        and status = 'pending')),
  'P0001', 'ROLE_LOCKED: this player''s role is locked by an administrator',
  'a locked role cannot be changed even by accepting a suggestion'
);
reset role;
reset request.jwt.claims;

-- ── transfer_team_ownership ──────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select throws_ok(
  format($$ select transfer_team_ownership('%s', '00000000-0000-0000-0000-0000000000c6') $$,
    (select id from teams where name = 'New Owner FC')),
  'P0001', 'FORBIDDEN: only the current owner may transfer ownership',
  'a manager who is not the owner cannot transfer ownership'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select transfer_team_ownership(
  (select id from teams where name = 'New Owner FC'), '00000000-0000-0000-0000-0000000000c3'
);
reset role;
reset request.jwt.claims;

select is(
  (select owner_id from teams where name = 'New Owner FC'),
  '00000000-0000-0000-0000-0000000000c3'::uuid,
  'transfer_team_ownership updates teams.owner_id'
);

-- ── archive_team: admin-but-not-owner is rejected, owner succeeds ───────
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok(
  format($$ select archive_team('%s') $$, (select id from teams where name = 'New Owner FC')),
  'P0001', 'FORBIDDEN: only the team owner may archive or restore this team',
  'the former owner (now just an admin member) cannot archive the team'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select archive_team((select id from teams where name = 'New Owner FC'));
reset role;
reset request.jwt.claims;

select ok(
  (select is_archived from teams where name = 'New Owner FC'),
  'the current owner can archive the team'
);

select * from finish();
rollback;
