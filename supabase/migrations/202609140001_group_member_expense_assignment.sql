-- Every member may assign one of their own expenses to a group. This does not
-- grant permission to edit expenses paid by another member.

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
  created_expense_id uuid;
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
  if p_macro_category not in ('needs', 'wants', 'savings') then
    raise exception 'invalid macro category';
  end if;
  if p_group_id is not null and not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'group membership required';
  end if;

  delete from public.shared_expenses expense
  where expense.transaction_id = p_transaction_id
    and expense.paid_by = auth.uid();

  if p_group_id is null then
    return null;
  end if;

  insert into public.shared_expenses (
    group_id, transaction_id, description, amount, paid_by, occurred_at,
    macro_category, split_method
  ) values (
    p_group_id, source_transaction.id, source_transaction.description,
    source_transaction.amount, auth.uid(), source_transaction.occurred_at,
    p_macro_category, 'contribution'
  ) returning id into created_expense_id;

  with member_weights as (
    select member.user_id,
      coalesce((
        select rule.percentage
        from public.group_contribution_rules rule
        where rule.group_id = p_group_id
          and rule.user_id = member.user_id
          and rule.effective_from <= date_trunc('month', source_transaction.occurred_at)::date
        order by rule.effective_from desc
        limit 1
      ), 0) as weight,
      member.joined_at
    from public.group_members member
    where member.group_id = p_group_id
  ), normalized as (
    select user_id,
      case when sum(weight) over () > 0 then weight else 1 end as weight,
      joined_at
    from member_weights
  ), rounded as (
    select user_id, joined_at,
      round(
        source_transaction.amount * weight / nullif(sum(weight) over (), 0),
        2
      ) as amount,
      row_number() over (order by joined_at, user_id) as position
    from normalized
    where weight > 0
  ), adjusted as (
    select user_id,
      amount + case when position = 1
        then source_transaction.amount - sum(amount) over ()
        else 0
      end as amount
    from rounded
  )
  insert into public.expense_split_shares (expense_id, member_id, amount)
  select created_expense_id, user_id, amount
  from adjusted;

  return created_expense_id;
end;
$$;

revoke all on function public.set_my_transaction_group(uuid, uuid, text) from public, anon;
grant execute on function public.set_my_transaction_group(uuid, uuid, text) to authenticated;
