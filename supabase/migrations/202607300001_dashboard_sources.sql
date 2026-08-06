-- Fonti e contenuti contestuali necessari alla Dashboard.

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  current_balance numeric(12, 2) not null default 0,
  previous_month_balance numeric(12, 2),
  source text not null check (source in ('open_banking', 'manual')),
  last_synced_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  next_due_at timestamptz not null,
  kind text not null check (kind in ('loan', 'subscription')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.financial_accounts enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.coach_insights enable row level security;

create policy "financial_accounts_own_rows" on public.financial_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "recurring_payments_own_rows" on public.recurring_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "coach_insights_own_rows" on public.coach_insights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists financial_accounts_user_active_idx
  on public.financial_accounts (user_id, active);

create index if not exists recurring_payments_user_due_idx
  on public.recurring_payments (user_id, next_due_at)
  where active = true;

create index if not exists coach_insights_user_priority_idx
  on public.coach_insights (user_id, priority desc, created_at desc)
  where active = true;
