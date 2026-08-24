-- Sotto-budget facoltativi e un solo livello di annidamento.

alter table public.budget_categories
  add column if not exists parent_category_key text,
  add column if not exists budget_enabled boolean not null default true;

alter table public.budget_categories
  drop constraint if exists budget_categories_monthly_limit_check,
  drop constraint if exists budget_categories_allocation_percentage_check;

alter table public.budget_categories
  add constraint budget_categories_monthly_limit_check
    check (monthly_limit >= 0),
  add constraint budget_categories_allocation_percentage_check
    check (allocation_percentage >= 0 and allocation_percentage <= 100),
  add constraint budget_categories_parent_category_check
    check (parent_category_key is null or parent_category_key <> category_key);

create index if not exists budget_categories_parent_category_idx
  on public.budget_categories (user_id, parent_category_key)
  where parent_category_key is not null;

create or replace function public.seed_standard_budget_subcategories(p_user_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.budget_categories (
    user_id, category_key, name, emoji, monthly_limit,
    allocation_percentage, parent_key, parent_category_key, budget_enabled, is_macro
  )
  select
    p_user_id, standard.category_key, standard.name, null, 0,
    0, standard.parent_key, null, false, false
  from (values
    ('food-groceries', 'Cibo e Spesa', 'needs'),
    ('transport-auto', 'Trasporti e Auto', 'needs'),
    ('home-utilities', 'Casa e utenze', 'needs'),
    ('health-pharmacy', 'Cure sanitarie e Farmacia', 'needs'),
    ('taxes-fines', 'Tasse e Multe', 'needs'),
    ('education', 'Educazione', 'needs'),
    ('insurance-finance', 'Assicurazioni e Finanza', 'needs'),
    ('business-expenses', 'Spese aziendali', 'needs'),
    ('restaurants-bars', 'Bar e ristoranti', 'wants'),
    ('family-friends', 'Famiglia e Amici', 'wants'),
    ('subscriptions-donations', 'Sottoscrizioni e donazioni', 'wants'),
    ('leisure-entertainment', 'Tempo libero e intrattenimento', 'wants'),
    ('multimedia-electronics', 'Multimedia e Elettronica', 'wants'),
    ('shopping', 'Shopping', 'wants'),
    ('travel-holidays', 'Viaggi e Vacanze', 'wants'),
    ('other-expenses', 'Altro', 'wants')
  ) as standard(category_key, name, parent_key)
  where not exists (
    select 1
    from public.budget_categories as existing
    where existing.user_id = p_user_id
      and lower(trim(existing.name)) = lower(trim(standard.name))
  )
  on conflict (user_id, category_key) do nothing;
$$;

create or replace function public.seed_budget_subcategories_after_macro()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.seed_standard_budget_subcategories(new.user_id);
  return new;
end;
$$;

drop trigger if exists seed_budget_subcategories_after_macro
  on public.budget_categories;
create trigger seed_budget_subcategories_after_macro
  after insert on public.budget_categories
  for each row
  when (new.is_macro)
  execute function public.seed_budget_subcategories_after_macro();

do $$
declare
  owner record;
begin
  for owner in
    select distinct user_id from public.budget_categories where is_macro
  loop
    perform public.seed_standard_budget_subcategories(owner.user_id);
  end loop;
end;
$$;

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
    where (item->>'percentage')::numeric < 0
       or (item->>'percentage')::numeric > 100
       or (
         coalesce((item->>'isMacro')::boolean, false)
         and (item->>'percentage')::numeric <= 0
       )
  ) then
    raise exception 'allocation percentages must be between 0 and 100';
  end if;

  -- Ogni insieme di figli diretti usa al massimo il 100% del proprio padre.
  if exists (
    select 1
    from (
      select
        coalesce(nullif(item->>'parentCategoryId', ''), item->>'parentId') as parent_id,
        sum(
          case when coalesce((item->>'budgetEnabled')::boolean, true)
            then (item->>'percentage')::numeric else 0 end
        ) as total
      from jsonb_array_elements(p_allocations) as item
      where not coalesce((item->>'isMacro')::boolean, false)
      group by coalesce(nullif(item->>'parentCategoryId', ''), item->>'parentId')
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
    set allocation_percentage = (allocation->>'percentage')::numeric,
        budget_enabled = coalesce((allocation->>'budgetEnabled')::boolean, true)
    where user_id = current_user_id
      and category_key = allocation->>'id';
  end loop;

  update public.budget_categories
  set monthly_limit = round(p_planned_monthly_income * allocation_percentage / 100, 2)
  where user_id = current_user_id and is_macro;

  update public.budget_categories as child
  set monthly_limit = case when child.budget_enabled
    then round(parent.monthly_limit * child.allocation_percentage / 100, 2)
    else 0 end
  from public.budget_categories as parent
  where child.user_id = current_user_id
    and not child.is_macro
    and child.parent_category_key is null
    and parent.user_id = child.user_id
    and parent.category_key = child.parent_key
    and parent.is_macro;

  update public.budget_categories as child
  set monthly_limit = case when child.budget_enabled
    then round(parent.monthly_limit * child.allocation_percentage / 100, 2)
    else 0 end
  from public.budget_categories as parent
  where child.user_id = current_user_id
    and not child.is_macro
    and child.parent_category_key is not null
    and parent.user_id = child.user_id
    and parent.category_key = child.parent_category_key
    and not parent.is_macro;
end;
$$;

grant execute on function public.save_budget_allocations(numeric, jsonb)
  to authenticated;
