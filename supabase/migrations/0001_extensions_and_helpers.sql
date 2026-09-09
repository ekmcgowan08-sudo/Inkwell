-- Inkwell schema: extensions, helper functions, and the updated_at trigger
-- used by every table below. Written for Supabase Postgres (which already
-- ships `auth.uid()` via GoTrue). For standalone-Postgres testing outside
-- Supabase, see tests/rls/shim.sql which defines a compatible `auth.uid()`.

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- fuzzy search on names/titles

create schema if not exists inkwell;

-- Generic updated_at maintenance, used via `create trigger ... execute function inkwell.set_updated_at()`.
create or replace function inkwell.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- NOTE: `inkwell.user_owns_project` and `inkwell.user_owns_series` — the
-- root-of-trust checks used by nearly every RLS policy in this schema — are
-- defined in 0003_projects.sql, right after the `projects` and `series`
-- tables they query exist. Postgres parses and validates `LANGUAGE sql`
-- function bodies (including catalog lookups) at CREATE FUNCTION time, so
-- defining them here before those tables exist would fail the migration.
