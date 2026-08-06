-- Motore Obiettivi: priorita/percentuali, contributi, notifiche e finanziamenti.

alter table public.profiles
  add column if not exists plan_tier text not null default 'free'
    check (plan_tier in ('free', 'pro', 'max')),
  add column if not exists goal_allocation_mode text not null default 'priority'
    check (goal_allocation_mode in ('priority', 'percentage'));

alter table public.goals
  add column if not exists priority integer not null default 0,
  add column if not exists monthly_contribution numeric(12, 2) not null default 0
    check (monthly_contribution >= 0),
  add column if not exists allocation_percentage numeric(5, 2) not null default 0
    check (allocation_percentage >= 0 and allocation_percentage <= 100),
  add column if not exists status text not null default 'active'
    check (status in ('active', 'reached', 'free_savings', 'completed')),
  add column if not exists completed_at timestamptz;

update public.goals as goal
set monthly_contribution = coalesce((
  select category.monthly_limit
  from public.budget_categories as category
  where category.user_id = goal.user_id
    and category.category_key = 'savings'
  limit 1
), 0)
where goal.monthly_contribution = 0;

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  source text not null check (source in ('manual', 'open_banking')),
  income_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.goal_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  financed_amount numeric(12, 2) not null check (financed_amount > 0),
  down_payment numeric(12, 2) not null default 0 check (down_payment >= 0),
  installment_count integer not null check (installment_count > 0),
  monthly_payment numeric(12, 2) not null check (monthly_payment > 0),
  interest_rate numeric(7, 4) check (interest_rate is null or interest_rate >= 0),
  start_date date not null,
  final_balloon numeric(12, 2) check (final_balloon is null or final_balloon >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.goal_contributions enable row level security;
alter table public.goal_notifications enable row level security;
alter table public.loans enable row level security;

create policy "goal_contributions_own_rows" on public.goal_contributions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goal_notifications_own_rows" on public.goal_notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "loans_own_rows" on public.loans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists goals_user_priority_idx
  on public.goals (user_id, status, priority, created_at);
create index if not exists goal_contributions_goal_created_idx
  on public.goal_contributions (goal_id, created_at desc);
create index if not exists goal_notifications_user_unread_idx
  on public.goal_notifications (user_id, created_at desc) where read_at is null;
create index if not exists loans_user_active_idx
  on public.loans (user_id, active, created_at desc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'goal_notifications'
    ) then
    alter publication supabase_realtime add table public.goal_notifications;
  end if;
end;
$$;

create or replace function public.allocate_goal_pool(
  p_user_id uuid,
  p_amount numeric,
  p_source text,
  p_income_transaction_id uuid default null,
  p_goal_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  allocation_mode text;
  available_pool numeric := greatest(p_amount, 0);
  allocated numeric := 0;
  contribution numeric;
  remaining numeric;
  goal_row public.goals%rowtype;
  allocation_lines text[] := array[]::text[];
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_source not in ('manual', 'open_banking') then
    raise exception 'invalid contribution source';
  end if;

  select goal_allocation_mode into allocation_mode
  from public.profiles where id = p_user_id;
  allocation_mode := coalesce(allocation_mode, 'priority');

  if p_goal_id is not null then
    select * into goal_row from public.goals
    where id = p_goal_id and user_id = p_user_id and active = true
    for update;
    if not found then raise exception 'goal not found'; end if;
    remaining := case when goal_row.status = 'free_savings'
      then available_pool
      else greatest(goal_row.target_amount - goal_row.saved_amount, 0) end;
    contribution := least(available_pool, remaining);
    if contribution > 0 then
      update public.goals set
        saved_amount = saved_amount + contribution,
        status = case
          when status <> 'free_savings' and saved_amount + contribution >= target_amount then 'reached'
          else status end
      where id = goal_row.id;
      insert into public.goal_contributions
        (user_id, goal_id, amount, source, income_transaction_id)
      values (p_user_id, goal_row.id, contribution, p_source, p_income_transaction_id);
      allocated := contribution;
      allocation_lines := array_append(allocation_lines, format('%s a %s', to_char(contribution, 'FM999999990D00'), goal_row.name));
    end if;
  else
    for goal_row in
      select * from public.goals
      where user_id = p_user_id and active = true and status in ('active', 'free_savings')
      order by priority asc, created_at asc
      for update
    loop
      exit when available_pool - allocated <= 0;
      remaining := case when goal_row.status = 'free_savings'
        then available_pool - allocated
        else greatest(goal_row.target_amount - goal_row.saved_amount, 0) end;
      contribution := case
        when allocation_mode = 'percentage'
          then least(p_amount * goal_row.allocation_percentage / 100, remaining, available_pool - allocated)
        else least(goal_row.monthly_contribution, remaining, available_pool - allocated)
      end;
      if contribution > 0 then
        update public.goals set
          saved_amount = saved_amount + contribution,
          status = case
            when status <> 'free_savings' and saved_amount + contribution >= target_amount then 'reached'
            else status end
        where id = goal_row.id;
        insert into public.goal_contributions
          (user_id, goal_id, amount, source, income_transaction_id)
        values (p_user_id, goal_row.id, contribution, p_source, p_income_transaction_id);
        allocated := allocated + contribution;
        allocation_lines := array_append(allocation_lines, format('%s a %s', to_char(contribution, 'FM999999990D00'), goal_row.name));
      end if;
    end loop;
  end if;

  if p_source = 'open_banking' and allocated > 0 then
    insert into public.goal_notifications (user_id, title, body)
    values (
      p_user_id,
      'Stipendio ricevuto',
      array_to_string(allocation_lines, ', ') || '. Accantonamento virtuale: il denaro resta sul conto.'
    );
  end if;

  return jsonb_build_object('allocated', allocated, 'unallocated', available_pool - allocated);
end;
$$;

create or replace function public.add_manual_goal_contribution(
  p_amount numeric,
  p_goal_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  return public.allocate_goal_pool(auth.uid(), p_amount, 'manual', null, p_goal_id);
end;
$$;

grant execute on function public.add_manual_goal_contribution(numeric, uuid) to authenticated;
revoke all on function public.allocate_goal_pool(uuid, numeric, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.allocate_open_banking_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tier text;
  savings_pool numeric;
begin
  if new.kind <> 'income' or new.source <> 'open_banking' then return new; end if;
  if not (
    lower(new.category) ~ '(stipend|salary|payroll|pensione)'
    or lower(new.description) ~ '(stipend|salary|payroll|retribuz|pensione)'
  ) then return new; end if;

  select plan_tier into tier from public.profiles where id = new.user_id;
  if tier not in ('pro', 'max') then return new; end if;

  select monthly_limit into savings_pool
  from public.budget_categories
  where user_id = new.user_id and category_key = 'savings'
  limit 1;
  savings_pool := least(new.amount, coalesce(savings_pool, 0));
  if savings_pool > 0 then
    perform public.allocate_goal_pool(new.user_id, savings_pool, 'open_banking', new.id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_allocate_open_banking_income on public.transactions;
create trigger transactions_allocate_open_banking_income
  after insert on public.transactions
  for each row execute function public.allocate_open_banking_income();
