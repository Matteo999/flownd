-- Rende le percentuali la sorgente del piano budget.
-- monthly_limit resta materializzato per compatibilità con coach e query esistenti.

alter table public.profiles
  add column if not exists planned_monthly_income numeric(12, 2);

alter table public.budget_categories
  add column if not exists allocation_percentage numeric(7, 4);

with budget_totals as (
  select
    user_id,
    coalesce(
      nullif(sum(monthly_limit) filter (where is_macro), 0),
      nullif(sum(monthly_limit) filter (where not is_macro), 0),
      1250
    ) as planned_income
  from public.budget_categories
  group by user_id
)
update public.profiles as profile
set planned_monthly_income = coalesce(total.planned_income, 1250)
from budget_totals as total
where profile.id = total.user_id
  and profile.planned_monthly_income is null;

update public.profiles
set planned_monthly_income = 1250
where planned_monthly_income is null;

with macro_totals as (
  select user_id, sum(monthly_limit) as total
  from public.budget_categories
  where is_macro
  group by user_id
)
update public.budget_categories as category
set allocation_percentage = round(category.monthly_limit / total.total * 100, 4)
from macro_totals as total
where category.user_id = total.user_id
  and category.is_macro
  and total.total > 0
  and category.allocation_percentage is null;

with child_totals as (
  select user_id, parent_key, sum(monthly_limit) as total
  from public.budget_categories
  where not is_macro
  group by user_id, parent_key
),
parent_limits as (
  select user_id, category_key, monthly_limit
  from public.budget_categories
  where is_macro
)
update public.budget_categories as child
set allocation_percentage = round(
  child.monthly_limit /
    greatest(parent.monthly_limit, total.total, 1) * 100,
  4
)
from child_totals as total
join parent_limits as parent
  on parent.user_id = total.user_id
 and parent.category_key = total.parent_key
where child.user_id = total.user_id
  and child.parent_key = total.parent_key
  and not child.is_macro
  and child.allocation_percentage is null;

update public.budget_categories
set allocation_percentage = 1
where allocation_percentage is null;

alter table public.profiles
  alter column planned_monthly_income set default 1250,
  alter column planned_monthly_income set not null;

alter table public.profiles
  drop constraint if exists profiles_planned_monthly_income_check,
  add constraint profiles_planned_monthly_income_check
    check (planned_monthly_income > 0);

alter table public.budget_categories
  alter column allocation_percentage set not null;

alter table public.budget_categories
  drop constraint if exists budget_categories_allocation_percentage_check,
  add constraint budget_categories_allocation_percentage_check
    check (allocation_percentage > 0 and allocation_percentage <= 100);

create or replace function public.save_budget_allocations(
  p_planned_monthly_income numeric,
  p_allocations jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  allocation jsonb;
  macro_total numeric;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_planned_monthly_income <= 0 then
    raise exception 'planned monthly income must be positive';
  end if;

  select sum((item->>'percentage')::numeric)
  into macro_total
  from jsonb_array_elements(p_allocations) as item
  where coalesce((item->>'isMacro')::boolean, false);

  if macro_total is null or abs(macro_total - 100) > 0.01 then
    raise exception 'macro allocations must total 100 percent';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocations) as item
    where (item->>'percentage')::numeric <= 0
       or (item->>'percentage')::numeric > 100
  ) then
    raise exception 'allocation percentages must be between 0 and 100';
  end if;

  if exists (
    select 1
    from (
      select item->>'parentId' as parent_id,
             sum((item->>'percentage')::numeric) as total
      from jsonb_array_elements(p_allocations) as item
      where not coalesce((item->>'isMacro')::boolean, false)
      group by item->>'parentId'
    ) as children
    where children.total > 100.01
  ) then
    raise exception 'child allocations cannot exceed 100 percent of their parent';
  end if;

  update public.profiles
  set planned_monthly_income = p_planned_monthly_income,
      updated_at = now()
  where id = current_user_id;

  for allocation in select * from jsonb_array_elements(p_allocations)
  loop
    update public.budget_categories
    set allocation_percentage = (allocation->>'percentage')::numeric
    where user_id = current_user_id
      and category_key = allocation->>'id';
  end loop;

  update public.budget_categories
  set monthly_limit = round(
    p_planned_monthly_income * allocation_percentage / 100,
    2
  )
  where user_id = current_user_id
    and is_macro;

  update public.budget_categories as child
  set monthly_limit = round(
    parent.monthly_limit * child.allocation_percentage / 100,
    2
  )
  from public.budget_categories as parent
  where child.user_id = current_user_id
    and not child.is_macro
    and parent.user_id = child.user_id
    and parent.category_key = child.parent_key
    and parent.is_macro;
end;
$$;

grant execute on function public.save_budget_allocations(numeric, jsonb)
  to authenticated;

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
  transaction_amount numeric;
  planned_income numeric;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if jsonb_array_length(p_budgets) <> 3 then
    raise exception 'three budget allocations are required';
  end if;

  select sum((item->>'amount')::numeric)
  into planned_income
  from jsonb_array_elements(p_budgets) as item;

  insert into public.profiles (
    id,
    onboarding_completed,
    onboarding_completed_at,
    planned_monthly_income,
    updated_at
  )
  values (current_user_id, true, now(), planned_income, now())
  on conflict (id) do update set
    onboarding_completed = true,
    onboarding_completed_at = now(),
    planned_monthly_income = excluded.planned_monthly_income,
    updated_at = now();

  delete from public.budget_categories where user_id = current_user_id;
  for budget in select * from jsonb_array_elements(p_budgets)
  loop
    insert into public.budget_categories (
      user_id,
      category_key,
      name,
      emoji,
      monthly_limit,
      allocation_percentage,
      parent_key,
      is_macro
    )
    values (
      current_user_id,
      budget->>'id',
      budget->>'name',
      budget->>'emoji',
      (budget->>'amount')::numeric,
      round((budget->>'amount')::numeric / planned_income * 100, 4),
      budget->>'id',
      true
    );
  end loop;

  update public.goals
  set active = false
  where user_id = current_user_id and active = true;

  insert into public.goals (user_id, name, target_amount, deadline_label)
  values (
    current_user_id,
    p_goal->>'name',
    (p_goal->>'targetAmount')::numeric,
    nullif(p_goal->>'deadline', '')
  );

  transaction_amount := coalesce(nullif(p_transaction->>'amount', '')::numeric, 0);
  if transaction_amount > 0 and nullif(trim(p_transaction->>'description'), '') is not null then
    insert into public.transactions (user_id, description, amount, category, source)
    values (
      current_user_id,
      p_transaction->>'description',
      transaction_amount,
      coalesce(nullif(p_transaction->>'category', ''), 'Altro'),
      'onboarding'
    );
  end if;
end;
$$;

grant execute on function public.complete_flownd_onboarding(jsonb, jsonb, jsonb)
  to authenticated;
