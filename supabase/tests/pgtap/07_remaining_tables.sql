-- Coverage for the tables not already exercised in depth by 03-06: public
-- read-everywhere tables, app_settings (Super Admin only), and notifications
-- (strictly own-inbox).

begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'super@test.local'),
  ('00000000-0000-0000-0000-0000000000e2', 'alice@test.local'),
  ('00000000-0000-0000-0000-0000000000e3', 'bob@test.local');
update profiles set is_super_admin = true where id = '00000000-0000-0000-0000-0000000000e1';

-- app_settings: anyone can read, only Super Admin can write.
insert into app_settings (id, app_name) values (1, 'CricLife');

set local role anon;
select is(
  (select app_name from app_settings where id = 1), 'CricLife',
  'anon can read app_settings'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
update app_settings set app_name = 'Hijacked' where id = 1;
reset role;
reset request.jwt.claims;

select is(
  (select app_name from app_settings where id = 1), 'CricLife',
  'a plain user cannot write app_settings'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
update app_settings set app_name = 'CricLife Prod' where id = 1;
reset role;
reset request.jwt.claims;

select is(
  (select app_name from app_settings where id = 1), 'CricLife Prod',
  'a Super Admin can write app_settings'
);

-- notifications: strictly the owner's own inbox.
insert into notifications (id, profile_id, type) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', 'grant_issued');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
select is(
  (select count(*)::int from notifications), 0,
  'Bob cannot see Alice''s notifications'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
select is(
  (select count(*)::int from notifications), 1,
  'Alice sees her own notification'
);

update notifications set read_at = now() where id = '60000000-0000-0000-0000-000000000001';
reset role;
reset request.jwt.claims;

select is(
  (select read_at from notifications where id = '60000000-0000-0000-0000-000000000001') is not null,
  true,
  'Alice can mark her own notification read'
);

-- rules_profiles: public read.
insert into rules_profiles (name, config, is_system) values ('T20 Standard', '{"oversPerInnings":20}'::jsonb, true);

set local role anon;
select is(
  (select count(*)::int from rules_profiles), 1,
  'anon can read rules_profiles (needed for the match-setup wizard)'
);
reset role;

select * from finish();
rollback;
