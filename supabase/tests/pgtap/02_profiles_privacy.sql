-- docs/03-ROLES-PERMISSIONS.md §6/§7 — profiles is never publicly readable,
-- self can read/update own row, nobody can self-promote to Super Admin.

begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'alice@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'bob@test.local');

-- handle_new_user already inserted plain profiles; promote the admin one directly.
update profiles set is_super_admin = true where id = '00000000-0000-0000-0000-00000000000a';

set local role anon;
select is(
  (select count(*)::int from profiles), 0,
  'anon reads zero rows from profiles — never publicly readable'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select count(*)::int from profiles), 1,
  'Alice sees exactly one profile row: her own'
);

select is(
  (select display_name from profiles limit 1), 'alice',
  'the one row Alice sees is actually her own'
);

update profiles set display_name = 'Alice Renamed' where id = '00000000-0000-0000-0000-00000000000b';
select is(
  (select display_name from profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'Alice Renamed',
  'Alice can update her own display_name'
);

select throws_ok(
  $$ update profiles set is_super_admin = true where id = '00000000-0000-0000-0000-00000000000b' $$,
  'P0001',
  'FORBIDDEN: only a Super Admin may change is_super_admin',
  'Alice cannot self-promote to Super Admin'
);

reset role;
reset request.jwt.claims;

-- Super Admin can update anyone's profile, including granting adminship.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
update profiles set is_super_admin = true where id = '00000000-0000-0000-0000-00000000000c';
reset role;
reset request.jwt.claims;

select is(
  (select is_super_admin from profiles where id = '00000000-0000-0000-0000-00000000000c'),
  true,
  'a Super Admin can promote another profile'
);

select * from finish();
rollback;
