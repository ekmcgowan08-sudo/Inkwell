-- Account: profiles (1:1 with auth.users) and preferences.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Author',
  avatar_url text,
  onboarding_style text not null default 'unset'
    check (onboarding_style in ('plotter', 'discovery', 'custom', 'unset')),
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  ai_training_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function inkwell.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());
-- No delete policy: profile deletion happens via account deletion (auth.users
-- cascade), never a direct client delete.

-- Auto-create a profile row the moment someone signs up, so the app never
-- has to special-case "no profile yet". SECURITY DEFINER is required here
-- because this trigger fires on auth.users, a schema the app role can't
-- write to directly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Author'));

  insert into public.preferences (user_id) values (new.id);

  return new;
end;
$$;

create table public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('dark', 'light', 'system')),
  reduced_motion boolean not null default false,
  editor_font_scale numeric(3,2) not null default 1.0,
  grammar_provider text not null default 'none' check (grammar_provider in ('none', 'languagetool', 'test')),
  ai_model text,
  updated_at timestamptz not null default now()
);

create trigger preferences_set_updated_at
  before update on public.preferences
  for each row execute function inkwell.set_updated_at();

alter table public.preferences enable row level security;

create policy "preferences_select_own" on public.preferences
  for select using (user_id = auth.uid());
create policy "preferences_upsert_own" on public.preferences
  for insert with check (user_id = auth.uid());
create policy "preferences_update_own" on public.preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Now that both tables exist, wire the trigger onto auth.users.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Audit events (created early since later triggers may want to write to it).
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index audit_events_user_id_idx on public.audit_events(user_id, created_at desc);

alter table public.audit_events enable row level security;

-- Audit rows are written exclusively by SECURITY DEFINER functions/edge
-- functions using the service role, which bypasses RLS entirely — so the
-- only client-facing policy needed is read-your-own.
create policy "audit_events_select_own" on public.audit_events
  for select using (user_id = auth.uid());
