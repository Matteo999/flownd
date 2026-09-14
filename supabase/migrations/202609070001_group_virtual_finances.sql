-- Quote virtuali di gruppo con proprieta individuale.
-- Il gruppo pianifica e attribuisce gli importi, senza muovere denaro reale.

alter table public.group_members
  add column if not exists transaction_visibility text not null default 'none',
  add column if not exists net_worth_visibility text not null default 'none';

alter table public.group_members
  drop constraint if exists group_members_transaction_visibility_check,
  add constraint group_members_transaction_visibility_check
    check (transaction_visibility in ('none', 'summary', 'full')),
  drop constraint if exists group_members_net_worth_visibility_check,
  add constraint group_members_net_worth_visibility_check
    check (net_worth_visibility in ('none', 'all', 'selected'));

update public.group_members
set transaction_visibility = case
      when share_transactions and transaction_visibility = 'none' then 'full'
      else transaction_visibility
    end,
    net_worth_visibility = case
      when share_net_worth and net_worth_visibility = 'none' then 'all'
      else net_worth_visibility
    end;

create or replace function public.protect_member_sharing_preferences()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.user_id <> auth.uid() and (
    old.share_monthly_budget is distinct from new.share_monthly_budget
    or old.share_net_worth is distinct from new.share_net_worth
    or old.share_transactions is distinct from new.share_transactions
    or old.share_transaction_categories is distinct from new.share_transaction_categories
    or old.transaction_visibility is distinct from new.transaction_visibility
    or old.net_worth_visibility is distinct from new.net_worth_visibility
  ) then
    raise exception 'sharing preferences belong to the member';
  end if;
  return new;
end;
$$;

alter table public.shared_expenses
  add column if not exists macro_category text not null default 'needs',
  add column if not exists split_method text not null default 'explicit';

alter table public.shared_expenses
  drop constraint if exists shared_expenses_macro_category_check,
  add constraint shared_expenses_macro_category_check
    check (macro_category in ('needs', 'wants', 'savings')),
  drop constraint if exists shared_expenses_split_method_check,
  add constraint shared_expenses_split_method_check
    check (split_method in ('explicit', 'contribution'));

create table if not exists public.group_contribution_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  percentage numeric(5, 2) not null check (percentage between 0 and 100),
  effective_from date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id, effective_from)
);

create table if not exists public.group_monthly_contributions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_start date not null,
  percentage numeric(5, 2) not null check (percentage between 0 and 100),
  planned_amount numeric(12, 2) not null default 0 check (planned_amount >= 0),
  covered_amount numeric(12, 2) not null default 0 check (covered_amount >= 0),
  consumed_amount numeric(12, 2) not null default 0 check (consumed_amount >= 0),
  carry_in_amount numeric(12, 2) not null default 0 check (carry_in_amount >= 0),
  refreshed_at timestamptz not null default now(),
  unique (group_id, user_id, cycle_start)
);

create table if not exists public.group_account_shares (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  financial_account_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, financial_account_id),
  foreign key (financial_account_id, user_id)
    references public.financial_accounts(id, user_id) on delete cascade
);

create table if not exists public.group_cycle_dispositions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_start date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  action text not null check (action in ('carry_group', 'shared_goal', 'personal_next_cycle')),
  goal_id uuid references public.goals(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, user_id, cycle_start),
  check ((action = 'shared_goal' and goal_id is not null) or (action <> 'shared_goal' and goal_id is null))
);

-- Il vecchio switch non viene convertito automaticamente in una quota: il membro
-- deve scegliere esplicitamente la nuova percentuale, evitando di azzerare il
-- proprio budget personale al primo avvio.

create index if not exists group_contribution_rules_lookup_idx
  on public.group_contribution_rules (user_id, effective_from desc, group_id);
create index if not exists group_monthly_contributions_cycle_idx
  on public.group_monthly_contributions (group_id, cycle_start, user_id);
create index if not exists group_account_shares_user_idx
  on public.group_account_shares (user_id, group_id);

alter table public.group_contribution_rules enable row level security;
alter table public.group_monthly_contributions enable row level security;
alter table public.group_account_shares enable row level security;
alter table public.group_cycle_dispositions enable row level security;

drop policy if exists "group_contribution_rules_members_read" on public.group_contribution_rules;
create policy "group_contribution_rules_members_read" on public.group_contribution_rules
  for select using (public.is_group_member(group_id));
drop policy if exists "group_contribution_rules_own_write" on public.group_contribution_rules;
create policy "group_contribution_rules_own_write" on public.group_contribution_rules
  for all using (user_id = auth.uid() and public.is_group_member(group_id))
  with check (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists "group_monthly_contributions_members_read" on public.group_monthly_contributions;
create policy "group_monthly_contributions_members_read" on public.group_monthly_contributions
  for select using (public.is_group_member(group_id));

drop policy if exists "group_account_shares_members_read" on public.group_account_shares;
create policy "group_account_shares_members_read" on public.group_account_shares
  for select using (public.is_group_member(group_id));
drop policy if exists "group_account_shares_own_write" on public.group_account_shares;
create policy "group_account_shares_own_write" on public.group_account_shares
  for all using (user_id = auth.uid() and public.is_group_member(group_id))
  with check (user_id = auth.uid() and public.is_group_member(group_id));

drop policy if exists "group_cycle_dispositions_members_read" on public.group_cycle_dispositions;
create policy "group_cycle_dispositions_members_read" on public.group_cycle_dispositions
  for select using (public.is_group_member(group_id));
drop policy if exists "group_cycle_dispositions_own_write" on public.group_cycle_dispositions;
create policy "group_cycle_dispositions_own_write" on public.group_cycle_dispositions
  for all using (user_id = auth.uid() and public.is_group_member(group_id))
  with check (user_id = auth.uid() and public.is_group_member(group_id));

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
  effective_date date;
  allocated_elsewhere numeric := 0;
begin
  if current_user_id is null or not public.is_group_member(p_group_id, current_user_id) then
    raise exception 'group membership required';
  end if;
  if p_percentage is null or p_percentage < 0 or p_percentage > 100 then
    raise exception 'contribution percentage must be between 0 and 100';
  end if;

  effective_date := date_trunc('month', current_date)::date;

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

create or replace function public.set_my_group_privacy(
  p_group_id uuid,
  p_transaction_visibility text,
  p_net_worth_visibility text,
  p_account_ids uuid[] default array[]::uuid[]
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
  if p_transaction_visibility not in ('none', 'summary', 'full') then
    raise exception 'invalid transaction visibility';
  end if;
  if p_net_worth_visibility not in ('none', 'all', 'selected') then
    raise exception 'invalid net worth visibility';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_account_ids, array[]::uuid[])) account_id
    where not exists (
      select 1 from public.financial_accounts account
      where account.id = account_id and account.user_id = auth.uid() and account.active
    )
  ) then
    raise exception 'an account does not belong to the current user';
  end if;

  update public.group_members
  set transaction_visibility = p_transaction_visibility,
      net_worth_visibility = p_net_worth_visibility,
      share_transactions = p_transaction_visibility <> 'none',
      share_transaction_categories = p_transaction_visibility <> 'none',
      share_net_worth = p_net_worth_visibility <> 'none'
  where group_id = p_group_id and user_id = auth.uid();

  delete from public.group_account_shares
  where group_id = p_group_id and user_id = auth.uid();
  if p_net_worth_visibility = 'selected' then
    insert into public.group_account_shares (group_id, user_id, financial_account_id)
    select p_group_id, auth.uid(), account_id
    from unnest(coalesce(p_account_ids, array[]::uuid[])) account_id;
  end if;
end;
$$;

create or replace function public.leave_family_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if public.is_group_owner(p_group_id) then
    raise exception 'the owner must delete the group';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'group membership not found';
  end if;
  delete from public.goal_group_shares
  where group_id = p_group_id and shared_by = auth.uid();
  delete from public.group_account_shares
  where group_id = p_group_id and user_id = auth.uid();
  delete from public.group_cycle_dispositions
  where group_id = p_group_id and user_id = auth.uid();
  delete from public.group_monthly_contributions
  where group_id = p_group_id and user_id = auth.uid();
  delete from public.group_contribution_rules
  where group_id = p_group_id and user_id = auth.uid();
  delete from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
end;
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
      coalesce((
        select rule.percentage
        from public.group_contribution_rules rule
        where rule.group_id = p_group_id
          and rule.user_id = member.user_id
          and rule.effective_from <= p_cycle_start
        order by rule.effective_from desc
        limit 1
      ), 0) as percentage
    from public.group_members member
    where member.group_id = p_group_id
  ), calculated as (
    select member_rules.user_id,
      member_rules.percentage,
      round(coalesce(profile.planned_monthly_income, 0) * member_rules.percentage / 100, 2) as planned,
      round(coalesce((
        select sum(transaction.amount)
        from public.transactions transaction
        where transaction.user_id = member_rules.user_id
          and transaction.kind = 'income'
          and not transaction.excluded_from_budget
          and transaction.occurred_at >= p_cycle_start::timestamptz
          and transaction.occurred_at < (p_cycle_start + interval '1 month')::timestamptz
      ), 0) * member_rules.percentage / 100, 2) as income_covered,
      coalesce((
        select sum(disposition.amount)
        from public.group_cycle_dispositions disposition
        where disposition.group_id = p_group_id
          and disposition.user_id = member_rules.user_id
          and disposition.cycle_start = (p_cycle_start - interval '1 month')::date
          and disposition.action = 'carry_group'
      ), 0) as carry_in,
      coalesce((
        select sum(share.amount)
        from public.expense_split_shares share
        join public.shared_expenses expense on expense.id = share.expense_id
        where expense.group_id = p_group_id
          and share.member_id = member_rules.user_id
          and expense.occurred_at >= p_cycle_start::timestamptz
          and expense.occurred_at < (p_cycle_start + interval '1 month')::timestamptz
      ), 0) as consumed
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
  total_percentage numeric := 0;
  personal_carry_in numeric := 0;
  previous_percentage numeric := 0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select coalesce(planned_monthly_income, 0) into planned_income
  from public.profiles where id = auth.uid();
  with current_rules as (
    select distinct on (rule.group_id) rule.group_id, rule.percentage
    from public.group_contribution_rules rule
    join public.group_members member
      on member.group_id = rule.group_id and member.user_id = auth.uid()
    where rule.user_id = auth.uid()
      and rule.effective_from <= date_trunc('month', current_date)::date
    order by rule.group_id, rule.effective_from desc
  )
  select coalesce(sum(percentage), 0) into total_percentage from current_rules;
  with previous_rules as (
    select distinct on (rule.group_id) rule.group_id, rule.percentage
    from public.group_contribution_rules rule
    join public.group_members member
      on member.group_id = rule.group_id and member.user_id = auth.uid()
    where rule.user_id = auth.uid()
      and rule.effective_from <= (date_trunc('month', current_date) - interval '1 month')::date
    order by rule.group_id, rule.effective_from desc
  )
  select coalesce(sum(percentage), 0) into previous_percentage from previous_rules;
  allocated := round(planned_income * total_percentage / 100, 2);
  select coalesce(sum(amount), 0) into personal_carry_in
  from public.group_cycle_dispositions
  where user_id = auth.uid()
    and cycle_start = (date_trunc('month', current_date) - interval '1 month')::date
    and action = 'personal_next_cycle';
  return jsonb_build_object(
    'plannedIncome', planned_income,
    'allocatedToGroups', allocated,
    'previousAllocatedToGroups', round(planned_income * previous_percentage / 100, 2),
    'personalCarryIn', personal_carry_in,
    'personalAvailable', greatest(0, planned_income - allocated + personal_carry_in),
    'percentage', total_percentage
  );
end;
$$;

create or replace function public.my_group_transaction_links()
returns table (transaction_id uuid, group_id uuid)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select expense.transaction_id, expense.group_id
  from public.shared_expenses expense
  where expense.transaction_id is not null
    and expense.paid_by = auth.uid()
    and public.is_group_member(expense.group_id);
$$;

create or replace function public.group_finance_overview(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  cycle date := date_trunc('month', current_date)::date;
  result jsonb;
  previous_cycle jsonb;
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'group membership required';
  end if;
  perform public.refresh_group_monthly_contributions(p_group_id, cycle);
  perform public.refresh_group_monthly_contributions(
    p_group_id, (cycle - interval '1 month')::date
  );
  select jsonb_build_object(
    'cycleStart', cycle,
    'planned', coalesce(sum(item.planned_amount + item.carry_in_amount), 0),
    'covered', coalesce(sum(item.covered_amount + item.carry_in_amount), 0),
    'spent', coalesce(sum(item.consumed_amount), 0),
    'remaining', greatest(0, coalesce(sum(item.planned_amount + item.carry_in_amount - item.consumed_amount), 0)),
    'members', coalesce(jsonb_agg(jsonb_build_object(
      'userId', item.user_id,
      'percentage', item.percentage,
      'planned', item.planned_amount + item.carry_in_amount,
      'covered', item.covered_amount + item.carry_in_amount,
      'consumed', item.consumed_amount,
      'remaining', greatest(0, item.planned_amount + item.carry_in_amount - item.consumed_amount)
    ) order by member.joined_at), '[]'::jsonb)
  ) into result
  from public.group_monthly_contributions item
  join public.group_members member
    on member.group_id = item.group_id and member.user_id = item.user_id
  where item.group_id = p_group_id and item.cycle_start = cycle;
  select jsonb_build_object(
    'cycleStart', item.cycle_start,
    'amount', greatest(0, item.planned_amount + item.carry_in_amount - item.consumed_amount),
    'action', disposition.action,
    'goalId', disposition.goal_id
  ) into previous_cycle
  from public.group_monthly_contributions item
  left join public.group_cycle_dispositions disposition
    on disposition.group_id = item.group_id
    and disposition.user_id = item.user_id
    and disposition.cycle_start = item.cycle_start
  where item.group_id = p_group_id
    and item.user_id = auth.uid()
    and item.cycle_start = (cycle - interval '1 month')::date;
  return coalesce(result, jsonb_build_object(
    'cycleStart', cycle, 'planned', 0, 'covered', 0, 'spent', 0,
    'remaining', 0, 'members', '[]'::jsonb
  )) || jsonb_build_object('myPreviousCycle', previous_cycle);
end;
$$;

create or replace function public.set_my_group_cycle_disposition(
  p_group_id uuid,
  p_cycle_start date,
  p_action text,
  p_goal_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  available numeric := 0;
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'group membership required';
  end if;
  if p_cycle_start >= date_trunc('month', current_date)::date then
    raise exception 'only a completed cycle can be closed';
  end if;
  if p_action not in ('carry_group', 'shared_goal', 'personal_next_cycle') then
    raise exception 'invalid disposition';
  end if;
  if p_action = 'shared_goal' and not (
    exists (
      select 1 from public.goals goal
      where goal.id = p_goal_id and goal.group_id = p_group_id and goal.active
    ) or exists (
      select 1 from public.goal_group_shares share
      join public.goals goal on goal.id = share.goal_id
      where share.group_id = p_group_id and share.goal_id = p_goal_id and goal.active
    )
  ) then
    raise exception 'shared goal not found';
  end if;
  perform public.refresh_group_monthly_contributions(p_group_id, p_cycle_start);
  select greatest(0, planned_amount + carry_in_amount - consumed_amount)
    into available
  from public.group_monthly_contributions
  where group_id = p_group_id and user_id = auth.uid() and cycle_start = p_cycle_start;
  insert into public.group_cycle_dispositions (
    group_id, user_id, cycle_start, amount, action, goal_id
  ) values (
    p_group_id, auth.uid(), p_cycle_start, coalesce(available, 0), p_action,
    case when p_action = 'shared_goal' then p_goal_id else null end
  ) on conflict (group_id, user_id, cycle_start) do update set
    amount = excluded.amount,
    action = excluded.action,
    goal_id = excluded.goal_id,
    updated_at = now();
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
    if abs(shares_total - p_amount) > 0.01 then
      raise exception 'split shares must match expense amount';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_shares) item
      where (item ->> 'amount')::numeric < 0
        or not public.is_group_member(p_group_id, (item ->> 'memberId')::uuid)
    ) then
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
    for share in select * from jsonb_array_elements(p_shares)
    loop
      insert into public.expense_split_shares (expense_id, member_id, amount)
      values (expense_id, (share ->> 'memberId')::uuid, (share ->> 'amount')::numeric);
    end loop;
  else
    with member_weights as (
      select member.user_id,
        coalesce((
          select rule.percentage
          from public.group_contribution_rules rule
          where rule.group_id = p_group_id and rule.user_id = member.user_id
            and rule.effective_from <= date_trunc('month', coalesce(p_occurred_at, now()))::date
          order by rule.effective_from desc limit 1
        ), 0) as weight,
        member.joined_at
      from public.group_members member where member.group_id = p_group_id
    ), normalized as (
      select user_id,
        case when sum(weight) over () > 0 then weight else 1 end as weight,
        joined_at
      from member_weights
    ), rounded as (
      select user_id, joined_at,
        round(p_amount * weight / nullif(sum(weight) over (), 0), 2) as amount,
        row_number() over (order by joined_at, user_id) as position
      from normalized
      where weight > 0
    ), adjusted as (
      select user_id,
        amount + case when position = 1
          then p_amount - sum(amount) over () else 0 end as amount
      from rounded
    )
    insert into public.expense_split_shares (expense_id, member_id, amount)
    select expense_id, user_id, amount from adjusted;
  end if;
  return expense_id;
end;
$$;

create or replace function public.create_shared_expense(
  p_group_id uuid,
  p_description text,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_shares jsonb,
  p_transaction_id uuid default null
)
returns uuid
language sql
security definer
set search_path = public
set row_security = off
as $$
  select public.create_group_expense_v2(
    p_group_id, p_description, p_amount, p_occurred_at,
    'needs', p_shares, p_transaction_id
  );
$$;

create or replace function public.protect_group_expense_transaction_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.transaction_id is not null and not exists (
    select 1 from public.transactions transaction
    where transaction.id = new.transaction_id
      and transaction.user_id = new.paid_by
  ) then
    raise exception 'transaction must belong to payer';
  end if;
  return new;
end;
$$;

drop trigger if exists shared_expenses_protect_transaction_owner on public.shared_expenses;
create trigger shared_expenses_protect_transaction_owner
  before insert or update of transaction_id, paid_by on public.shared_expenses
  for each row execute function public.protect_group_expense_transaction_owner();

-- La visibilita e il consumo del budget sono indipendenti: tutte le transazioni
-- autorizzate possono comparire, ma soltanto shared_expenses consuma una quota.
-- La modalita summary maschera in database esercente, conto e categoria personale.
create or replace function public.shared_group_transactions(p_group_id uuid)
returns table (
  id uuid,
  member_id uuid,
  description text,
  amount numeric,
  category text,
  occurred_at timestamptz
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
    select expense.id,
      expense.paid_by as member_id,
      case member.transaction_visibility
        when 'full' then coalesce(transaction.description, expense.description)
        else 'Spesa condivisa'
      end as description,
      expense.amount,
      expense.macro_category as category,
      expense.occurred_at
    from public.shared_expenses expense
    join public.group_members viewer
      on viewer.group_id = expense.group_id and viewer.user_id = auth.uid()
    join public.group_members member
      on member.group_id = expense.group_id and member.user_id = expense.paid_by
    left join public.transactions transaction on transaction.id = expense.transaction_id
    where expense.group_id = p_group_id
      and viewer.transactions_access in ('view', 'edit')
      and member.transaction_visibility <> 'none'

    union all

    select transaction.id,
      transaction.user_id,
      case member.transaction_visibility
        when 'full' then transaction.description
        else 'Movimento condiviso'
      end,
      transaction.amount,
      case
        when member.transaction_visibility = 'full' then transaction.category
        when lower(transaction.category) similar to '%(risparm|invest)%' then 'savings'
        when lower(transaction.category) similar to '%(ristor|viagg|shopping|tempo libero|intratten)%' then 'wants'
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
        where expense.group_id = p_group_id
          and expense.transaction_id = transaction.id
      )
  ) visible
  order by visible.occurred_at desc
  limit 20;
$$;

create or replace function public.family_dashboard_summary(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  selected_group public.groups%rowtype;
  finance jsonb;
  members jsonb := '[]'::jsonb;
  net_worth numeric := 0;
  goals jsonb;
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'group membership required';
  end if;
  select * into selected_group from public.groups where id = p_group_id;
  finance := public.group_finance_overview(p_group_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', member.user_id,
    'displayName', member.display_name,
    'avatarUrl', member.avatar_url
  ) order by member.joined_at), '[]'::jsonb)
  into members from public.group_members member where member.group_id = p_group_id;

  select coalesce(sum(account.current_balance), 0) into net_worth
  from public.group_members member
  join public.financial_accounts account on account.user_id = member.user_id and account.active
  where member.group_id = p_group_id and (
    member.net_worth_visibility = 'all'
    or (member.net_worth_visibility = 'selected' and exists (
      select 1 from public.group_account_shares share
      where share.group_id = p_group_id and share.financial_account_id = account.id
    ))
  );
  with visible as (
    select goal.id, goal.saved_amount, goal.target_amount
    from public.goals goal where goal.group_id = p_group_id and goal.active and goal.status <> 'free_savings'
    union
    select goal.id, goal.saved_amount, goal.target_amount
    from public.goal_group_shares link join public.goals goal on goal.id = link.goal_id
    where link.group_id = p_group_id and goal.active and goal.status <> 'free_savings'
  ) select jsonb_build_object(
    'count', count(*), 'saved', coalesce(sum(saved_amount), 0),
    'target', coalesce(sum(target_amount), 0)
  ) into goals from visible;

  return jsonb_build_object(
    'groupId', selected_group.id, 'groupName', selected_group.name,
    'currency', selected_group.currency,
    'memberCount', jsonb_array_length(members), 'members', members,
    'budgetTotal', coalesce((finance ->> 'planned')::numeric, 0),
    'budgetCovered', coalesce((finance ->> 'covered')::numeric, 0),
    'budgetSpent', coalesce((finance ->> 'spent')::numeric, 0),
    'budgetRemaining', coalesce((finance ->> 'remaining')::numeric, 0),
    'contributions', finance -> 'members',
    'netWorthTotal', net_worth,
    'sharedGoalCount', coalesce((goals ->> 'count')::integer, 0),
    'goalSaved', coalesce((goals ->> 'saved')::numeric, 0),
    'goalTarget', coalesce((goals ->> 'target')::numeric, 0),
    'transactionCount', (select count(*) from public.shared_expenses expense
      where expense.group_id = p_group_id and expense.occurred_at >= date_trunc('month', now())),
    'categoryCount', (select count(distinct expense.macro_category) from public.shared_expenses expense
      where expense.group_id = p_group_id and expense.occurred_at >= date_trunc('month', now()))
  );
end;
$$;

revoke all on function public.set_my_group_contribution(uuid, numeric) from public, anon;
revoke all on function public.set_my_group_privacy(uuid, text, text, uuid[]) from public, anon;
revoke all on function public.refresh_group_monthly_contributions(uuid, date) from public, anon;
revoke all on function public.my_group_allocation_summary() from public, anon;
revoke all on function public.my_group_transaction_links() from public, anon;
revoke all on function public.group_finance_overview(uuid) from public, anon;
revoke all on function public.set_my_group_cycle_disposition(uuid, date, text, uuid) from public, anon;
revoke all on function public.create_group_expense_v2(uuid, text, numeric, timestamptz, text, jsonb, uuid) from public, anon;
grant execute on function public.set_my_group_contribution(uuid, numeric) to authenticated;
grant execute on function public.set_my_group_privacy(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.refresh_group_monthly_contributions(uuid, date) to authenticated;
grant execute on function public.my_group_allocation_summary() to authenticated;
grant execute on function public.my_group_transaction_links() to authenticated;
grant execute on function public.group_finance_overview(uuid) to authenticated;
grant execute on function public.set_my_group_cycle_disposition(uuid, date, text, uuid) to authenticated;
grant execute on function public.create_group_expense_v2(uuid, text, numeric, timestamptz, text, jsonb, uuid) to authenticated;
