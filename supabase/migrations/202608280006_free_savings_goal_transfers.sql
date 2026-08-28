-- Spostamenti interni dal Risparmio libero agli obiettivi.
-- Non sono versamenti: non modificano la quota Risparmi del ciclo.

create table if not exists public.goal_savings_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_goal_id uuid not null references public.goals(id) on delete cascade,
  target_goal_id uuid not null references public.goals(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  check (source_goal_id <> target_goal_id)
);

alter table public.goal_savings_transfers enable row level security;

create policy "goal_savings_transfers_own_rows"
  on public.goal_savings_transfers
  for select using (auth.uid() = user_id);

create index if not exists goal_savings_transfers_user_created_idx
  on public.goal_savings_transfers (user_id, created_at desc);

create or replace function public.transfer_free_savings_to_goal(
  p_goal_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_goal public.goals%rowtype;
  target_goal public.goals%rowtype;
  requested_amount numeric := round(greatest(coalesce(p_amount, 0), 0), 2);
  transferred_amount numeric;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if requested_amount <= 0 then raise exception 'amount must be positive'; end if;

  select * into source_goal
  from public.goals
  where user_id = auth.uid()
    and group_id is null
    and status = 'free_savings'
    and active = true
    and deleted_at is null
  limit 1
  for update;
  if not found then raise exception 'free savings not found'; end if;

  select * into target_goal
  from public.goals
  where id = p_goal_id
    and user_id = auth.uid()
    and group_id is null
    and status in ('active', 'reached')
    and active = true
    and deleted_at is null
  for update;
  if not found then raise exception 'target goal not found'; end if;

  transferred_amount := least(
    requested_amount,
    source_goal.saved_amount,
    greatest(target_goal.target_amount - target_goal.saved_amount, 0)
  );
  if transferred_amount <= 0 then
    return jsonb_build_object('transferred', 0);
  end if;

  update public.goals
  set saved_amount = saved_amount - transferred_amount
  where id = source_goal.id;

  update public.goals
  set saved_amount = saved_amount + transferred_amount,
      status = case
        when saved_amount + transferred_amount >= target_amount then 'reached'
        else status
      end
  where id = target_goal.id;

  insert into public.goal_savings_transfers (
    user_id, source_goal_id, target_goal_id, amount
  ) values (
    auth.uid(), source_goal.id, target_goal.id, transferred_amount
  );

  return jsonb_build_object(
    'transferred', transferred_amount,
    'source_goal_id', source_goal.id,
    'target_goal_id', target_goal.id
  );
end;
$$;

revoke all on function public.transfer_free_savings_to_goal(uuid, numeric)
  from public, anon;
grant execute on function public.transfer_free_savings_to_goal(uuid, numeric)
  to authenticated;

-- Se un obiettivo viene eliminato nello stesso ciclo del trasferimento,
-- il denaro torna nel Risparmio libero come gli altri accantonamenti correnti.
create or replace function public.restore_current_goal_transfers_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_day integer;
  today_local date := (now() at time zone 'Europe/Rome')::date;
  cycle_start_date date;
  cycle_end_date date;
  restored record;
begin
  if old.deleted_at is not null or new.deleted_at is null then return new; end if;
  if old.status = 'free_savings' then return new; end if;

  select least(28, greatest(1, budget_cycle_start_day))
  into cycle_day
  from public.profiles
  where id = old.user_id;
  cycle_day := coalesce(cycle_day, 1);
  cycle_start_date := case
    when extract(day from today_local) < cycle_day
      then (date_trunc('month', today_local) - interval '1 month')::date
    else date_trunc('month', today_local)::date
  end + (cycle_day - 1);
  cycle_end_date := (cycle_start_date + interval '1 month')::date;

  for restored in
    select source_goal_id, sum(amount) as amount
    from public.goal_savings_transfers
    where user_id = old.user_id
      and target_goal_id = old.id
      and created_at >= (
        cycle_start_date::timestamp at time zone 'Europe/Rome'
      )
      and created_at < (
        cycle_end_date::timestamp at time zone 'Europe/Rome'
      )
    group by source_goal_id
  loop
    update public.goals
    set saved_amount = saved_amount + restored.amount
    where id = restored.source_goal_id
      and user_id = old.user_id
      and status = 'free_savings';
  end loop;

  delete from public.goal_savings_transfers
  where user_id = old.user_id
    and target_goal_id = old.id
    and created_at >= (
      cycle_start_date::timestamp at time zone 'Europe/Rome'
    )
    and created_at < (
      cycle_end_date::timestamp at time zone 'Europe/Rome'
    );
  return new;
end;
$$;

drop trigger if exists goals_restore_current_transfers_on_delete
  on public.goals;
create trigger goals_restore_current_transfers_on_delete
  before update of deleted_at on public.goals
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.restore_current_goal_transfers_on_delete();
