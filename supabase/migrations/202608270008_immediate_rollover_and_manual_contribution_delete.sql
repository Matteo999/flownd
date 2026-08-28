-- Applica subito l'opzione "Sposta nei risparmi" anche al ciclo gia' chiuso e
-- consente di annullare soltanto i versamenti manuali del ciclo corrente.

create or replace function public.move_latest_cycle_surplus_to_savings(
  p_user_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_closure public.savings_cycle_closures%rowtype;
  opening_at timestamptz;
  closing_at timestamptz;
  cycle_start timestamptz;
  cycle_end timestamptz;
  cycle_income numeric;
  cycle_expenses numeric;
  already_saved numeric;
  surplus numeric;
  deposited numeric;
begin
  select closure.* into selected_closure
  from public.savings_cycle_closures as closure
  where closure.user_id = p_user_id
  order by closure.cycle_closed_at desc, closure.created_at desc
  limit 1
  for update;
  if not found then return 0; end if;

  select occurred_at into opening_at
  from public.transactions
  where id = selected_closure.opening_income_transaction_id
    and user_id = p_user_id;
  select occurred_at into closing_at
  from public.transactions
  where id = selected_closure.closing_income_transaction_id
    and user_id = p_user_id;
  if opening_at is null or closing_at is null then return 0; end if;

  cycle_start := (
    (opening_at at time zone 'Europe/Rome')::date::timestamp
    at time zone 'Europe/Rome'
  );
  cycle_end := (
    (closing_at at time zone 'Europe/Rome')::date::timestamp
    at time zone 'Europe/Rome'
  );

  select
    coalesce(sum(transaction.amount) filter (
      where transaction.kind = 'income'
        and transaction.excluded_from_budget = false
    ), 0),
    coalesce(sum(transaction.amount) filter (
      where transaction.kind <> 'income'
        and transaction.excluded_from_budget = false
        and transaction.internal_transfer = false
    ), 0)
  into cycle_income, cycle_expenses
  from public.transactions as transaction
  where transaction.user_id = p_user_id
    and transaction.excluded_from_totals = false
    and transaction.occurred_at >= cycle_start
    and transaction.occurred_at < cycle_end;

  select coalesce(sum(contribution.amount), 0)
  into already_saved
  from public.goal_contributions as contribution
  where contribution.user_id = p_user_id
    and contribution.occurred_at >= cycle_start
    and contribution.occurred_at < cycle_end;

  surplus := round(greatest(
    0,
    cycle_income - cycle_expenses - already_saved
  ), 2);
  if surplus <= 0 then return 0; end if;

  deposited := public.deposit_free_savings(
    p_user_id,
    surplus,
    selected_closure.closing_income_transaction_id,
    cycle_end - interval '1 microsecond'
  );

  update public.savings_cycle_closures
  set available_amount = greatest(
        available_amount,
        round(greatest(0, cycle_income - cycle_expenses), 2)
      ),
      allocated_amount = allocated_amount + deposited
  where id = selected_closure.id;

  insert into public.goal_notifications (user_id, title, body)
  values (
    p_user_id,
    'Avanzo accantonato',
    format(
      '%s sono stati aggiunti al Risparmio libero.',
      to_char(deposited, 'FM999999990D00') || ' EUR'
    )
  );
  return deposited;
end;
$$;

revoke all on function public.move_latest_cycle_surplus_to_savings(uuid)
  from public, anon, authenticated;

create or replace function public.apply_savings_rollover_preference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.budget_rollover_mode = 'savings'
    and old.budget_rollover_mode is distinct from new.budget_rollover_mode
  then
    perform public.move_latest_cycle_surplus_to_savings(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_apply_savings_rollover on public.profiles;
create trigger profiles_apply_savings_rollover
  after update of budget_rollover_mode on public.profiles
  for each row execute function public.apply_savings_rollover_preference();

-- Allinea anche chi aveva gia' selezionato Risparmi prima di questa migrazione.
do $$
declare
  selected_profile record;
begin
  for selected_profile in
    select id from public.profiles where budget_rollover_mode = 'savings'
  loop
    perform public.move_latest_cycle_surplus_to_savings(selected_profile.id);
  end loop;
end;
$$;

create or replace function public.delete_manual_goal_contribution(
  p_contribution_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_contribution public.goal_contributions%rowtype;
  selected_goal public.goals%rowtype;
  cycle_day integer;
  today_local date := (now() at time zone 'Europe/Rome')::date;
  nominal_start date;
  salary_start date;
  cycle_start timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select least(28, greatest(1, profile.budget_cycle_start_day))
  into cycle_day
  from public.profiles as profile
  where profile.id = auth.uid();
  cycle_day := coalesce(cycle_day, 1);

  nominal_start := case
    when extract(day from today_local) < cycle_day
      then (date_trunc('month', today_local) - interval '1 month')::date
    else date_trunc('month', today_local)::date
  end + (cycle_day - 1);

  select (transaction.occurred_at at time zone 'Europe/Rome')::date
  into salary_start
  from public.transactions as transaction
  where transaction.user_id = auth.uid()
    and transaction.kind = 'income'
    and transaction.excluded_from_totals = false
    and transaction.excluded_from_budget = false
    and (
      transaction.income_type = 'salary'
      or lower(transaction.category) ~ '(stipend|salary|payroll|pensione)'
      or lower(transaction.description) ~ '(stipend|salary|payroll|retribuz|pensione)'
    )
    and (transaction.occurred_at at time zone 'Europe/Rome')::date
      between nominal_start - 10 and nominal_start + 3
    and (transaction.occurred_at at time zone 'Europe/Rome')::date <= today_local
  order by transaction.occurred_at desc
  limit 1;

  cycle_start := (
    coalesce(salary_start, nominal_start)::timestamp
    at time zone 'Europe/Rome'
  );

  select contribution.* into selected_contribution
  from public.goal_contributions as contribution
  where contribution.id = p_contribution_id
    and contribution.user_id = auth.uid()
    and contribution.source = 'manual'
    and contribution.occurred_at >= cycle_start
    and contribution.occurred_at <= now()
  for update;
  if not found then return jsonb_build_object('deleted', false); end if;

  select * into selected_goal
  from public.goals
  where id = selected_contribution.goal_id
    and user_id = auth.uid()
  for update;
  if not found then return jsonb_build_object('deleted', false); end if;

  update public.goals
  set saved_amount = greatest(0, saved_amount - selected_contribution.amount),
      status = case
        when status = 'reached'
         and greatest(0, saved_amount - selected_contribution.amount) < target_amount
          then 'active'
        else status
      end
  where id = selected_goal.id;

  delete from public.goal_contributions
  where id = selected_contribution.id;

  return jsonb_build_object(
    'deleted', true,
    'goal_id', selected_goal.id,
    'amount', selected_contribution.amount
  );
end;
$$;

revoke all on function public.delete_manual_goal_contribution(uuid)
  from public, anon;
grant execute on function public.delete_manual_goal_contribution(uuid)
  to authenticated;
