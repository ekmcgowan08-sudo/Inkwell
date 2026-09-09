-- Series and Projects (books). A project may optionally belong to a series.

create table public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  cover_color text not null default '#8B3A3A',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index series_user_id_idx on public.series(user_id) where deleted_at is null;

create trigger series_set_updated_at
  before update on public.series
  for each row execute function inkwell.set_updated_at();

alter table public.series enable row level security;

create policy "series_select_own" on public.series for select using (user_id = auth.uid());
create policy "series_insert_own" on public.series for insert with check (user_id = auth.uid());
create policy "series_update_own" on public.series for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "series_delete_own" on public.series for delete using (user_id = auth.uid());

-- Defined here (not in 0001) because `LANGUAGE sql` function bodies are
-- parsed and validated against the catalog at CREATE FUNCTION time, and
-- `public.series` must already exist for that to succeed.
create or replace function inkwell.user_owns_series(p_series_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.series s
    where s.id = p_series_id
      and s.user_id = auth.uid()
  );
$$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid references public.series(id) on delete set null,
  series_order integer,
  title text not null check (char_length(title) between 1 and 200),
  genre text not null default '',
  cover_color text not null default '#8B3A3A',
  cover_image_url text,
  goal_words integer not null default 80000 check (goal_words >= 0),
  daily_goal_words integer not null default 500 check (daily_goal_words >= 0),
  writing_style text not null default 'unset' check (writing_style in ('plotter', 'discovery', 'custom', 'unset')),
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  is_favorite boolean not null default false,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- A project's series, if set, must belong to the same user — enforced here
  -- rather than only in application code, closing an IDOR path where a user
  -- could otherwise attach their project to someone else's series id.
  constraint projects_series_same_owner
    check (series_id is null or inkwell.user_owns_series(series_id))
);

create index projects_user_id_idx on public.projects(user_id) where deleted_at is null;
create index projects_series_id_idx on public.projects(series_id) where series_id is not null;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function inkwell.set_updated_at();

alter table public.projects enable row level security;

create policy "projects_select_own" on public.projects for select using (user_id = auth.uid());
create policy "projects_insert_own" on public.projects for insert with check (user_id = auth.uid());
create policy "projects_update_own" on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "projects_delete_own" on public.projects for delete using (user_id = auth.uid());

-- Root-of-trust check used by nearly every other table's RLS policy in this
-- schema: does the current authenticated user own the project a row belongs
-- to? SECURITY DEFINER is deliberately NOT used — this must run with the
-- caller's own row visibility, which for `projects` is enforced by that
-- table's own RLS policy above, so a cross-user lookup here correctly
-- returns false rather than leaking row existence.
create or replace function inkwell.user_owns_project(p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and p.user_id = auth.uid()
  );
$$;
