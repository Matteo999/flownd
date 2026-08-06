-- Struttura minima condivisa per onboarding Flownd.
-- La funzione RPC completa l'onboarding in una singola transazione PostgreSQL.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  onboarding_completed boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_key text not null,
  name text not null,
  emoji text,
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_key)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount > 0),
  saved_amount numeric(12, 2) not null default 0 check (saved_amount >= 0),
  deadline_label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  category text not null,
  occurred_at timestamptz not null default now(),
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.budget_categories enable row level security;
alter table public.goals enable row level security;
alter table public.transactions enable row level security;

create policy "profiles_own_rows" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "budgets_own_rows" on public.budget_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_own_rows" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_own_rows" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.complete_flownd_onboarding(
  p_budgets jsonb,
  p_goal jsonb,
  p_transaction jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  budget jsonb;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if jsonb_array_length(p_budgets) < 2 or jsonb_array_length(p_budgets) > 3 then
    raise exception 'select between two and three budgets';
  end if;

  insert into public.profiles (id, onboarding_completed, onboarding_completed_at, updated_at)
  values (current_user_id, true, now(), now())
  on conflict (id) do update set
    onboarding_completed = true,
    onboarding_completed_at = now(),
    updated_at = now();

  delete from public.budget_categories where user_id = current_user_id;
  for budget in select * from jsonb_array_elements(p_budgets)
  loop
    insert into public.budget_categories (user_id, category_key, name, emoji, monthly_limit)
    values (
      current_user_id,
      budget->>'id',
      budget->>'name',
      budget->>'emoji',
      (budget->>'amount')::numeric
    );
  end loop;

  insert into public.goals (user_id, name, target_amount, deadline_label)
  values (
    current_user_id,
    p_goal->>'name',
    (p_goal->>'targetAmount')::numeric,
    nullif(p_goal->>'deadline', '')
  );

  insert into public.transactions (user_id, description, amount, category, source)
  values (
    current_user_id,
    p_transaction->>'description',
    (p_transaction->>'amount')::numeric,
    p_transaction->>'category',
    'onboarding'
  );
end;
$$;

grant execute on function public.complete_flownd_onboarding(jsonb, jsonb, jsonb) to authenticated;
