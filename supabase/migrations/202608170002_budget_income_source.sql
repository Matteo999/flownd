-- Separa la base reddituale dalle allocazioni del budget.
-- Per i profili storici la vecchia somma dei limiti non è una stima affidabile.

alter table public.profiles
  add column if not exists income_band text;

alter table public.profiles
  drop constraint if exists profiles_income_band_check,
  add constraint profiles_income_band_check check (
    income_band is null or income_band in (
      'under-1000',
      '1000-1500',
      '1500-2000',
      '2000-2500',
      'over-2500'
    )
  );

-- Gli utenti creati prima del salvataggio esplicito della fascia non sono
-- ricostruibili dai limiti: usiamo la fascia centrale come fallback prudente.
update public.profiles
set planned_monthly_income = 1250
where income_band is null;

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
declare
  expected_reference numeric;
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

  expected_reference := case p_income_band
    when 'under-1000' then 800
    when '1000-1500' then 1250
    when '1500-2000' then 1750
    when '2000-2500' then 2250
    when 'over-2500' then 2750
  end;

  if p_planned_monthly_income is null
     or p_planned_monthly_income <> expected_reference then
    raise exception 'planned monthly income does not match income band';
  end if;

  perform public.complete_flownd_onboarding(
    p_budgets,
    p_goal,
    p_transaction
  );

  update public.profiles
  set income_band = p_income_band,
      planned_monthly_income = expected_reference,
      updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.complete_flownd_onboarding_v2(
  jsonb,
  jsonb,
  jsonb,
  text,
  numeric
) to authenticated;
