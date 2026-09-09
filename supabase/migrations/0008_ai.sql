-- AI: conversations, messages, findings, usage tracking, and the indexed
-- document-chunk table the ai-assistant Edge Function retrieves from. Every
-- indexed row carries both project_id and user_id, and RLS enforces both, so
-- a bug that forgets one filter in application code still cannot leak
-- another project's content (see docs/AI_ARCHITECTURE.md "defense in depth").

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null default 'project' check (scope in ('project', 'series')),
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_project_id_idx on public.ai_conversations(project_id, updated_at desc);

create trigger ai_conversations_set_updated_at before update on public.ai_conversations
  for each row execute function inkwell.set_updated_at();

alter table public.ai_conversations enable row level security;
create policy "aic_select" on public.ai_conversations for select using (user_id = auth.uid() and inkwell.user_owns_project(project_id));
create policy "aic_insert" on public.ai_conversations for insert with check (user_id = auth.uid() and inkwell.user_owns_project(project_id));
create policy "aic_update" on public.ai_conversations for update using (user_id = auth.uid() and inkwell.user_owns_project(project_id)) with check (user_id = auth.uid() and inkwell.user_owns_project(project_id));
create policy "aic_delete" on public.ai_conversations for delete using (user_id = auth.uid() and inkwell.user_owns_project(project_id));

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  mode text not null default 'ask',
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  context_summary jsonb not null default '[]'::jsonb,
  groundedness text check (groundedness in ('established', 'inference', 'not_established', 'mixed')),
  tokens_input integer not null default 0,
  tokens_output integer not null default 0,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_id_idx on public.ai_messages(conversation_id, created_at);

alter table public.ai_messages enable row level security;
create policy "aim_select" on public.ai_messages for select using (inkwell.user_owns_project(project_id));
-- Inserts happen only via the service-role key inside the Edge Function
-- (which bypasses RLS) so both the user's question and the assistant's
-- reply are written atomically after the model call succeeds. No insert/
-- update/delete policy is granted to the authenticated client role.

create table public.ai_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  finding_type text not null check (finding_type in (
    'contradiction', 'character_inconsistency', 'timeline_conflict', 'geographic_conflict',
    'dropped_thread', 'unresolved_setup', 'repeated_information', 'pacing_observation', 'possible_canon_fact'
  )),
  severity text not null check (severity in ('low', 'medium', 'high')),
  confidence numeric(3,2) not null check (confidence >= 0 and confidence <= 1),
  title text not null check (char_length(title) between 1 and 200),
  explanation text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed', 'snoozed', 'converted_to_task', 'marked_intentional')),
  author_note text,
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_findings_project_id_idx on public.ai_findings(project_id, status);

create trigger ai_findings_set_updated_at before update on public.ai_findings
  for each row execute function inkwell.set_updated_at();

alter table public.ai_findings enable row level security;
create policy "aif_select" on public.ai_findings for select using (inkwell.user_owns_project(project_id));
create policy "aif_update" on public.ai_findings for update using (inkwell.user_owns_project(project_id)) with check (inkwell.user_owns_project(project_id));
-- Findings are created by the Edge Function via the service role only.
-- The author can update (status/author_note) but not fabricate a finding
-- directly, and cannot delete one (audit trail of what AI has flagged).

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  period_month text not null, -- 'YYYY-MM'
  tokens_input bigint not null default 0,
  tokens_output bigint not null default 0,
  estimated_cost_usd_micros bigint not null default 0,
  request_count integer not null default 0,
  unique (user_id, project_id, period_month)
);

create index ai_usage_user_period_idx on public.ai_usage(user_id, period_month);

alter table public.ai_usage enable row level security;
create policy "aiu_select" on public.ai_usage for select using (user_id = auth.uid());
-- Written exclusively by the service role inside the Edge Function after a
-- successful (or billed-partial) provider call, so usage can't be forged or
-- erased by the client to bypass allowance limits.

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('scene', 'chapter_summary', 'story_bible_entry', 'timeline_event', 'canon_fact')),
  source_id uuid not null,
  chunk_index integer not null default 0,
  content text not null,
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  unique (source_type, source_id, chunk_index)
);

create index document_chunks_project_user_idx on public.document_chunks(project_id, user_id);
create index document_chunks_search_idx on public.document_chunks using gin(search_vector);

alter table public.document_chunks enable row level security;
create policy "dc_select" on public.document_chunks for select using (user_id = auth.uid() and inkwell.user_owns_project(project_id));
-- Written by the service role during (re)indexing, not directly by clients.
