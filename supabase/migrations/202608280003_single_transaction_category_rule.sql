-- Espone la stessa memorizzazione già disponibile nella categorizzazione
-- multipla anche alla modifica di un singolo movimento.
create or replace function public.remember_transaction_category(
  p_transaction_id uuid,
  p_category text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  selected_description text;
  selected_kind text;
  selected_financial_account_id uuid;
  description_key text;
begin
  select
    description,
    coalesce(kind, 'expense'),
    financial_account_id
  into
    selected_description,
    selected_kind,
    selected_financial_account_id
  from public.transactions
  where id = p_transaction_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Transaction not found';
  end if;
  if selected_kind <> 'expense' then
    raise exception 'Only expense categories can be remembered';
  end if;

  description_key := public.normalize_transaction_description(selected_description);
  if description_key = '' or trim(coalesce(p_category, '')) = '' then
    raise exception 'Description and category are required';
  end if;

  insert into public.transaction_category_rules (
    user_id,
    description_key,
    kind,
    category,
    financial_account_id,
    updated_at
  )
  values (
    auth.uid(),
    description_key,
    'expense',
    p_category,
    selected_financial_account_id,
    now()
  )
  on conflict (user_id, kind, description_key, financial_account_id)
  do update set
    category = excluded.category,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.remember_transaction_category(uuid, text)
  from public;
grant execute on function public.remember_transaction_category(uuid, text)
  to authenticated;
