-- docs/03-ROLES-PERMISSIONS.md § 2.3 — claiming a shadow player.

begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'claimant@test.local'),
  ('00000000-0000-0000-0000-0000000000f2', 'other@test.local');

insert into players (id, profile_id, full_name, claim_code) values
  ('20000000-0000-0000-0000-000000000040', null, 'Shadow Player', 'CLAIM-XYZ');

-- Anonymous cannot claim.
set local role anon;
select throws_ok(
  $$ select claim_player('CLAIM-XYZ') $$,
  'P0001', 'FORBIDDEN: must be signed in to claim a player record',
  'anon cannot claim a player record'
);
reset role;

-- Wrong code fails.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select throws_ok(
  $$ select claim_player('WRONG-CODE') $$,
  'P0001', 'CLAIM_CODE_INVALID: no unclaimed player matches this code',
  'a wrong or already-claimed code is rejected'
);

-- The right code claims it.
select claim_player('CLAIM-XYZ');
reset role;
reset request.jwt.claims;

select is(
  (select profile_id from players where id = '20000000-0000-0000-0000-000000000040'),
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  'the claiming profile now owns the player record'
);

select ok(
  (select claimed_at from players where id = '20000000-0000-0000-0000-000000000040') is not null,
  'claimed_at is recorded'
);

-- Once claimed, nobody else can claim the same code again.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
select throws_ok(
  $$ select claim_player('CLAIM-XYZ') $$,
  'P0001', 'CLAIM_CODE_INVALID: no unclaimed player matches this code',
  'a second claim attempt on the same code fails — it is no longer unclaimed'
);
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
