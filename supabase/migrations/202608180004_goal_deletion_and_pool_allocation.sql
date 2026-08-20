-- Obiettivi cancellabili e allocazione derivata dalla quota Risparmio.

alter table public.goals
  add column if not exists deleted_at timestamptz;

alter table public.goal_contributions
  add column if not exists occurred_at timestamptz;

update public.goal_contributions
set occurred_at = created_at
where occurred_at is null;

update public.goal_contributions as contribution
set occurred_at = transaction.occurred_at
from public.transactions as transaction
where contribution.income_transaction_id = transaction.id;

alter table public.goal_contributions
  alter column occurred_at set default now(),
  alter column occurred_at set not null;

create index if not exists goal_contributions_user_occurred_idx
  on public.goal_contributions (user_id, occurred_at desc);

create or replace function public.delete_goal(p_goal_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_id uuid;
  cycle_start_day integer;
  cycle_today date := (now() at time zone 'Europe/Rome')::date;
  cycle_start date;
  cycle_end date;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select least(28, greatest(1, budget_cycle_start_day))
  into cycle_start_day
  from public.profiles
  where id = auth.uid();
  cycle_start_day := coalesce(cycle_start_day, 1);
  cycle_start :=
    case
      when extract(day from cycle_today) < cycle_start_day
        then (date_trunc('month', cycle_today) - interval '1 month')::date
      else date_trunc('month', cycle_today)::date
    end + (cycle_start_day - 1);
  cycle_end := (cycle_start + interval '1 month')::date;

  delete from public.goal_contributions
  where goal_id = p_goal_id
    and user_id = auth.uid()
    and occurred_at >= cycle_start::timestamptz
    and occurred_at < cycle_end::timestamptz;

  update public.goals
  set active = false,
      deleted_at = now()
  where id = p_goal_id
    and user_id = auth.uid()
  returning id into deleted_id;

  if deleted_id is null then
    return false;
  end if;

  with ranked as (
    select
      id,
      (row_number() over (order by priority, created_at) - 1)::integer as next_priority
    from public.goals
    where user_id = auth.uid() and active = true
  )
  update public.goals as goal
  set priority = ranked.next_priority
  from ranked
  where goal.id = ranked.id;

  return true;
end;
$$;

revoke all on function public.delete_goal(uuid) from public, anon;
grant execute on function public.delete_goal(uuid) to authenticated;

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
  contribution_at timestamptz := now();
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
  from public.profiles where id = p_user_id
  for update;
  allocation_mode := coalesce(allocation_mode, 'priority');

  if p_income_transaction_id is not null then
    select occurred_at into contribution_at
    from public.transactions
    where id = p_income_transaction_id and user_id = p_user_id;
    contribution_at := coalesce(contribution_at, now());
  end if;

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
        (user_id, goal_id, amount, source, income_transaction_id, occurred_at)
      values (p_user_id, goal_row.id, contribution, p_source, p_income_transaction_id, contribution_at);
      allocated := contribution;
      allocation_lines := array_append(
        allocation_lines,
        format('%s a %s', to_char(contribution, 'FM999999990D00'), goal_row.name)
      );
    end if;
  elsif allocation_mode = 'priority' then
    -- La quota Risparmio va al primo obiettivo e l'eccedenza passa al successivo.
    for goal_row in
      select * from public.goals
      where user_id = p_user_id
        and active = true
        and status in ('active', 'free_savings')
      order by
        case when status = 'free_savings' then 1 else 0 end,
        priority asc,
        created_at asc
      for update
    loop
      exit when available_pool - allocated <= 0;
      remaining := case when goal_row.status = 'free_savings'
        then available_pool - allocated
        else greatest(goal_row.target_amount - goal_row.saved_amount, 0) end;
      contribution := least(remaining, available_pool - allocated);
      if contribution > 0 then
        update public.goals set
          saved_amount = saved_amount + contribution,
          status = case
            when status <> 'free_savings' and saved_amount + contribution >= target_amount then 'reached'
            else status end
        where id = goal_row.id;
        insert into public.goal_contributions
          (user_id, goal_id, amount, source, income_transaction_id, occurred_at)
        values (p_user_id, goal_row.id, contribution, p_source, p_income_transaction_id, contribution_at);
        allocated := allocated + contribution;
        allocation_lines := array_append(
          allocation_lines,
          format('%s a %s', to_char(contribution, 'FM999999990D00'), goal_row.name)
        );
      end if;
    end loop;
  else
    -- Le percentuali si applicano agli obiettivi con target.
    for goal_row in
      select * from public.goals
      where user_id = p_user_id and active = true and status = 'active'
      order by priority asc, created_at asc
      for update
    loop
      exit when available_pool - allocated <= 0;
      remaining := greatest(goal_row.target_amount - goal_row.saved_amount, 0);
      contribution := least(
        p_amount * goal_row.allocation_percentage / 100,
        remaining,
        available_pool - allocated
      );
      if contribution > 0 then
        update public.goals set
          saved_amount = saved_amount + contribution,
          status = case
            when saved_amount + contribution >= target_amount then 'reached'
            else status end
        where id = goal_row.id;
        insert into public.goal_contributions
          (user_id, goal_id, amount, source, income_transaction_id, occurred_at)
        values (p_user_id, goal_row.id, contribution, p_source, p_income_transaction_id, contribution_at);
        allocated := allocated + contribution;
        allocation_lines := array_append(
          allocation_lines,
          format('%s a %s', to_char(contribution, 'FM999999990D00'), goal_row.name)
        );
      end if;
    end loop;

  end if;

  -- In entrambe le modalità, l'eccedenza non diretta resta nel Risparmio libero.
  if p_goal_id is null and available_pool - allocated > 0 then
    select * into goal_row from public.goals
    where user_id = p_user_id and active = true and status = 'free_savings'
    order by priority asc, created_at asc
    limit 1
    for update;

    if not found then
      insert into public.goals (
        user_id,
        name,
        target_amount,
        monthly_contribution,
        allocation_percentage,
        priority,
        status
      )
      values (
        p_user_id,
        'Risparmio libero',
        1,
        0,
        0,
        coalesce((select max(priority) + 1 from public.goals where user_id = p_user_id), 0),
        'free_savings'
      )
      returning * into goal_row;
    end if;

    contribution := available_pool - allocated;
    update public.goals
    set saved_amount = saved_amount + contribution
    where id = goal_row.id;
    insert into public.goal_contributions
      (user_id, goal_id, amount, source, income_transaction_id, occurred_at)
    values (p_user_id, goal_row.id, contribution, p_source, p_income_transaction_id, contribution_at);
    allocated := allocated + contribution;
    allocation_lines := array_append(
      allocation_lines,
      format('%s a %s', to_char(contribution, 'FM999999990D00'), goal_row.name)
    );
  end if;

  if p_source = 'open_banking' and allocated > 0 then
    insert into public.goal_notifications (user_id, title, body)
    values (
      p_user_id,
      'Stipendio ricevuto',
      array_to_string(allocation_lines, ', ') || '. Accantonamento virtuale: il denaro resta sul conto.'
    );
  end if;

  return jsonb_build_object(
    'allocated', allocated,
    'unallocated', available_pool - allocated
  );
end;
$$;

revoke all on function public.allocate_goal_pool(uuid, numeric, text, uuid, uuid)
  from public, anon, authenticated;
