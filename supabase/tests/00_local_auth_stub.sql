-- LOCAL TESTING ONLY. Never run against the real Supabase project, and
-- never put this file under supabase/migrations/ — the real project already
-- has a genuine `auth` schema (owned by GoTrue) and real anon/authenticated/
-- service_role roles with their own grants; this file exists only so the
-- migrations in supabase/migrations/ (which reference auth.users and
-- auth.uid()) and the pgTAP suite can run against a plain local Postgres,
-- without Docker.
--
-- It reproduces, at the SQL level, exactly what Supabase's real stack
-- provides: an `auth.users` table, an `auth.uid()` reading the same
-- `request.jwt.claims` GUC that PostgREST sets from the caller's JWT, and
-- the anon/authenticated/service_role roles with the same default grants.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    current_setting('role')
  );
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;

alter default privileges in schema public
  grant all privileges on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all privileges on sequences to anon, authenticated, service_role;
