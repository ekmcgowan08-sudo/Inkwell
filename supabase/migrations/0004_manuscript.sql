-- Manuscript: parts (optional grouping), chapters, scenes.
-- A scene's canonical content is a JSON rich-text document; `plain_text` is a
-- derived, indexed cache (word counts, search, AI retrieval) recomputed on
-- every save by the application layer, never hand-edited.

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index parts_project_id_idx on public.parts(project_id, sort_order);

create trigger parts_set_updated_at before update on public.parts
  for each row execute function inkwell.set_updated_at();

alter table public.parts enable row level security;
create policy "parts_select" on public.parts for select using (inkwell.user_owns_project(project_id));
create policy "parts_insert" on public.parts for insert with check (inkwell.user_owns_project(project_id));
create policy "parts_update" on public.parts for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "parts_delete" on public.parts for delete using (inkwell.user_owns_project(project_id));

-- CHECK constraints cannot contain a naked subquery, only a function call —
-- so cross-table "same project" invariants below go through small STABLE
-- helper functions rather than inline `exists (select ...)`.
create or replace function inkwell.part_belongs_to_project(p_part_id uuid, p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.parts pt where pt.id = p_part_id and pt.project_id = p_project_id);
$$;

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  part_id uuid references public.parts(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  sort_order integer not null default 0,
  status text not null default 'drafting' check (status in ('drafting', 'needs_revision', 'final')),
  summary text,
  revision integer not null default 0,
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chapters_part_same_project
    check (part_id is null or inkwell.part_belongs_to_project(part_id, project_id))
);

create index chapters_project_id_idx on public.chapters(project_id, sort_order);

create trigger chapters_set_updated_at before update on public.chapters
  for each row execute function inkwell.set_updated_at();

alter table public.chapters enable row level security;
create policy "chapters_select" on public.chapters for select using (inkwell.user_owns_project(project_id));
create policy "chapters_insert" on public.chapters for insert with check (inkwell.user_owns_project(project_id));
create policy "chapters_update" on public.chapters for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "chapters_delete" on public.chapters for delete using (inkwell.user_owns_project(project_id));

create or replace function inkwell.chapter_belongs_to_project(p_chapter_id uuid, p_project_id uuid)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.chapters c where c.id = p_chapter_id and c.project_id = p_project_id);
$$;

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  sort_order integer not null default 0,
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  plain_text text not null default '',
  word_count integer not null default 0,
  pov_character_id uuid,
  location_id uuid,
  in_world_time text,
  story_thread_id uuid,
  status text not null default 'drafting' check (status in ('drafting', 'needs_revision', 'final')),
  revision_priority text check (revision_priority in ('low', 'medium', 'high')),
  color_label text,
  notes text,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(plain_text, ''))) stored,
  constraint scenes_chapter_same_project
    check (inkwell.chapter_belongs_to_project(chapter_id, project_id))
);

create index scenes_project_id_idx on public.scenes(project_id);
create index scenes_chapter_id_idx on public.scenes(chapter_id, sort_order);
create index scenes_search_vector_idx on public.scenes using gin(search_vector);

create trigger scenes_set_updated_at before update on public.scenes
  for each row execute function inkwell.set_updated_at();

alter table public.scenes enable row level security;
create policy "scenes_select" on public.scenes for select using (inkwell.user_owns_project(project_id));
create policy "scenes_insert" on public.scenes for insert with check (inkwell.user_owns_project(project_id));
create policy "scenes_update" on public.scenes for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "scenes_delete" on public.scenes for delete using (inkwell.user_owns_project(project_id));
