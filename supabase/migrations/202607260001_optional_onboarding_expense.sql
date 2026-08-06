-- L'onboarding v2 permette di saltare la prima spesa.
-- Budget e obiettivo restano obbligatori e vengono salvati atomicamente.

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
    insert into public.budget_categories (user_id, category_key, name, emoji, monthly_limit)
    values (
      current_user_id,
      budget->>'id',
      budget->>'name',
      budget->>'emoji',
      (budget->>'amount')::numeric
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
