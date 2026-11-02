-- Base unica del reddito mensile: planned_monthly_income non è più un valore
-- scritto dal client, ma la media delle entrate incluse nel budget degli ultimi
-- tre cicli finanziari chiusi che ne hanno. Senza storico si usa la fascia
-- dell'onboarding. La stessa base alimenta budget, Coach e quote ai gruppi.

alter table public.profiles
  add column if not exists planned_income_source text not null default 'onboarding',
  add column if not exists planned_income_cycles smallint not null default 0;

alter table public.profiles
  drop constraint if exists profiles_planned_income_source_check,
  add constraint profiles_planned_income_source_check
    check (planned_income_source in ('onboarding', 'cycle_average'));

create or replace function public.income_band_reference(p_income_band text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case p_income_band
    when 'under-1000' then 800
    when '1000-1500' then 1250
    when '1500-2000' then 1750
    when '2000-2500' then 2250
    when 'over-2500' then 2750
    else 1250
  end::numeric;
$$;

-- Stessi cicli dell'app (apps/mobile/src/lib/financial-cycle.ts): il giorno
-- configurato, anticipato da uno stipendio arrivato nei dieci giorni prima.
create or replace function public.compute_budget_reference_income(p_user_id uuid)
returns table (amount numeric, source text, cycles integer)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  safe_day integer;
  band text;
  local_today date := (now() at time zone 'Europe/Rome')::date;
begin
  select least(28, greatest(1, coalesce(profile.budget_cycle_start_day, 1))), profile.income_band
  into safe_day, band
  from public.profiles profile
  where profile.id = p_user_id;
  if not found then return; end if;

  return query
  with nominal as (
    select (date_trunc('month', local_today) + make_interval(months => offset_months))::date
      + (safe_day - 1) as day
    from generate_series(-8, 1) as offset_months
  ), boundaries as (
    select distinct coalesce((
      select max((transaction.occurred_at at time zone 'Europe/Rome')::date)
      from public.transactions transaction
      where transaction.user_id = p_user_id
        and transaction.kind = 'income'
        and (transaction.income_type = 'salary' or transaction.category = 'Stipendio')
        and (transaction.occurred_at at time zone 'Europe/Rome')::date >= nominal.day - 10
        and (transaction.occurred_at at time zone 'Europe/Rome')::date < nominal.day
    ), nominal.day) as day
    from nominal
  ), ordered as (
    select day as cycle_start, lead(day) over (order by day) as cycle_end
    from boundaries
  ), closed as (
    select cycle_start, cycle_end
    from ordered
    where cycle_end is not null and cycle_end <= local_today
    order by cycle_start desc
    limit 6
  ), totals as (
    select closed.cycle_start, coalesce(sum(transaction.amount), 0) as income
    from closed
    left join public.transactions transaction
      on transaction.user_id = p_user_id
     and transaction.kind = 'income'
     and not coalesce(transaction.excluded_from_budget, false)
     and transaction.occurred_at >= (closed.cycle_start::timestamp at time zone 'Europe/Rome')
     and transaction.occurred_at < (closed.cycle_end::timestamp at time zone 'Europe/Rome')
    group by closed.cycle_start
  ), recent as (
    -- Un ciclo senza entrate registrate è un buco nei dati, non un reddito zero.
    select income from totals where income > 0 order by cycle_start desc limit 3
  )
  select
    case when count(*) > 0 then round(avg(recent.income), 2)
      else public.income_band_reference(band) end,
    case when count(*) > 0 then 'cycle_average' else 'onboarding' end,
    count(*)::integer
  from recent;
end;
$$;

create or replace function public.materialize_budget_limits(
  p_user_id uuid,
  p_planned_monthly_income numeric
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.budget_categories
  set monthly_limit = round(p_planned_monthly_income * allocation_percentage / 100, 2)
  where user_id = p_user_id and is_macro;

  update public.budget_categories as child
  set monthly_limit = case when child.budget_enabled
    then round(parent.monthly_limit * child.allocation_percentage / 100, 2)
    else 0 end
  from public.budget_categories as parent
  where child.user_id = p_user_id
    and not child.is_macro
    and child.parent_category_key is null
    and parent.user_id = child.user_id
    and parent.category_key = child.parent_key
    and parent.is_macro;

  update public.budget_categories as child
  set monthly_limit = case when child.budget_enabled
    then round(parent.monthly_limit * child.allocation_percentage / 100, 2)
    else 0 end
  from public.budget_categories as parent
  where child.user_id = p_user_id
    and not child.is_macro
    and child.parent_category_key is not null
    and parent.user_id = child.user_id
    and parent.category_key = child.parent_category_key
    and not parent.is_macro;
end;
$$;

create or replace function public.refresh_budget_reference_income(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  reference record;
begin
  select * into reference from public.compute_budget_reference_income(p_user_id);
  if reference.amount is null then return null; end if;

  update public.profiles
  set planned_monthly_income = reference.amount,
      planned_income_source = reference.source,
      planned_income_cycles = reference.cycles,
      updated_at = now()
  where id = p_user_id
    and (planned_monthly_income, planned_income_source, planned_income_cycles)
      is distinct from (reference.amount, reference.source, reference.cycles::smallint);
  if found then
    perform public.materialize_budget_limits(p_user_id, reference.amount);
  end if;

  return jsonb_build_object(
    'amount', reference.amount,
    'source', reference.source,
    'cycles', reference.cycles
  );
end;
$$;

-- All'apertura dell'app: un ciclo può chiudersi senza nuovi movimenti.
create or replace function public.refresh_my_budget_reference_income()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  return public.refresh_budget_reference_income(auth.uid());
end;
$$;

revoke all on function public.compute_budget_reference_income(uuid) from public, anon, authenticated;
revoke all on function public.materialize_budget_limits(uuid, numeric) from public, anon, authenticated;
revoke all on function public.refresh_budget_reference_income(uuid) from public, anon, authenticated;
revoke all on function public.refresh_my_budget_reference_income() from public, anon;
grant execute on function public.refresh_my_budget_reference_income() to authenticated;

-- Il client non scrive più la base: la ricalcola il database.
create or replace function public.protect_budget_reference_income()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.planned_income_source := 'onboarding';
    new.planned_income_cycles := 0;
    return new;
  end if;
  new.planned_monthly_income := old.planned_monthly_income;
  new.planned_income_source := old.planned_income_source;
  new.planned_income_cycles := old.planned_income_cycles;
  return new;
end;
$$;

drop trigger if exists profiles_protect_budget_reference_income on public.profiles;
create trigger profiles_protect_budget_reference_income
  before insert or update on public.profiles
  for each row execute function public.protect_budget_reference_income();

create or replace function public.refresh_reference_income_after_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.refresh_budget_reference_income(new.id);
  return null;
end;
$$;

drop trigger if exists profiles_refresh_budget_reference_income on public.profiles;
create trigger profiles_refresh_budget_reference_income
  after update of budget_cycle_start_day, income_band on public.profiles
  for each row
  when (
    old.budget_cycle_start_day is distinct from new.budget_cycle_start_day
    or old.income_band is distinct from new.income_band
  )
  execute function public.refresh_reference_income_after_profile_change();

-- Trigger per istruzione: un import bancario di centinaia di righe ricalcola la
-- base una sola volta per utente.
create or replace function public.refresh_reference_income_after_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  affected_user uuid;
begin
  if tg_op = 'INSERT' then
    for affected_user in
      select distinct user_id from new_rows where kind = 'income'
    loop
      perform public.refresh_budget_reference_income(affected_user);
    end loop;
  elsif tg_op = 'DELETE' then
    for affected_user in
      select distinct user_id from old_rows where kind = 'income'
    loop
      perform public.refresh_budget_reference_income(affected_user);
    end loop;
  else
    for affected_user in
      select user_id from new_rows where kind = 'income'
      union
      select user_id from old_rows where kind = 'income'
    loop
      perform public.refresh_budget_reference_income(affected_user);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists transactions_refresh_reference_income_insert on public.transactions;
create trigger transactions_refresh_reference_income_insert
  after insert on public.transactions
  referencing new table as new_rows
  for each statement execute function public.refresh_reference_income_after_transactions();

drop trigger if exists transactions_refresh_reference_income_update on public.transactions;
create trigger transactions_refresh_reference_income_update
  after update on public.transactions
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.refresh_reference_income_after_transactions();

drop trigger if exists transactions_refresh_reference_income_delete on public.transactions;
create trigger transactions_refresh_reference_income_delete
  after delete on public.transactions
  referencing old table as old_rows
  for each statement execute function public.refresh_reference_income_after_transactions();

-- Le percentuali restano del client; gli importi si calcolano sulla base del
-- profilo. p_planned_monthly_income resta nella firma per i client esistenti.
create or replace function public.save_budget_allocations(
  p_planned_monthly_income numeric,
  p_allocations jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  allocation jsonb;
  macro_total numeric;
  planned_income numeric;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  select sum((item->>'percentage')::numeric)
  into macro_total
  from jsonb_array_elements(p_allocations) as item
  where coalesce((item->>'isMacro')::boolean, false);

  if macro_total is null or abs(macro_total - 100) > 0.01 then
    raise exception 'macro allocations must total 100 percent';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_allocations) as item
    where (item->>'percentage')::numeric < 0
       or (item->>'percentage')::numeric > 100
       or (
         coalesce((item->>'isMacro')::boolean, false)
         and (item->>'percentage')::numeric <= 0
       )
  ) then
    raise exception 'allocation percentages must be between 0 and 100';
  end if;

  -- Ogni insieme di figli diretti usa al massimo il 100% del proprio padre.
  if exists (
    select 1
    from (
      select
        coalesce(nullif(item->>'parentCategoryId', ''), item->>'parentId') as parent_id,
        sum(
          case when coalesce((item->>'budgetEnabled')::boolean, true)
            then (item->>'percentage')::numeric else 0 end
        ) as total
      from jsonb_array_elements(p_allocations) as item
      where not coalesce((item->>'isMacro')::boolean, false)
      group by coalesce(nullif(item->>'parentCategoryId', ''), item->>'parentId')
    ) as children
    where children.total > 100.01
  ) then
    raise exception 'child allocations cannot exceed 100 percent of their parent';
  end if;

  select planned_monthly_income into planned_income
  from public.profiles where id = current_user_id;
  if planned_income is null or planned_income <= 0 then
    raise exception 'planned monthly income missing';
  end if;

  for allocation in select * from jsonb_array_elements(p_allocations)
  loop
    update public.budget_categories
    set allocation_percentage = (allocation->>'percentage')::numeric,
        budget_enabled = coalesce((allocation->>'budgetEnabled')::boolean, true)
    where user_id = current_user_id
      and category_key = allocation->>'id';
  end loop;

  update public.budget_categories
  set monthly_limit = round(planned_income * allocation_percentage / 100, 2)
  where user_id = current_user_id and is_macro;

  update public.budget_categories as child
  set monthly_limit = case when child.budget_enabled
    then round(parent.monthly_limit * child.allocation_percentage / 100, 2)
    else 0 end
  from public.budget_categories as parent
  where child.user_id = current_user_id
    and not child.is_macro
    and child.parent_category_key is null
    and parent.user_id = child.user_id
    and parent.category_key = child.parent_key
    and parent.is_macro;

  update public.budget_categories as child
  set monthly_limit = case when child.budget_enabled
    then round(parent.monthly_limit * child.allocation_percentage / 100, 2)
    else 0 end
  from public.budget_categories as parent
  where child.user_id = current_user_id
    and not child.is_macro
    and child.parent_category_key is not null
    and parent.user_id = child.user_id
    and parent.category_key = child.parent_category_key
    and not parent.is_macro;
end;
$$;

create or replace function public.complete_flownd_onboarding_v2(
  p_budgets jsonb,
  p_goal jsonb,
  p_transaction jsonb,
  p_income_band text,
  p_planned_monthly_income numeric
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_income_band is null or p_income_band not in (
    'under-1000',
    '1000-1500',
    '1500-2000',
    '2000-2500',
    'over-2500'
  ) then
    raise exception 'invalid income band';
  end if;

  if p_planned_monthly_income is null
     or p_planned_monthly_income <> public.income_band_reference(p_income_band) then
    raise exception 'planned monthly income does not match income band';
  end if;

  perform public.complete_flownd_onboarding(
    p_budgets,
    p_goal,
    p_transaction
  );

  update public.profiles
  set income_band = p_income_band,
      updated_at = now()
  where id = auth.uid();

  -- La fascia è solo il ripiego: con entrate già importate vince la media.
  perform public.refresh_my_budget_reference_income();
end;
$$;

grant execute on function public.complete_flownd_onboarding_v2(
  jsonb,
  jsonb,
  jsonb,
  text,
  numeric
) to authenticated;

do $$
declare
  profile_id uuid;
begin
  for profile_id in select id from public.profiles loop
    perform public.refresh_budget_reference_income(profile_id);
  end loop;
end;
$$;
