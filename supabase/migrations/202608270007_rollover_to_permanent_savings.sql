-- L'avanzo puo' soltanto essere riportato al budget successivo oppure versato
-- nella riserva permanente Risparmio libero.

update public.profiles
set budget_rollover_mode = 'carry'
where budget_rollover_mode = 'reset';

alter table public.profiles
  drop constraint if exists profiles_budget_rollover_mode_check;
alter table public.profiles
  add constraint profiles_budget_rollover_mode_check check (
    budget_rollover_mode in ('savings', 'carry')
  );

-- Riunisce eventuali vecchi contatori, inclusi quelli eliminati in passato,
-- conservando come saldo la somma dei versamenti ancora presenti nello storico.
do $$
declare
  savings_owner record;
  keeper_id uuid;
  savings_balance numeric;
begin
  for savings_owner in
    select distinct user_id
    from public.goals
    where status = 'free_savings'
      and group_id is null
  loop
    select id into keeper_id
    from public.goals
    where user_id = savings_owner.user_id
      and status = 'free_savings'
      and group_id is null
    order by
      case when active and deleted_at is null then 0 else 1 end,
      created_at,
      id
    limit 1;

    update public.goal_contributions
    set goal_id = keeper_id,
        group_id = null
    where goal_id in (
      select id from public.goals
      where user_id = savings_owner.user_id
        and status = 'free_savings'
        and group_id is null
        and id <> keeper_id
    );

    select coalesce(sum(amount), 0)
    into savings_balance
    from public.goal_contributions
    where goal_id = keeper_id;

    update public.goals
    set name = 'Risparmio libero',
        target_amount = 1,
        saved_amount = savings_balance,
        allocation_percentage = 0,
        monthly_contribution = 0,
        status = 'free_savings',
        active = true,
        deleted_at = null,
        completed_at = null
    where id = keeper_id;

    update public.goals
    set active = false,
        deleted_at = coalesce(deleted_at, now())
    where user_id = savings_owner.user_id
      and status = 'free_savings'
      and group_id is null
      and id <> keeper_id;
  end loop;
end;
$$;

insert into public.goals (
  user_id,
  name,
  target_amount,
  saved_amount,
  monthly_contribution,
  allocation_percentage,
  priority,
  status,
  active
)
select
  profile.id,
  'Risparmio libero',
  1,
  0,
  0,
  0,
  coalesce((
    select max(goal.priority) + 1
    from public.goals as goal
    where goal.user_id = profile.id and goal.group_id is null
  ), 0),
  'free_savings',
  true
from public.profiles as profile
where profile.plan_tier in ('pro', 'max')
  and not exists (
    select 1 from public.goals as goal
    where goal.user_id = profile.id
      and goal.group_id is null
      and goal.status = 'free_savings'
      and goal.active = true
      and goal.deleted_at is null
  );

create unique index if not exists goals_one_personal_free_savings_idx
  on public.goals (user_id)
  where group_id is null
    and status = 'free_savings'
    and active = true
    and deleted_at is null;

drop policy if exists "goals_personal_own_rows" on public.goals;
create policy "goals_personal_select" on public.goals
  for select using (auth.uid() = user_id and group_id is null);
create policy "goals_personal_insert" on public.goals
  for insert with check (
    auth.uid() = user_id
    and group_id is null
    and status <> 'free_savings'
  );
create policy "goals_personal_update" on public.goals
  for update using (
    auth.uid() = user_id
    and group_id is null
    and status <> 'free_savings'
  ) with check (
    auth.uid() = user_id
    and group_id is null
    and status <> 'free_savings'
  );
create policy "goals_personal_delete" on public.goals
  for delete using (
    auth.uid() = user_id
    and group_id is null
    and status <> 'free_savings'
  );

create or replace function public.deposit_free_savings(
  p_user_id uuid,
  p_amount numeric,
  p_income_transaction_id uuid,
  p_occurred_at timestamptz
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  free_goal_id uuid;
  safe_amount numeric := round(greatest(coalesce(p_amount, 0), 0), 2);
begin
  if safe_amount <= 0 then return 0; end if;

  select id into free_goal_id
  from public.goals
  where user_id = p_user_id
    and group_id is null
    and status = 'free_savings'
    and active = true
    and deleted_at is null
  limit 1
  for update;

  if free_goal_id is null then
    insert into public.goals (
      user_id,
      name,
      target_amount,
      saved_amount,
      monthly_contribution,
      allocation_percentage,
      priority,
      status,
      active
    ) values (
      p_user_id,
      'Risparmio libero',
      1,
      0,
      0,
      0,
      coalesce((
        select max(priority) + 1
        from public.goals
        where user_id = p_user_id and group_id is null
      ), 0),
      'free_savings',
      true
    ) returning id into free_goal_id;
  end if;

  update public.goals
  set saved_amount = saved_amount + safe_amount
  where id = free_goal_id;

  insert into public.goal_contributions (
    user_id,
    contributor_id,
    goal_id,
    amount,
    source,
    income_transaction_id,
    occurred_at
  ) values (
    p_user_id,
    p_user_id,
    free_goal_id,
    safe_amount,
    'open_banking',
    p_income_transaction_id,
    p_occurred_at
  );

  return safe_amount;
end;
$$;

revoke all on function public.deposit_free_savings(uuid, numeric, uuid, timestamptz)
  from public, anon, authenticated;

create or replace function public.deposit_cycle_surplus_into_savings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rollover_mode text;
  surplus numeric;
  deposited numeric;
begin
  select budget_rollover_mode into rollover_mode
  from public.profiles
  where id = new.user_id;

  if rollover_mode <> 'savings' then return new; end if;

  surplus := round(greatest(
    0,
    new.available_amount - new.allocated_amount
  ), 2);
  if surplus <= 0 then return new; end if;

  deposited := public.deposit_free_savings(
    new.user_id,
    surplus,
    new.closing_income_transaction_id,
    new.cycle_closed_at - interval '1 microsecond'
  );

  update public.savings_cycle_closures
  set allocated_amount = allocated_amount + deposited
  where id = new.id;

  insert into public.goal_notifications (user_id, title, body)
  values (
    new.user_id,
    'Avanzo accantonato',
    format(
      '%s sono stati aggiunti al Risparmio libero alla chiusura del ciclo.',
      to_char(deposited, 'FM999999990D00') || ' EUR'
    )
  );
  return new;
end;
$$;

drop trigger if exists savings_cycle_closures_deposit_surplus
  on public.savings_cycle_closures;
create trigger savings_cycle_closures_deposit_surplus
  after insert on public.savings_cycle_closures
  for each row execute function public.deposit_cycle_surplus_into_savings();

-- La riserva di sistema non e' un obiettivo e non puo' essere eliminata.
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

  select goal.id
  into deleted_id
  from public.goals as goal
  where goal.id = p_goal_id
    and goal.user_id = auth.uid()
    and goal.deleted_at is null
    and goal.status <> 'free_savings'
    and (goal.active = true or goal.status = 'completed')
  for update;

  if deleted_id is null then return false; end if;

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
  where goal_id = deleted_id
    and user_id = auth.uid()
    and occurred_at >= (cycle_start::timestamp at time zone 'Europe/Rome')
    and occurred_at < (cycle_end::timestamp at time zone 'Europe/Rome');

  update public.goals
  set active = false,
      deleted_at = now()
  where id = deleted_id;

  with ranked as (
    select
      id,
      (row_number() over (order by priority, created_at) - 1)::integer
        as next_priority
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
