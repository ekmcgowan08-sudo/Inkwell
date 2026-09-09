-- Version history, named snapshots, and soft-delete recovery.

create table public.document_revisions (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  revision integer not null,
  content jsonb not null,
  plain_text text not null default '',
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by text not null default 'autosave' check (created_by in ('autosave', 'manual_snapshot', 'restore', 'import')),
  unique (scene_id, revision)
);

create index document_revisions_scene_id_idx on public.document_revisions(scene_id, revision desc);

alter table public.document_revisions enable row level security;
create policy "dr_select" on public.document_revisions for select using (inkwell.user_owns_project(project_id));
create policy "dr_insert" on public.document_revisions for insert with check (inkwell.user_owns_project(project_id));
-- Revisions are an append-only audit trail: no update or delete policy, so
-- even the owning author can only add new revisions, never rewrite history.

create table public.named_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index named_snapshots_project_id_idx on public.named_snapshots(project_id, created_at desc);

alter table public.named_snapshots enable row level security;
create policy "ns_select" on public.named_snapshots for select using (inkwell.user_owns_project(project_id));
create policy "ns_insert" on public.named_snapshots for insert with check (inkwell.user_owns_project(project_id));
create policy "ns_delete" on public.named_snapshots for delete using (inkwell.user_owns_project(project_id));

-- Soft-delete recovery bin: application code writes here before hard-deleting
-- a row so "delete with recovery window" can restore it; a scheduled job
-- (or the export/cleanup edge function) purges rows past purge_after.
create table public.deleted_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  snapshot jsonb not null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default (now() + interval '30 days')
);

create index deleted_items_user_id_idx on public.deleted_items(user_id, purge_after);
create index deleted_items_project_id_idx on public.deleted_items(project_id);

alter table public.deleted_items enable row level security;
create policy "di_select" on public.deleted_items for select using (user_id = auth.uid());
create policy "di_insert" on public.deleted_items for insert with check (user_id = auth.uid());
create policy "di_delete" on public.deleted_items for delete using (user_id = auth.uid());
