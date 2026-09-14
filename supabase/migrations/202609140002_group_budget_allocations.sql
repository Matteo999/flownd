-- Store the group's Necessita/Desideri/Risparmi allocation as percentages so
-- category limits continue to follow changes in the planned group budget.

alter table public.group_budgets
  add column if not exists percentage numeric(5, 2)
    check (percentage between 0 and 100);

with totals as (
  select group_id, sum(monthly_limit) as total
  from public.group_budgets
  group by group_id
)
update public.group_budgets budget
set percentage = case
  when totals.total > 0 then round(budget.monthly_limit * 100 / totals.total, 2)
  else null
end
from totals
where totals.group_id = budget.group_id
  and budget.percentage is null;

create or replace function public.save_group_budget_allocation(
  p_group_id uuid,
  p_needs numeric,
  p_wants numeric,
  p_savings numeric
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  planned_total numeric := 0;
  finance jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.has_group_access(p_group_id, 'budgets', 'edit') then
    raise exception 'group budget access denied';
  end if;
  if least(p_needs, p_wants, p_savings) < 5
    or greatest(p_needs, p_wants, p_savings) > 90
    or abs(p_needs + p_wants + p_savings - 100) > 0.01 then
    raise exception 'group budget allocation must contain three shares totaling 100';
  end if;

  finance := public.group_finance_overview(p_group_id);
  planned_total := coalesce((finance ->> 'planned')::numeric, 0);

  insert into public.group_budgets (
    group_id, category, monthly_limit, percentage, created_by
  ) values
    (p_group_id, 'Necessità', round(planned_total * p_needs / 100, 2), round(p_needs, 2), auth.uid()),
    (p_group_id, 'Desideri', round(planned_total * p_wants / 100, 2), round(p_wants, 2), auth.uid()),
    (p_group_id, 'Risparmi', round(planned_total * p_savings / 100, 2), round(p_savings, 2), auth.uid())
  on conflict (group_id, category) do update set
    monthly_limit = excluded.monthly_limit,
    percentage = excluded.percentage,
    updated_at = now();
end;
$$;

revoke all on function public.save_group_budget_allocation(uuid, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.save_group_budget_allocation(uuid, numeric, numeric, numeric)
  to authenticated;
