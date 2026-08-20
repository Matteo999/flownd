-- Evita che il confronto con un income_type nullo produca flag booleani nulli.

create or replace function public.record_manual_financial_account_transaction(
  p_account_id uuid,
  p_description text,
  p_amount numeric,
  p_category text,
  p_kind text,
  p_occurred_at timestamptz,
  p_income_type text default null,
  p_excluded_from_budget boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  account_balance numeric;
  account_kind_value text;
  next_balance numeric;
  transaction_id uuid;
begin
  if trim(coalesce(p_description, '')) = ''
    or trim(coalesce(p_category, '')) = ''
    or p_amount is null
    or p_amount <= 0 then
    raise exception 'Invalid transaction';
  end if;
  if p_kind not in ('expense', 'income') then
    raise exception 'Invalid transaction kind';
  end if;

  select current_balance, account_kind
  into account_balance, account_kind_value
  from public.financial_accounts
  where id = p_account_id
    and user_id = auth.uid()
    and source = 'manual'
    and active = true
  for update;

  if not found then raise exception 'Manual account not found'; end if;

  next_balance := account_balance + case
    when p_kind = 'income' then p_amount
    else -p_amount
  end;
  if account_kind_value = 'cash_wallet' and next_balance < 0 then
    raise exception 'Insufficient cash wallet balance';
  end if;

  insert into public.transactions (
    user_id, description, amount, category, occurred_at, source, kind,
    financial_account_id, excluded_from_totals, internal_transfer,
    excluded_from_budget, income_type
  ) values (
    auth.uid(), trim(p_description), p_amount, trim(p_category),
    coalesce(p_occurred_at, now()), 'manual', p_kind, p_account_id,
    coalesce(p_income_type = 'internal_transfer', false),
    coalesce(p_income_type = 'internal_transfer', false),
    coalesce(p_excluded_from_budget, false), p_income_type
  ) returning id into transaction_id;

  update public.financial_accounts
  set current_balance = next_balance,
      balance_as_of = now(),
      last_synced_at = now()
  where id = p_account_id;

  return transaction_id;
end;
$$;

create or replace function public.update_manual_financial_account_transaction(
  p_transaction_id uuid,
  p_description text,
  p_amount numeric,
  p_category text,
  p_kind text,
  p_occurred_at timestamptz,
  p_income_type text default null,
  p_excluded_from_budget boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  transaction_record public.transactions%rowtype;
  account_record public.financial_accounts%rowtype;
  old_effect numeric;
  new_effect numeric;
  next_balance numeric;
begin
  if trim(coalesce(p_description, '')) = '' or trim(coalesce(p_category, '')) = ''
    or p_amount is null or p_amount <= 0 or p_kind not in ('expense', 'income') then
    raise exception 'Invalid transaction';
  end if;
  select * into transaction_record from public.transactions
  where id = p_transaction_id and user_id = auth.uid() and source = 'manual'
  for update;
  if not found or transaction_record.financial_account_id is null then
    raise exception 'Manual account transaction not found';
  end if;
  select * into account_record from public.financial_accounts
  where id = transaction_record.financial_account_id
    and user_id = auth.uid() and source = 'manual' and active = true
  for update;
  if not found then raise exception 'Manual account not found'; end if;

  old_effect := case when transaction_record.kind = 'income'
    then transaction_record.amount else -transaction_record.amount end;
  new_effect := case when p_kind = 'income' then p_amount else -p_amount end;
  next_balance := account_record.current_balance - old_effect + new_effect;
  if account_record.account_kind = 'cash_wallet' and next_balance < 0 then
    raise exception 'Insufficient cash wallet balance';
  end if;

  update public.transactions set
    description = trim(p_description), amount = p_amount, category = trim(p_category),
    kind = p_kind, occurred_at = coalesce(p_occurred_at, occurred_at),
    income_type = p_income_type,
    excluded_from_budget = coalesce(p_excluded_from_budget, false),
    internal_transfer = coalesce(p_income_type = 'internal_transfer', false),
    excluded_from_totals = coalesce(p_income_type = 'internal_transfer', false)
  where id = p_transaction_id;
  update public.financial_accounts
  set current_balance = next_balance, balance_as_of = now(), last_synced_at = now()
  where id = account_record.id;
  return true;
end;
$$;

revoke all on function public.record_manual_financial_account_transaction(uuid, text, numeric, text, text, timestamptz, text, boolean) from public;
revoke all on function public.update_manual_financial_account_transaction(uuid, text, numeric, text, text, timestamptz, text, boolean) from public;
grant execute on function public.record_manual_financial_account_transaction(uuid, text, numeric, text, text, timestamptz, text, boolean) to authenticated;
grant execute on function public.update_manual_financial_account_transaction(uuid, text, numeric, text, text, timestamptz, text, boolean) to authenticated;
