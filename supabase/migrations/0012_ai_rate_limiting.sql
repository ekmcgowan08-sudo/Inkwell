-- Sliding-window rate limiting for the AI assistant, on top of the existing monthly token
-- allowance (entitlements.ai_monthly_token_allowance / ai_usage). The allowance caps spend over a
-- month; this caps burst request rate over a short window, independent of remaining budget. See
-- supabase/functions/_shared/rateLimit.ts and docs/AI_ARCHITECTURE.md.
--
-- Server-only, like ai_messages/ai_findings inserts: RLS is enabled with NO policies at all, so
-- the `authenticated` role can neither read nor write this table under any circumstance — every
-- access goes through the Edge Function's service-role client, which bypasses RLS. A client
-- can't forge, inspect, or clear its own rate-limit history.

create table public.ai_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_rate_limit_events_user_created_idx on public.ai_rate_limit_events(user_id, created_at);

alter table public.ai_rate_limit_events enable row level security;
-- Deliberately no policies — see comment above.
