-- docs/03-ROLES-PERMISSIONS.md §7 security checklist — the two structural
-- guarantees: RLS is enabled on every table, and every security-definer
-- function pins search_path (so it can't be tricked by a caller's search_path).

begin;
select plan(3);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public'),
  (select count(*)::int from pg_tables t
     join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
    where t.schemaname = 'public' and c.relrowsecurity),
  'every table in public has row level security enabled'
);

select ok(
  not exists (
    select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosecdef -- security definer
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
          where cfg like 'search_path=%'
       )
  ),
  'every security definer function in public pins search_path'
);

select ok(
  exists (
    select 1 from pg_policies
     where tablename = 'deliveries' and cmd = 'DELETE' and qual = 'false'
  ),
  'deliveries has a delete-denying policy (append-only, defence in depth with the trigger)'
);

select * from finish();
rollback;
