-- Accantona i risparmi soltanto quando lo stipendio successivo chiude il ciclo.
-- Il calcolo usa il residuo realmente disponibile e non puo' superare la quota
-- pianificata sullo stipendio che aveva aperto il ciclo.

drop trigger if exists transactions_allocate_open_banking_income
  on public.transactions;
drop function if exists public.allocate_open_banking_income();

create table if not exists public.savings_cycle_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opening_income_transaction_id uuid not null
    references public.transactions(id) on delete cascade,
  closing_income_transaction_id uuid not null
    references public.transactions(id) on delete cascade,
  cycle_started_at timestamptz not null,
  cycle_closed_at timestamptz not null,
  planned_amount numeric(12, 2) not null default 0,
  available_amount numeric(12, 2) not null default 0,
  allocated_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (closing_income_transaction_id)
);

alter table public.savings_cycle_closures enable row level security;

create index if not exists savings_cycle_closures_user_closed_idx
  on public.savings_cycle_closures (user_id, cycle_closed_at desc);

-- Uno stipendio secondario non deve spezzare il mese finanziario. E' una
-- chiusura soltanto se cade vicino al giorno configurato (inclusi anticipi per
-- festivita' e il consueto anticipo di dicembre).
create or replace function public.is_financial_cycle_main_income(
  p_occurred_at timestamptz,
  p_cycle_start_day integer
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  local_day date := (p_occurred_at at time zone 'Europe/Rome')::date;
  safe_day integer := least(28, greatest(1, coalesce(p_cycle_start_day, 1)));
  current_nominal date;
  next_nominal date;
begin
  current_nominal := date_trunc('month', local_day)::date + (safe_day - 1);
  next_nominal := (date_trunc('month', local_day) + interval '1 month')::date
    + (safe_day - 1);
  return local_day between current_nominal - 10 and current_nominal + 3
    or local_day between next_nominal - 10 and next_nominal + 3;
end;
$$;

revoke all on function public.is_financial_cycle_main_income(timestamptz, integer)
  from public, anon, authenticated;

-- Rimuove soltanto l'accantonamento collegato all'ultimo ciclo ancora aperto.
-- I cicli storici restano invariati.
do $$
declare
  open_income record;
  contribution record;
  removed_notification boolean;
begin
  for open_income in
    select distinct on (transaction.user_id)
      transaction.id,
      transaction.user_id
    from public.transactions as transaction
    join public.profiles as profile on profile.id = transaction.user_id
    where transaction.kind = 'income'
      and transaction.source = 'open_banking'
      and transaction.excluded_from_totals = false
      and transaction.excluded_from_budget = false
      and (
        transaction.income_type = 'salary'
        or lower(transaction.category) ~ '(stipend|salary|payroll|pensione)'
        or lower(transaction.description) ~ '(stipend|salary|payroll|retribuz|pensione)'
      )
      and public.is_financial_cycle_main_income(
        transaction.occurred_at,
        profile.budget_cycle_start_day
      )
    order by transaction.user_id, transaction.occurred_at desc, transaction.id desc
  loop
    removed_notification := false;
    for contribution in
      select id, goal_id, amount
      from public.goal_contributions
      where income_transaction_id = open_income.id
        and source = 'open_banking'
      order by created_at desc, id desc
      for update
    loop
      update public.goals
      set saved_amount = greatest(0, saved_amount - contribution.amount),
          status = case
            when status = 'reached'
             and greatest(0, saved_amount - contribution.amount) < target_amount
              then 'active'
            else status
          end
      where id = contribution.goal_id;

      delete from public.goal_contributions where id = contribution.id;
      removed_notification := true;
    end loop;

    if removed_notification then
      delete from public.goal_notifications
      where id = (
        select notification.id
        from public.goal_notifications as notification
        where notification.user_id = open_income.user_id
          and notification.title = 'Stipendio ricevuto'
        order by notification.created_at desc
        limit 1
      );
    end if;
  end loop;
end;
$$;

-- Le entrate principali gia' presenti sono una baseline: non ricalcoliamo il
-- passato al deploy. Il prossimo stipendio chiudera' invece il ciclo corrente.
with main_incomes as (
  select
    transaction.id,
    transaction.user_id,
    transaction.occurred_at,
    lag(transaction.id) over (
      partition by transaction.user_id
      order by transaction.occurred_at, transaction.id
    ) as previous_id,
    lag(transaction.occurred_at) over (
      partition by transaction.user_id
      order by transaction.occurred_at, transaction.id
    ) as previous_occurred_at
  from public.transactions as transaction
  join public.profiles as profile on profile.id = transaction.user_id
  where transaction.kind = 'income'
    and transaction.source = 'open_banking'
    and transaction.excluded_from_totals = false
    and transaction.excluded_from_budget = false
    and (
      transaction.income_type = 'salary'
      or lower(transaction.category) ~ '(stipend|salary|payroll|pensione)'
      or lower(transaction.description) ~ '(stipend|salary|payroll|retribuz|pensione)'
    )
    and public.is_financial_cycle_main_income(
      transaction.occurred_at,
      profile.budget_cycle_start_day
    )
)
insert into public.savings_cycle_closures (
  user_id,
  opening_income_transaction_id,
  closing_income_transaction_id,
  cycle_started_at,
  cycle_closed_at,
  planned_amount,
  available_amount,
  allocated_amount
)
select
  user_id,
  previous_id,
  id,
  previous_occurred_at,
  occurred_at,
  0,
  0,
  0
from main_incomes
where previous_id is not null
on conflict (closing_income_transaction_id) do nothing;

create or replace function public.finalize_deferred_savings(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row record;
  closing_income record;
  opening_income record;
  cycle_start timestamptz;
  cycle_end timestamptz;
  savings_percentage numeric;
  planned_pool numeric;
  cycle_income numeric;
  cycle_expenses numeric;
  manual_savings numeric;
  available_pool numeric;
  allocation_pool numeric;
  allocation_result jsonb;
  allocated_pool numeric;
  processed integer := 0;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'access denied';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select
    profile.plan_tier,
    profile.budget_cycle_start_day,
    least(100, greatest(0, coalesce(savings.allocation_percentage, 0)))
      as savings_percentage
  into profile_row
  from public.profiles as profile
  left join public.budget_categories as savings
    on savings.user_id = profile.id
   and savings.category_key = 'savings'
   and savings.is_macro
  where profile.id = p_user_id;

  if not found or profile_row.plan_tier not in ('pro', 'max') then
    return jsonb_build_object('processed', 0, 'allocated', 0);
  end if;
  savings_percentage := profile_row.savings_percentage;

  for closing_income in
    select transaction.*
    from public.transactions as transaction
    where transaction.user_id = p_user_id
      and transaction.kind = 'income'
      and transaction.source = 'open_banking'
      and transaction.excluded_from_totals = false
      and transaction.excluded_from_budget = false
      and (
        transaction.income_type = 'salary'
        or lower(transaction.category) ~ '(stipend|salary|payroll|pensione)'
        or lower(transaction.description) ~ '(stipend|salary|payroll|retribuz|pensione)'
      )
      and public.is_financial_cycle_main_income(
        transaction.occurred_at,
        profile_row.budget_cycle_start_day
      )
      and not exists (
        select 1 from public.savings_cycle_closures as closure
        where closure.closing_income_transaction_id = transaction.id
      )
    order by transaction.occurred_at, transaction.id
  loop
    select transaction.*
    into opening_income
    from public.transactions as transaction
    where transaction.user_id = p_user_id
      and transaction.kind = 'income'
      and transaction.source = 'open_banking'
      and transaction.excluded_from_totals = false
      and transaction.excluded_from_budget = false
      and transaction.occurred_at < closing_income.occurred_at
      and (
        transaction.income_type = 'salary'
        or lower(transaction.category) ~ '(stipend|salary|payroll|pensione)'
        or lower(transaction.description) ~ '(stipend|salary|payroll|retribuz|pensione)'
      )
      and public.is_financial_cycle_main_income(
        transaction.occurred_at,
        profile_row.budget_cycle_start_day
      )
    order by transaction.occurred_at desc, transaction.id desc
    limit 1;

    -- Il primo stipendio osservato apre il ciclo ma non accantona nulla.
    if not found then
      continue;
    end if;

    cycle_start := (
      (opening_income.occurred_at at time zone 'Europe/Rome')::date::timestamp
      at time zone 'Europe/Rome'
    );
    cycle_end := (
      (closing_income.occurred_at at time zone 'Europe/Rome')::date::timestamp
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
    into manual_savings
    from public.goal_contributions as contribution
    where contribution.user_id = p_user_id
      and contribution.source = 'manual'
      and contribution.occurred_at >= cycle_start
      and contribution.occurred_at < cycle_end;

    planned_pool := round(
      opening_income.amount * savings_percentage / 100,
      2
    );
    available_pool := round(greatest(
      0,
      cycle_income - cycle_expenses - manual_savings
    ), 2);
    allocation_pool := least(planned_pool, available_pool);
    allocated_pool := 0;

    if allocation_pool > 0 then
      allocation_result := public.allocate_goal_pool(
        p_user_id,
        allocation_pool,
        'open_banking',
        closing_income.id,
        null
      );
      allocated_pool := coalesce((allocation_result ->> 'allocated')::numeric, 0);

      -- Il contributo appartiene al ciclo appena chiuso, non a quello aperto
      -- dal nuovo stipendio.
      update public.goal_contributions
      set occurred_at = cycle_end - interval '1 microsecond'
      where income_transaction_id = closing_income.id
        and source = 'open_banking';

      delete from public.goal_notifications
      where id = (
        select notification.id
        from public.goal_notifications as notification
        where notification.user_id = p_user_id
          and notification.title = 'Stipendio ricevuto'
        order by notification.created_at desc, notification.id desc
        limit 1
      );
    end if;

    insert into public.savings_cycle_closures (
      user_id,
      opening_income_transaction_id,
      closing_income_transaction_id,
      cycle_started_at,
      cycle_closed_at,
      planned_amount,
      available_amount,
      allocated_amount
    ) values (
      p_user_id,
      opening_income.id,
      closing_income.id,
      cycle_start,
      cycle_end,
      planned_pool,
      available_pool,
      allocated_pool
    ) on conflict (closing_income_transaction_id) do nothing;

    if planned_pool > 0 then
      insert into public.goal_notifications (user_id, title, body)
      values (
        p_user_id,
        case when allocated_pool > 0
          then 'Risparmi accantonati'
          else 'Ciclo mensile concluso'
        end,
        case
          when allocated_pool >= planned_pool - 0.005 then
            format(
              'Hai accantonato %s come pianificato. Il denaro resta sul conto.',
              to_char(allocated_pool, 'FM999999990D00') || ' EUR'
            )
          when allocated_pool > 0 then
            format(
              'Hai accantonato %s dei %s pianificati, in base al residuo effettivo del mese.',
              to_char(allocated_pool, 'FM999999990D00') || ' EUR',
              to_char(planned_pool, 'FM999999990D00') || ' EUR'
            )
          else
            format(
              'Questo mese non c''era un residuo disponibile per i %s pianificati.',
              to_char(planned_pool, 'FM999999990D00') || ' EUR'
            )
        end
      );
    end if;
    processed := processed + 1;
  end loop;

  return jsonb_build_object('processed', processed);
end;
$$;

revoke all on function public.finalize_deferred_savings(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_deferred_savings(uuid)
  to service_role;
