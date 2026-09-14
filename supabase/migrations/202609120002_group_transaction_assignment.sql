-- Allow members to revise the current group allocation and associate one of
-- their real transactions with a group without creating a second transaction.

create or replace function public.set_my_group_contribution(
  p_group_id uuid,
  p_percentage numeric
)
returns date
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  effective_date date := date_trunc('month', current_date)::date;
  allocated_elsewhere numeric := 0;
begin
  if current_user_id is null or not public.is_group_member(p_group_id, current_user_id) then
    raise exception 'group membership required';
  end if;
  if p_percentage is null or p_percentage < 0 or p_percentage > 100 then
    raise exception 'contribution percentage must be between 0 and 100';
  end if;

  with latest_per_group as (
    select distinct on (rule.group_id) rule.group_id, rule.percentage
    from public.group_contribution_rules rule
    join public.group_members member
      on member.group_id = rule.group_id and member.user_id = current_user_id
    where rule.user_id = current_user_id
      and rule.group_id <> p_group_id
      and rule.effective_from <= effective_date
    order by rule.group_id, rule.effective_from desc
  )
  select coalesce(sum(percentage), 0) into allocated_elsewhere
  from latest_per_group;

  if allocated_elsewhere + p_percentage > 100 then
    raise exception 'total group contributions cannot exceed 100 percent';
  end if;

  delete from public.group_contribution_rules
  where group_id = p_group_id
    and user_id = current_user_id
    and effective_from > effective_date;

  insert into public.group_contribution_rules (
    group_id, user_id, percentage, effective_from
  ) values (
    p_group_id, current_user_id, round(p_percentage, 2), effective_date
  ) on conflict (group_id, user_id, effective_from) do update set
    percentage = excluded.percentage,
    updated_at = now();

  delete from public.group_monthly_contributions
  where group_id = p_group_id
    and user_id = current_user_id
    and cycle_start = effective_date;

  update public.group_members
  set share_monthly_budget = p_percentage > 0
  where group_id = p_group_id and user_id = current_user_id;

  return effective_date;
end;
$$;

create or replace function public.set_my_transaction_group(
  p_transaction_id uuid,
  p_group_id uuid default null,
  p_macro_category text default 'needs'
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  source_transaction public.transactions%rowtype;
  expense_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into source_transaction
  from public.transactions transaction
  where transaction.id = p_transaction_id
    and transaction.user_id = auth.uid();

  if not found then
    raise exception 'transaction must belong to payer';
  end if;
  if source_transaction.kind <> 'expense' and p_group_id is not null then
    raise exception 'only expenses can be assigned to a group';
  end if;

  delete from public.shared_expenses expense
  where expense.transaction_id = p_transaction_id
    and expense.paid_by = auth.uid();

  if p_group_id is null then
    return null;
  end if;

  select public.create_group_expense_v2(
    p_group_id,
    source_transaction.description,
    source_transaction.amount,
    source_transaction.occurred_at,
    p_macro_category,
    null,
    source_transaction.id
  ) into expense_id;

  return expense_id;
end;
$$;

revoke all on function public.set_my_transaction_group(uuid, uuid, text) from public, anon;
grant execute on function public.set_my_transaction_group(uuid, uuid, text) to authenticated;
