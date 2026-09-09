-- Billing/entitlements architecture. No live payment processor is wired up;
-- this table is the reconciliation target for whichever store granted
-- access (web/Stripe, Apple IAP, Google Play). See docs/COSTS.md — all
-- prices are hypotheses pending owner approval, never hardcoded here.

create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null default 'free' check (plan_id in ('free', 'author', 'author_plus_ai')),
  status text not null default 'active' check (status in ('active', 'trialing', 'grace_period', 'expired', 'canceled')),
  ai_monthly_token_allowance bigint not null default 200000,
  renews_at timestamptz,
  store text check (store in ('web_stripe', 'apple_iap', 'google_play')),
  updated_at timestamptz not null default now()
);

create trigger entitlements_set_updated_at before update on public.entitlements
  for each row execute function inkwell.set_updated_at();

alter table public.entitlements enable row level security;
create policy "ent_select" on public.entitlements for select using (user_id = auth.uid());
-- No client insert/update/delete policy at all: entitlements are written
-- exclusively by the service role after verifying a receipt/webhook from
-- Stripe, Apple, or Google — "a client cannot grant itself a paid
-- entitlement" is enforced structurally, not just by convention.

-- Give every existing/new user a free-tier entitlement automatically.
create or replace function public.handle_new_user_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entitlements (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_entitlement
  after insert on auth.users
  for each row execute function public.handle_new_user_entitlement();
