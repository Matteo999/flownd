-- Integra il modello 50/30/20 con le categorie storiche.
-- Le macro-categorie definiscono il piano; le categorie esistenti restano come dettaglio.

alter table public.budget_categories
  add column if not exists parent_key text,
  add column if not exists is_macro boolean not null default false;

update public.budget_categories
set
  is_macro = category_key in ('needs', 'wants', 'savings'),
  parent_key = case
    when category_key in ('needs', 'wants', 'savings') then category_key
    when lower(category_key) in ('groceries', 'transport', 'home', 'bills', 'health')
      or lower(name) in ('spesa', 'trasporti', 'casa', 'bollette', 'salute', 'affitto', 'utenze')
      then 'needs'
    when lower(category_key) in ('savings', 'investments')
      or lower(name) in ('risparmi', 'investimenti', 'fondo emergenza')
      then 'savings'
    else 'wants'
  end;

update public.budget_categories
set emoji = case category_key
  when 'needs' then '🏠'
  when 'wants' then '🧳'
  when 'savings' then '🐷'
  else emoji
end
where is_macro;

-- Per i profili precedenti crea una quota macro iniziale partendo dalle categorie
-- già configurate. Le righe di dettaglio non vengono cancellate.
insert into public.budget_categories (
  user_id,
  category_key,
  name,
  emoji,
  monthly_limit,
  parent_key,
  is_macro
)
select
  user_id,
  'needs',
  'Necessità',
  '🏠',
  sum(monthly_limit),
  'needs',
  true
from public.budget_categories
where not is_macro and parent_key = 'needs'
group by user_id
on conflict (user_id, category_key) do nothing;

insert into public.budget_categories (
  user_id,
  category_key,
  name,
  emoji,
  monthly_limit,
  parent_key,
  is_macro
)
select
  user_id,
  'wants',
  'Desideri',
  '🧳',
  sum(monthly_limit),
  'wants',
  true
from public.budget_categories
where not is_macro and parent_key = 'wants'
group by user_id
on conflict (user_id, category_key) do nothing;

insert into public.budget_categories (
  user_id,
  category_key,
  name,
  emoji,
  monthly_limit,
  parent_key,
  is_macro
)
select
  user_id,
  'savings',
  'Risparmi',
  '🐷',
  greatest(1, round(sum(monthly_limit) * 0.25, 2)),
  'savings',
  true
from public.budget_categories
where not is_macro
group by user_id
on conflict (user_id, category_key) do nothing;

create or replace function public.complete_flownd_onboarding(
  p_budgets jsonb,
  p_goal jsonb,
  p_transaction jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  budget jsonb;
  transaction_amount numeric;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if jsonb_array_length(p_budgets) <> 3 then
    raise exception 'three budget allocations are required';
  end if;

  insert into public.profiles (id, onboarding_completed, onboarding_completed_at, updated_at)
  values (current_user_id, true, now(), now())
  on conflict (id) do update set
    onboarding_completed = true,
    onboarding_completed_at = now(),
    updated_at = now();

  delete from public.budget_categories where user_id = current_user_id;
  for budget in select * from jsonb_array_elements(p_budgets)
  loop
    insert into public.budget_categories (
      user_id,
      category_key,
      name,
      emoji,
      monthly_limit,
      parent_key,
      is_macro
    )
    values (
      current_user_id,
      budget->>'id',
      budget->>'name',
      budget->>'emoji',
      (budget->>'amount')::numeric,
      budget->>'id',
      true
    );
  end loop;

  update public.goals
  set active = false
  where user_id = current_user_id and active = true;

  insert into public.goals (user_id, name, target_amount, deadline_label)
  values (
    current_user_id,
    p_goal->>'name',
    (p_goal->>'targetAmount')::numeric,
    nullif(p_goal->>'deadline', '')
  );

  transaction_amount := coalesce(nullif(p_transaction->>'amount', '')::numeric, 0);
  if transaction_amount > 0 and nullif(trim(p_transaction->>'description'), '') is not null then
    insert into public.transactions (user_id, description, amount, category, source)
    values (
      current_user_id,
      p_transaction->>'description',
      transaction_amount,
      coalesce(nullif(p_transaction->>'category', ''), 'Altro'),
      'onboarding'
    );
  end if;
end;
$$;

grant execute on function public.complete_flownd_onboarding(jsonb, jsonb, jsonb) to authenticated;
