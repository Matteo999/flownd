-- Group contributions may be a percentage of planned income or a fixed amount.
-- Default expense splits use the planned euro contribution for the expense cycle.

alter table public.group_contribution_rules
  add column if not exists contribution_mode text not null default 'percentage',
  add column if not exists fixed_amount numeric(12, 2);

alter table public.group_contribution_rules
  drop constraint if exists group_contribution_rules_contribution_mode_check,
  add constraint group_contribution_rules_contribution_mode_check
    check (contribution_mode in ('percentage', 'fixed')),
  drop constraint if exists group_contribution_rules_fixed_amount_check,
  add constraint group_contribution_rules_fixed_amount_check
    check (fixed_amount is null or fixed_amount >= 0),
  drop constraint if exists group_contribution_rules_mode_value_check,
  add constraint group_contribution_rules_mode_value_check
    check (
      (contribution_mode = 'percentage' and fixed_amount is null)
      or (contribution_mode = 'fixed' and fixed_amount is not null)
    );

create or replace function public.set_my_group_contribution_v2(
  p_group_id uuid,
  p_mode text,
  p_value numeric
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
  planned_income numeric := 0;
  requested_amount numeric := 0;
  allocated_elsewhere numeric := 0;
  normalized_percentage numeric := 0;
  normalized_fixed numeric := null;
begin
  if current_user_id is null or not public.is_group_member(p_group_id, current_user_id) then
    raise exception 'group membership required';
  end if;
  if p_mode not in ('percentage', 'fixed') or p_value is null or p_value < 0 then
    raise exception 'invalid contribution';
  end if;

  select coalesce(profile.planned_monthly_income, 0)
    into planned_income
  from public.profiles profile
  where profile.id = current_user_id;

  if p_mode = 'percentage' then
    if p_value > 100 then raise exception 'contribution percentage must be between 0 and 100'; end if;
    normalized_percentage := round(p_value, 2);
    requested_amount := round(planned_income * normalized_percentage / 100, 2);
  else
    normalized_fixed := round(p_value, 2);
    requested_amount := normalized_fixed;
    normalized_percentage := case
      when planned_income > 0 then round(least(100, requested_amount * 100 / planned_income), 2)
      else 0
    end;
  end if;

  with latest_per_group as (
    select distinct on (rule.group_id)
      rule.group_id,
      case
        when rule.contribution_mode = 'fixed' then coalesce(rule.fixed_amount, 0)
        else round(planned_income * rule.percentage / 100, 2)
      end as amount
    from public.group_contribution_rules rule
    join public.group_members member
      on member.group_id = rule.group_id and member.user_id = current_user_id
    where rule.user_id = current_user_id
      and rule.group_id <> p_group_id
      and rule.effective_from <= effective_date
    order by rule.group_id, rule.effective_from desc
  )
  select coalesce(sum(amount), 0) into allocated_elsewhere from latest_per_group;

  if allocated_elsewhere + requested_amount > planned_income then
    raise exception 'total group contributions cannot exceed planned monthly income';
  end if;

  delete from public.group_contribution_rules
  where group_id = p_group_id
    and user_id = current_user_id
    and effective_from > effective_date;

  insert into public.group_contribution_rules (
    group_id, user_id, percentage, contribution_mode, fixed_amount, effective_from
  ) values (
    p_group_id, current_user_id, normalized_percentage, p_mode, normalized_fixed, effective_date
  ) on conflict (group_id, user_id, effective_from) do update set
    percentage = excluded.percentage,
    contribution_mode = excluded.contribution_mode,
    fixed_amount = excluded.fixed_amount,
    updated_at = now();

  delete from public.group_monthly_contributions
  where group_id = p_group_id
    and user_id = current_user_id
    and cycle_start = effective_date;

  update public.group_members
  set share_monthly_budget = requested_amount > 0
  where group_id = p_group_id and user_id = current_user_id;

  return effective_date;
end;
$$;

create or replace function public.set_my_group_contribution(
  p_group_id uuid,
  p_percentage numeric
)
returns date
language sql
security definer
set search_path = public
set row_security = off
as $$
  select public.set_my_group_contribution_v2(p_group_id, 'percentage', p_percentage);
$$;

create or replace function public.group_default_expense_split(
  p_group_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz
)
returns table (member_id uuid, amount numeric)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with member_weights as (
    select member.user_id,
      case
        when rule.contribution_mode = 'fixed' then coalesce(rule.fixed_amount, 0)
        else round(coalesce(profile.planned_monthly_income, 0) * coalesce(rule.percentage, 0) / 100, 2)
      end as planned_contribution,
      member.joined_at
    from public.group_members member
    left join public.profiles profile on profile.id = member.user_id
    left join lateral (
      select contribution.percentage, contribution.contribution_mode, contribution.fixed_amount
      from public.group_contribution_rules contribution
      where contribution.group_id = p_group_id
        and contribution.user_id = member.user_id
        and contribution.effective_from <= date_trunc('month', coalesce(p_occurred_at, now()))::date
      order by contribution.effective_from desc
      limit 1
    ) rule on true
    where member.group_id = p_group_id
  ), normalized as (
    select user_id,
      case
        when sum(greatest(planned_contribution, 0)) over () > 0
          then greatest(planned_contribution, 0)
        else 1
      end as weight,
      joined_at
    from member_weights
  ), rounded as (
    select user_id, joined_at,
      round(p_amount * weight / nullif(sum(weight) over (), 0), 2) as split_amount,
      row_number() over (order by joined_at, user_id) as position
    from normalized
    where weight > 0
  ), adjusted as (
    select user_id,
      split_amount + case when position = 1
        then p_amount - sum(split_amount) over () else 0 end as split_amount
    from rounded
  )
  select user_id, split_amount from adjusted;
$$;

create or replace function public.refresh_group_monthly_contributions(
  p_group_id uuid,
  p_cycle_start date default date_trunc('month', current_date)::date
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'group membership required';
  end if;
  if p_cycle_start <> date_trunc('month', p_cycle_start)::date then
    raise exception 'cycle start must be the first day of a month';
  end if;

  with member_rules as (
    select member.user_id,
      coalesce(rule.percentage, 0) as percentage,
      coalesce(rule.contribution_mode, 'percentage') as contribution_mode,
      rule.fixed_amount
    from public.group_members member
    left join lateral (
      select contribution.percentage, contribution.contribution_mode, contribution.fixed_amount
      from public.group_contribution_rules contribution
      where contribution.group_id = p_group_id
        and contribution.user_id = member.user_id
        and contribution.effective_from <= p_cycle_start
      order by contribution.effective_from desc
      limit 1
    ) rule on true
    where member.group_id = p_group_id
  ), calculated as (
    select member_rules.user_id,
      member_rules.percentage,
      case
        when member_rules.contribution_mode = 'fixed' then coalesce(member_rules.fixed_amount, 0)
        else round(coalesce(profile.planned_monthly_income, 0) * member_rules.percentage / 100, 2)
      end as planned,
      case
        when member_rules.contribution_mode = 'fixed' then least(
          coalesce(member_rules.fixed_amount, 0),
          coalesce((select sum(transaction.amount)
            from public.transactions transaction
            where transaction.user_id = member_rules.user_id
              and transaction.kind = 'income'
              and not transaction.excluded_from_budget
              and transaction.occurred_at >= p_cycle_start::timestamptz
              and transaction.occurred_at < (p_cycle_start + interval '1 month')::timestamptz), 0)
        )
        else round(coalesce((select sum(transaction.amount)
          from public.transactions transaction
          where transaction.user_id = member_rules.user_id
            and transaction.kind = 'income'
            and not transaction.excluded_from_budget
            and transaction.occurred_at >= p_cycle_start::timestamptz
            and transaction.occurred_at < (p_cycle_start + interval '1 month')::timestamptz), 0)
          * member_rules.percentage / 100, 2)
      end as income_covered,
      coalesce((select sum(disposition.amount)
        from public.group_cycle_dispositions disposition
        where disposition.group_id = p_group_id
          and disposition.user_id = member_rules.user_id
          and disposition.cycle_start = (p_cycle_start - interval '1 month')::date
          and disposition.action = 'carry_group'), 0) as carry_in,
      coalesce((select sum(share.amount)
        from public.expense_split_shares share
        join public.shared_expenses expense on expense.id = share.expense_id
        where expense.group_id = p_group_id
          and share.member_id = member_rules.user_id
          and expense.occurred_at >= p_cycle_start::timestamptz
          and expense.occurred_at < (p_cycle_start + interval '1 month')::timestamptz), 0) as consumed
    from member_rules
    left join public.profiles profile on profile.id = member_rules.user_id
  )
  insert into public.group_monthly_contributions (
    group_id, user_id, cycle_start, percentage, planned_amount,
    covered_amount, consumed_amount, carry_in_amount
  )
  select p_group_id, user_id, p_cycle_start, percentage, planned,
    least(planned, income_covered), consumed, carry_in
  from calculated
  on conflict (group_id, user_id, cycle_start) do update set
    percentage = excluded.percentage,
    planned_amount = excluded.planned_amount,
    covered_amount = excluded.covered_amount,
    consumed_amount = excluded.consumed_amount,
    carry_in_amount = excluded.carry_in_amount,
    refreshed_at = now();
end;
$$;

create or replace function public.my_group_allocation_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  planned_income numeric := 0;
  allocated numeric := 0;
  previous_allocated numeric := 0;
  total_percentage numeric := 0;
  personal_carry_in numeric := 0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select coalesce(planned_monthly_income, 0) into planned_income
  from public.profiles where id = auth.uid();

  with current_rules as (
    select distinct on (rule.group_id) rule.group_id, rule.percentage,
      rule.contribution_mode, rule.fixed_amount
    from public.group_contribution_rules rule
    join public.group_members member
      on member.group_id = rule.group_id and member.user_id = auth.uid()
    where rule.user_id = auth.uid()
      and rule.effective_from <= date_trunc('month', current_date)::date
    order by rule.group_id, rule.effective_from desc
  )
  select coalesce(sum(case when contribution_mode = 'fixed' then fixed_amount
      else planned_income * percentage / 100 end), 0),
    coalesce(sum(case when planned_income > 0 and contribution_mode = 'fixed'
      then fixed_amount * 100 / planned_income else percentage end), 0)
  into allocated, total_percentage
  from current_rules;

  with previous_rules as (
    select distinct on (rule.group_id) rule.group_id, rule.percentage,
      rule.contribution_mode, rule.fixed_amount
    from public.group_contribution_rules rule
    join public.group_members member
      on member.group_id = rule.group_id and member.user_id = auth.uid()
    where rule.user_id = auth.uid()
      and rule.effective_from <= (date_trunc('month', current_date) - interval '1 month')::date
    order by rule.group_id, rule.effective_from desc
  )
  select coalesce(sum(case when contribution_mode = 'fixed' then fixed_amount
      else planned_income * percentage / 100 end), 0)
  into previous_allocated
  from previous_rules;

  select coalesce(sum(amount), 0) into personal_carry_in
  from public.group_cycle_dispositions
  where user_id = auth.uid()
    and cycle_start = (date_trunc('month', current_date) - interval '1 month')::date
    and action = 'personal_next_cycle';

  return jsonb_build_object(
    'plannedIncome', planned_income,
    'allocatedToGroups', round(allocated, 2),
    'previousAllocatedToGroups', round(previous_allocated, 2),
    'personalCarryIn', personal_carry_in,
    'personalAvailable', greatest(0, planned_income - allocated + personal_carry_in),
    'percentage', round(total_percentage, 2)
  );
end;
$$;

create or replace function public.create_group_expense_v2(
  p_group_id uuid,
  p_description text,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_macro_category text default 'needs',
  p_shares jsonb default null,
  p_transaction_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  expense_id uuid;
  share jsonb;
  shares_total numeric;
  selected_method text := 'explicit';
begin
  if auth.uid() is null or not public.has_group_access(p_group_id, 'transactions', 'edit') then
    raise exception 'shared expense access denied';
  end if;
  if p_amount is null or p_amount <= 0 or char_length(trim(coalesce(p_description, ''))) = 0 then
    raise exception 'invalid shared expense';
  end if;
  if p_macro_category not in ('needs', 'wants', 'savings') then
    raise exception 'invalid macro category';
  end if;
  if p_transaction_id is not null and not exists (
    select 1 from public.transactions transaction
    where transaction.id = p_transaction_id and transaction.user_id = auth.uid()
  ) then
    raise exception 'transaction must belong to payer';
  end if;
  if p_shares is not null and jsonb_typeof(p_shares) <> 'array' then
    raise exception 'split shares must be an array';
  end if;

  if coalesce(jsonb_array_length(p_shares), 0) > 0 then
    select coalesce(sum((item ->> 'amount')::numeric), 0)
      into shares_total from jsonb_array_elements(p_shares) item;
    if abs(shares_total - p_amount) > 0.01 then raise exception 'split shares must match expense amount'; end if;
    if exists (select 1 from jsonb_array_elements(p_shares) item
      where (item ->> 'amount')::numeric < 0
        or not public.is_group_member(p_group_id, (item ->> 'memberId')::uuid)) then
      raise exception 'invalid split member';
    end if;
  else
    selected_method := 'contribution';
  end if;

  insert into public.shared_expenses (
    group_id, transaction_id, description, amount, paid_by, occurred_at,
    macro_category, split_method
  ) values (
    p_group_id, p_transaction_id, trim(p_description), p_amount, auth.uid(),
    coalesce(p_occurred_at, now()), p_macro_category, selected_method
  ) returning id into expense_id;

  if selected_method = 'explicit' then
    for share in select * from jsonb_array_elements(p_shares) loop
      insert into public.expense_split_shares (expense_id, member_id, amount)
      values (expense_id, (share ->> 'memberId')::uuid, (share ->> 'amount')::numeric);
    end loop;
  else
    insert into public.expense_split_shares (expense_id, member_id, amount)
    select expense_id, split.member_id, split.amount
    from public.group_default_expense_split(
      p_group_id, p_amount, coalesce(p_occurred_at, now())
    ) split;
  end if;
  return expense_id;
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
  created_expense_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into source_transaction from public.transactions transaction
  where transaction.id = p_transaction_id and transaction.user_id = auth.uid();
  if not found then raise exception 'transaction must belong to payer'; end if;
  if source_transaction.kind <> 'expense' and p_group_id is not null then
    raise exception 'only expenses can be assigned to a group';
  end if;
  if p_macro_category not in ('needs', 'wants', 'savings') then raise exception 'invalid macro category'; end if;
  if p_group_id is not null and not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'group membership required';
  end if;

  delete from public.shared_expenses expense
  where expense.transaction_id = p_transaction_id and expense.paid_by = auth.uid();
  if p_group_id is null then return null; end if;

  insert into public.shared_expenses (
    group_id, transaction_id, description, amount, paid_by, occurred_at,
    macro_category, split_method
  ) values (
    p_group_id, source_transaction.id, source_transaction.description,
    source_transaction.amount, auth.uid(), source_transaction.occurred_at,
    p_macro_category, 'contribution'
  ) returning id into created_expense_id;

  insert into public.expense_split_shares (expense_id, member_id, amount)
  select created_expense_id, split.member_id, split.amount
  from public.group_default_expense_split(
    p_group_id, source_transaction.amount, source_transaction.occurred_at
  ) split;
  return created_expense_id;
end;
$$;

-- A group-attributed expense is visible by default. Privacy preferences only
-- control the additional projection of the member's personal transactions.
create or replace function public.shared_group_transactions(p_group_id uuid)
returns table (
  id uuid, member_id uuid, description text, amount numeric,
  category text, occurred_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select visible.id, visible.member_id, visible.description,
    visible.amount, visible.category, visible.occurred_at
  from (
    select expense.id, expense.paid_by as member_id, expense.description,
      expense.amount, expense.macro_category as category, expense.occurred_at
    from public.shared_expenses expense
    join public.group_members viewer
      on viewer.group_id = expense.group_id and viewer.user_id = auth.uid()
    where expense.group_id = p_group_id
      and viewer.transactions_access in ('view', 'edit')

    union all

    select transaction.id, transaction.user_id,
      case member.transaction_visibility when 'full' then transaction.description
        else 'Movimento condiviso' end,
      transaction.amount,
      case
        when member.transaction_visibility = 'full' then transaction.category
        when lower(coalesce(transaction.category::text, '')) similar to '%(risparm|invest)%' then 'savings'
        when lower(coalesce(transaction.category::text, '')) similar to '%(ristor|viagg|shopping|tempo libero|intratten)%' then 'wants'
        else 'needs'
      end,
      transaction.occurred_at
    from public.group_members viewer
    join public.group_members member on member.group_id = viewer.group_id
    join public.transactions transaction on transaction.user_id = member.user_id
    where viewer.group_id = p_group_id
      and viewer.user_id = auth.uid()
      and viewer.transactions_access in ('view', 'edit')
      and member.transaction_visibility <> 'none'
      and coalesce(transaction.excluded_from_totals, false) = false
      and not exists (
        select 1 from public.shared_expenses expense
        where expense.group_id = p_group_id and expense.transaction_id = transaction.id
      )
  ) visible
  order by visible.occurred_at desc
  limit 20;
$$;

-- Recalculate open contribution-based expenses so existing balances adopt the
-- planned-amount split. Settled shares remain untouched.
do $$
declare
  current_expense record;
begin
  for current_expense in
    select expense.id, expense.group_id, expense.amount, expense.occurred_at
    from public.shared_expenses expense
    where expense.split_method = 'contribution'
      and not exists (
        select 1 from public.expense_split_shares share
        where share.expense_id = expense.id and share.settled_amount > 0
      )
  loop
    delete from public.expense_split_shares where expense_id = current_expense.id;
    insert into public.expense_split_shares (expense_id, member_id, amount)
    select current_expense.id, split.member_id, split.amount
    from public.group_default_expense_split(
      current_expense.group_id, current_expense.amount, current_expense.occurred_at
    ) split;
  end loop;
end;
$$;

revoke all on function public.set_my_group_contribution_v2(uuid, text, numeric) from public, anon;
revoke all on function public.group_default_expense_split(uuid, numeric, timestamptz) from public, anon, authenticated;
grant execute on function public.set_my_group_contribution_v2(uuid, text, numeric) to authenticated;
