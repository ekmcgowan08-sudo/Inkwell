-- Minimal stand-in for the parts of Supabase's `auth` schema our migrations
-- depend on (auth.users, auth.uid()), so the real migrations in
-- supabase/migrations/ can be exercised against a plain Postgres container
-- in CI/local tests without running the full Supabase stack. This file is
-- NEVER applied to a real Supabase project — Supabase already provides a
-- real, GoTrue-backed version of all of this.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Real Supabase sets `request.jwt.claims` per-request from the verified JWT.
-- Tests simulate a specific signed-in user with:
--   select set_config('request.jwt.claims', json_build_object('sub', '<uuid>')::text, true);
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid;
$$;

-- Supabase also grants a policy-bypassing role for its own service key.
-- Tests use this to seed data across "users" the way our Edge Functions do.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role bypassrls;
  end if;
end
$$;

-- Real Supabase projects grant schema usage on `auth` to these roles as
-- part of standard provisioning; replicate that here so `auth.uid()` is
-- callable by the `authenticated` role in this shim, same as production.
grant usage on schema auth to authenticated, service_role;
