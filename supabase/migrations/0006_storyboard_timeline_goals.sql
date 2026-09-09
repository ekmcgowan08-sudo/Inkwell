-- Storyboard, in-story timeline, and real-world writing goals/progress.

create table public.story_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  color text not null default '#C9A227',
  status text not null default 'open' check (status in ('open', 'resolved', 'abandoned_intentionally')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index story_threads_project_id_idx on public.story_threads(project_id, status);

create trigger story_threads_set_updated_at before update on public.story_threads
  for each row execute function inkwell.set_updated_at();

alter table public.story_threads enable row level security;
create policy "st_select" on public.story_threads for select using (inkwell.user_owns_project(project_id));
create policy "st_insert" on public.story_threads for insert with check (inkwell.user_owns_project(project_id));
create policy "st_update" on public.story_threads for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "st_delete" on public.story_threads for delete using (inkwell.user_owns_project(project_id));

alter table public.scenes
  add constraint scenes_story_thread_fk foreign key (story_thread_id) references public.story_threads(id) on delete set null;

create table public.storyboard_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  summary text,
  "column" text not null default 'Act 1',
  sort_order integer not null default 0,
  pov_character_id uuid references public.story_bible_entries(id) on delete set null,
  characters_present uuid[] not null default '{}',
  location_id uuid references public.story_bible_entries(id) on delete set null,
  in_world_time text,
  story_thread_id uuid references public.story_threads(id) on delete set null,
  status text not null default 'drafting' check (status in ('drafting', 'needs_revision', 'final')),
  revision_priority text check (revision_priority in ('low', 'medium', 'high')),
  color_label text,
  notes text,
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index storyboard_cards_project_id_idx on public.storyboard_cards(project_id, "column", sort_order);

create trigger storyboard_cards_set_updated_at before update on public.storyboard_cards
  for each row execute function inkwell.set_updated_at();

alter table public.storyboard_cards enable row level security;
create policy "sc_select" on public.storyboard_cards for select using (inkwell.user_owns_project(project_id));
create policy "sc_insert" on public.storyboard_cards for insert with check (inkwell.user_owns_project(project_id));
create policy "sc_update" on public.storyboard_cards for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "sc_delete" on public.storyboard_cards for delete using (inkwell.user_owns_project(project_id));

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  detail text,
  when_label text not null default '',
  when_date timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  location_id uuid references public.story_bible_entries(id) on delete set null,
  character_ids uuid[] not null default '{}',
  linked_scene_ids uuid[] not null default '{}',
  depends_on_event_ids uuid[] not null default '{}',
  plotline_tag text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index timeline_events_project_id_idx on public.timeline_events(project_id, sort_order);

create trigger timeline_events_set_updated_at before update on public.timeline_events
  for each row execute function inkwell.set_updated_at();

alter table public.timeline_events enable row level security;
create policy "te_select" on public.timeline_events for select using (inkwell.user_owns_project(project_id));
create policy "te_insert" on public.timeline_events for insert with check (inkwell.user_owns_project(project_id));
create policy "te_update" on public.timeline_events for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "te_delete" on public.timeline_events for delete using (inkwell.user_owns_project(project_id));

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly', 'deadline')),
  target_words integer not null check (target_words >= 0),
  deadline timestamptz,
  rest_days smallint[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_project_id_idx on public.goals(project_id) where active;

create trigger goals_set_updated_at before update on public.goals
  for each row execute function inkwell.set_updated_at();

alter table public.goals enable row level security;
create policy "goals_select" on public.goals for select using (inkwell.user_owns_project(project_id));
create policy "goals_insert" on public.goals for insert with check (inkwell.user_owns_project(project_id));
create policy "goals_update" on public.goals for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
create policy "goals_delete" on public.goals for delete using (inkwell.user_owns_project(project_id));

-- Writing sessions capture real elapsed writing time; daily_progress is the
-- persisted, timezone-anchored replacement for the prototype's session-only
-- "words today" calculation.
create table public.writing_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  words_start integer not null default 0,
  words_end integer not null default 0,
  created_at timestamptz not null default now()
);

create index writing_sessions_project_id_idx on public.writing_sessions(project_id, started_at desc);

alter table public.writing_sessions enable row level security;
create policy "ws_select" on public.writing_sessions for select using (user_id = auth.uid() and inkwell.user_owns_project(project_id));
create policy "ws_insert" on public.writing_sessions for insert with check (user_id = auth.uid() and inkwell.user_owns_project(project_id));
create policy "ws_update" on public.writing_sessions for update using (user_id = auth.uid() and inkwell.user_owns_project(project_id)) with check (user_id = auth.uid() and inkwell.user_owns_project(project_id));
create policy "ws_delete" on public.writing_sessions for delete using (user_id = auth.uid() and inkwell.user_owns_project(project_id));

create table public.daily_progress (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  progress_date date not null,
  words_written integer not null default 0,
  goal_met boolean not null default false,
  unique (project_id, progress_date)
);

create index daily_progress_project_id_idx on public.daily_progress(project_id, progress_date desc);

alter table public.daily_progress enable row level security;
create policy "dp_select" on public.daily_progress for select using (user_id = auth.uid() and inkwell.user_owns_project(project_id));
create policy "dp_insert" on public.daily_progress for insert with check (user_id = auth.uid() and inkwell.user_owns_project(project_id));
create policy "dp_update" on public.daily_progress for update using (user_id = auth.uid() and inkwell.user_owns_project(project_id)) with check (user_id = auth.uid() and inkwell.user_owns_project(project_id));
create policy "dp_delete" on public.daily_progress for delete using (user_id = auth.uid() and inkwell.user_owns_project(project_id));
