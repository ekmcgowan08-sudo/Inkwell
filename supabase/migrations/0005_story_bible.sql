-- Story Bible: one flexible entry table for characters/locations/lore/objects/
-- organizations/custom types (structured fields live in a jsonb column so the
-- UI can be schema-flexible without a migration per entry type), plus
-- relationships, per-project custom field definitions, confirmed/suggested
-- appearances, and author-approved canon facts.

create table public.story_bible_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_type text not null check (entry_type in ('character', 'location', 'lore', 'object', 'organization', 'custom')),
  custom_type_label text,
  name text not null check (char_length(name) between 1 and 200),
  aliases text[] not null default '{}',
  summary text,
  canon_status text not null default 'draft' check (canon_status in ('canon', 'draft', 'speculative')),
  first_appearance_scene_id uuid references public.scenes(id) on delete set null,
  latest_appearance_scene_id uuid references public.scenes(id) on delete set null,
  image_url text,
  tags text[] not null default '{}',
  notes text,
  fields jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(notes, ''))
  ) stored
);

create index story_bible_entries_project_id_idx on public.story_bible_entries(project_id, entry_type);
create index story_bible_entries_search_idx on public.story_bible_entries using gin(search_vector);
create index story_bible_entries_tags_idx on public.story_bible_entries using gin(tags);
create index story_bible_entries_name_trgm_idx on public.story_bible_entries using gin(name gin_trgm_ops);

create trigger story_bible_entries_set_updated_at before update on public.story_bible_entries
  for each row execute function inkwell.set_updated_at();

alter table public.story_bible_entries enable row level security;
create policy "sbe_select" on public.story_bible_entries for select using (inkwell.user_owns_project(project_id));
create policy "sbe_insert" on public.story_bible_entries for insert with check (inkwell.user_owns_project(project_id));
create policy "sbe_update" on public.story_bible_entries for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "sbe_delete" on public.story_bible_entries for delete using (inkwell.user_owns_project(project_id));

-- Now that story_bible_entries exists, close the loop on scenes' soft
-- references (added as bare uuid columns in 0004 to avoid a forward
-- dependency).
alter table public.scenes
  add constraint scenes_pov_character_fk foreign key (pov_character_id) references public.story_bible_entries(id) on delete set null,
  add constraint scenes_location_fk foreign key (location_id) references public.story_bible_entries(id) on delete set null;

create table public.custom_field_defs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_type text not null check (entry_type in ('character', 'location', 'lore', 'object', 'organization', 'custom')),
  label text not null check (char_length(label) between 1 and 80),
  field_type text not null default 'text' check (field_type in ('text', 'textarea', 'number', 'date', 'select', 'tags')),
  options text[] not null default '{}',
  sort_order integer not null default 0
);

create index custom_field_defs_project_id_idx on public.custom_field_defs(project_id, entry_type);

alter table public.custom_field_defs enable row level security;
create policy "cfd_select" on public.custom_field_defs for select using (inkwell.user_owns_project(project_id));
create policy "cfd_insert" on public.custom_field_defs for insert with check (inkwell.user_owns_project(project_id));
create policy "cfd_update" on public.custom_field_defs for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "cfd_delete" on public.custom_field_defs for delete using (inkwell.user_owns_project(project_id));

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_entry_id uuid not null references public.story_bible_entries(id) on delete cascade,
  to_entry_id uuid not null references public.story_bible_entries(id) on delete cascade,
  relationship_type text not null check (char_length(relationship_type) between 1 and 80),
  direction text not null default 'mutual' check (direction in ('one_way', 'mutual')),
  description text,
  status text not null default 'neutral' check (status in ('alliance', 'conflict', 'neutral', 'romantic', 'familial', 'mixed')),
  changes_over_time jsonb not null default '[]'::jsonb,
  linked_scene_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint relationships_distinct_entries check (from_entry_id <> to_entry_id)
);

create index relationships_project_id_idx on public.relationships(project_id);
create index relationships_from_idx on public.relationships(from_entry_id);
create index relationships_to_idx on public.relationships(to_entry_id);

create trigger relationships_set_updated_at before update on public.relationships
  for each row execute function inkwell.set_updated_at();

alter table public.relationships enable row level security;
create policy "rel_select" on public.relationships for select using (inkwell.user_owns_project(project_id));
create policy "rel_insert" on public.relationships for insert with check (inkwell.user_owns_project(project_id));
create policy "rel_update" on public.relationships for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "rel_delete" on public.relationships for delete using (inkwell.user_owns_project(project_id));

create table public.appearances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_id uuid not null references public.story_bible_entries(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  source text not null default 'author' check (source in ('author', 'ai_suggested')),
  confirmed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (entry_id, scene_id)
);

create index appearances_project_id_idx on public.appearances(project_id);
create index appearances_entry_id_idx on public.appearances(entry_id);
create index appearances_scene_id_idx on public.appearances(scene_id);

alter table public.appearances enable row level security;
create policy "app_select" on public.appearances for select using (inkwell.user_owns_project(project_id));
create policy "app_insert" on public.appearances for insert with check (inkwell.user_owns_project(project_id));
create policy "app_update" on public.appearances for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "app_delete" on public.appearances for delete using (inkwell.user_owns_project(project_id));

create table public.canon_facts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entry_id uuid references public.story_bible_entries(id) on delete set null,
  statement text not null check (char_length(statement) > 0),
  source_scene_id uuid references public.scenes(id) on delete set null,
  approved_by_author boolean not null default false,
  created_by text not null default 'author' check (created_by in ('author', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index canon_facts_project_id_idx on public.canon_facts(project_id, approved_by_author);

create trigger canon_facts_set_updated_at before update on public.canon_facts
  for each row execute function inkwell.set_updated_at();

alter table public.canon_facts enable row level security;
create policy "cf_select" on public.canon_facts for select using (inkwell.user_owns_project(project_id));
create policy "cf_insert" on public.canon_facts for insert with check (inkwell.user_owns_project(project_id));
create policy "cf_update" on public.canon_facts for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "cf_delete" on public.canon_facts for delete using (inkwell.user_owns_project(project_id));
