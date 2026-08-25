-- Lo stipendio alimenta gli obiettivi soltanto per la percentuale assegnata
-- alla macro Risparmi. In precedenza veniva usato il limite mensile assoluto:
-- uno stipendio inferiore a quel limite poteva quindi essere accantonato al 100%.

create or replace function public.allocate_open_banking_income()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tier text;
  savings_percentage numeric;
  savings_pool numeric;
begin
  if new.kind <> 'income'
    or new.source <> 'open_banking'
    or new.excluded_from_budget
  then
    return new;
  end if;

  if not (
    new.income_type = 'salary'
    or lower(new.category) ~ '(stipend|salary|payroll|pensione)'
    or lower(new.description) ~ '(stipend|salary|payroll|retribuz|pensione)'
  ) then
    return new;
  end if;

  select profile.plan_tier, category.allocation_percentage
  into tier, savings_percentage
  from public.profiles as profile
  left join public.budget_categories as category
    on category.user_id = profile.id
   and category.category_key = 'savings'
   and category.is_macro
  where profile.id = new.user_id;

  if tier not in ('pro', 'max') then return new; end if;

  savings_percentage := least(100, greatest(0, coalesce(savings_percentage, 0)));
  savings_pool := round(new.amount * savings_percentage / 100, 2);
  if savings_pool > 0 then
    perform public.allocate_goal_pool(
      new.user_id,
      savings_pool,
      'open_banking',
      new.id,
      null
    );
  end if;
  return new;
end;
$$;

-- Corregge gli accantonamenti automatici generati dal bug a partire dal giorno
-- in cui è stato osservato. Riduce prima l'ultima destinazione (normalmente il
-- Risparmio libero), senza alterare contributi manuali.
do $$
declare
  correction record;
  contribution record;
  remaining_excess numeric;
  reduction numeric;
begin
  for correction in
    select
      transaction.id as transaction_id,
      transaction.user_id,
      sum(goal_contribution.amount) as allocated_amount,
      round(
        transaction.amount
        * least(100, greatest(0, coalesce(savings.allocation_percentage, 0)))
        / 100,
        2
      ) as expected_amount
    from public.transactions as transaction
    join public.goal_contributions as goal_contribution
      on goal_contribution.income_transaction_id = transaction.id
     and goal_contribution.source = 'open_banking'
    left join public.budget_categories as savings
      on savings.user_id = transaction.user_id
     and savings.category_key = 'savings'
     and savings.is_macro
    where transaction.source = 'open_banking'
      and transaction.kind = 'income'
      and transaction.occurred_at >= '2026-08-25 00:00:00+02'::timestamptz
      and (
        transaction.income_type = 'salary'
        or lower(transaction.category) ~ '(stipend|salary|payroll|pensione)'
        or lower(transaction.description) ~ '(stipend|salary|payroll|retribuz|pensione)'
      )
    group by
      transaction.id,
      transaction.user_id,
      transaction.amount,
      savings.allocation_percentage
    having sum(goal_contribution.amount) > round(
      transaction.amount
      * least(100, greatest(0, coalesce(savings.allocation_percentage, 0)))
      / 100,
      2
    ) + 0.005
  loop
    remaining_excess := correction.allocated_amount - correction.expected_amount;

    for contribution in
      select id, goal_id, amount
      from public.goal_contributions
      where income_transaction_id = correction.transaction_id
        and source = 'open_banking'
      order by created_at desc, id desc
      for update
    loop
      exit when remaining_excess <= 0.005;
      reduction := least(contribution.amount, remaining_excess);

      update public.goals
      set status = case
            when status = 'reached'
             and greatest(0, saved_amount - reduction) < target_amount
              then 'active'
            else status
          end,
          saved_amount = greatest(0, saved_amount - reduction)
      where id = contribution.goal_id;

      if reduction >= contribution.amount - 0.005 then
        delete from public.goal_contributions where id = contribution.id;
      else
        update public.goal_contributions
        set amount = amount - reduction
        where id = contribution.id;
      end if;

      remaining_excess := remaining_excess - reduction;
    end loop;

    update public.goal_notifications
    set body = 'La quota Risparmi dello stipendio è stata ricalcolata correttamente. Accantonamento virtuale: il denaro resta sul conto.'
    where id = (
      select notification.id
      from public.goal_notifications as notification
      where notification.user_id = correction.user_id
        and notification.title = 'Stipendio ricevuto'
        and notification.created_at >= '2026-08-25 00:00:00+02'::timestamptz
      order by notification.created_at desc
      limit 1
    );
  end loop;
end;
$$;

-- La timeline può così ricevere subito le transazioni inserite dal cron, senza
-- richiedere uno swipe o un cambio di periodo.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'transactions'
    )
  then
    alter publication supabase_realtime add table public.transactions;
  end if;
end;
$$;
