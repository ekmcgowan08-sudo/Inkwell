-- Integrations (Google Drive et al.), media generation, export/import jobs.
-- OAuth tokens themselves are never stored in these tables — only connection
-- status/metadata. Real tokens live in Supabase Vault or the Edge Function's
-- own encrypted secret store, referenced indirectly. See docs/SECURITY.md.

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_drive', 'dropbox', 'onedrive')),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  scopes text[] not null default '{}',
  external_account_label text,
  connected_at timestamptz,
  last_error text,
  unique (user_id, provider)
);

alter table public.integration_connections enable row level security;
create policy "ic_select" on public.integration_connections for select using (user_id = auth.uid());
create policy "ic_insert" on public.integration_connections for insert with check (user_id = auth.uid());
create policy "ic_update" on public.integration_connections for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ic_delete" on public.integration_connections for delete using (user_id = auth.uid());

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('character_portrait', 'location_concept', 'cover_concept', 'scene_previs_clip')),
  linked_entry_id uuid references public.story_bible_entries(id) on delete set null,
  storage_path text,
  provider text not null,
  prompt_used text not null,
  source_context jsonb not null default '[]'::jsonb,
  rights_notice text not null default 'AI-generated reference image. Not verified for commercial licensing — confirm your provider''s terms before publication use.',
  status text not null default 'queued' check (status in ('queued', 'generating', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index media_assets_project_id_idx on public.media_assets(project_id);

alter table public.media_assets enable row level security;
create policy "ma_select" on public.media_assets for select using (inkwell.user_owns_project(project_id));
create policy "ma_insert" on public.media_assets for insert with check (inkwell.user_owns_project(project_id));
create policy "ma_update" on public.media_assets for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "ma_delete" on public.media_assets for delete using (inkwell.user_owns_project(project_id));

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  provider text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text
);

create index generation_jobs_project_id_idx on public.generation_jobs(project_id);

alter table public.generation_jobs enable row level security;
create policy "gj_select" on public.generation_jobs for select using (inkwell.user_owns_project(project_id));
-- Written by the service role (the media-generate function) only.

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  format text not null check (format in ('docx', 'pdf', 'epub', 'txt', 'markdown', 'inkwell_backup')),
  preset text not null default 'custom' check (preset in ('manuscript_submission', 'review_copy', 'paperback', 'ebook', 'custom')),
  options jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index export_jobs_project_id_idx on public.export_jobs(project_id, created_at desc);

alter table public.export_jobs enable row level security;
create policy "ej_select" on public.export_jobs for select using (inkwell.user_owns_project(project_id));
create policy "ej_insert" on public.export_jobs for insert with check (inkwell.user_owns_project(project_id));
create policy "ej_update" on public.export_jobs for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "ej_delete" on public.export_jobs for delete using (inkwell.user_owns_project(project_id));

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('docx', 'markdown', 'txt', 'inkwell_backup')),
  original_filename text not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'importing', 'succeeded', 'failed', 'partially_failed')),
  detected_chapters integer not null default 0,
  format_warnings jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index import_jobs_user_id_idx on public.import_jobs(user_id, created_at desc);

alter table public.import_jobs enable row level security;
create policy "ij_select" on public.import_jobs for select using (user_id = auth.uid());
create policy "ij_insert" on public.import_jobs for insert with check (user_id = auth.uid());
create policy "ij_update" on public.import_jobs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ij_delete" on public.import_jobs for delete using (user_id = auth.uid());
