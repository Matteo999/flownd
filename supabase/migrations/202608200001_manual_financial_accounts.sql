-- Conti manuali e portafogli contanti con aggiornamenti atomici del saldo.

alter table public.financial_accounts
  add column if not exists account_kind text not null default 'bank',
  add column if not exists balance_as_of timestamptz;

alter table public.financial_accounts
  drop constraint if exists financial_accounts_account_kind_check,
  add constraint financial_accounts_account_kind_check
    check (account_kind in ('bank', 'manual_bank', 'cash_wallet'));

update public.financial_accounts
set account_kind = case
  when source = 'open_banking' then 'bank'
  else 'manual_bank'
end
where account_kind = 'bank';

create or replace function public.create_manual_financial_account(
  p_name text,
  p_account_kind text,
  p_balance numeric,
  p_balance_as_of timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  account_id uuid;
  adjustment_kind text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Account name is required';
  end if;
  if p_account_kind not in ('manual_bank', 'cash_wallet') then
    raise exception 'Invalid manual account kind';
  end if;
  if p_account_kind = 'cash_wallet' and coalesce(p_balance, 0) < 0 then
    raise exception 'Cash wallet balance cannot be negative';
  end if;

  insert into public.financial_accounts (
    user_id,
    name,
    current_balance,
    source,
    currency,
    account_kind,
    balance_as_of,
    last_synced_at,
    active
  ) values (
    auth.uid(),
    trim(p_name),
    coalesce(p_balance, 0),
    'manual',
    'EUR',
    p_account_kind,
    coalesce(p_balance_as_of, now()),
    coalesce(p_balance_as_of, now()),
    true
  )
  returning id into account_id;

  if coalesce(p_balance, 0) <> 0 then
    adjustment_kind := case when p_balance > 0 then 'income' else 'expense' end;
    insert into public.transactions (
      user_id,
      description,
      amount,
      category,
      occurred_at,
      source,
      kind,
      financial_account_id,
      excluded_from_totals,
      internal_transfer,
      excluded_from_budget,
      income_type
    ) values (
      auth.uid(),
      'Saldo iniziale · ' || trim(p_name),
      abs(p_balance),
      'Rettifica patrimonio',
      coalesce(p_balance_as_of, now()),
      'manual_balance_adjustment',
      adjustment_kind,
      account_id,
      true,
      false,
      true,
      case when adjustment_kind = 'income' then 'other_income' else null end
    );
  end if;

  return account_id;
end;
$$;

create or replace function public.set_manual_financial_account_balance(
  p_account_id uuid,
  p_balance numeric,
  p_balance_as_of timestamptz default now()
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_balance_value numeric;
  account_name text;
  account_kind_value text;
  balance_delta numeric;
  adjustment_kind text;
begin
  if p_balance is null then
    raise exception 'Balance is required';
  end if;
  select current_balance, name, account_kind
  into current_balance_value, account_name, account_kind_value
  from public.financial_accounts
  where id = p_account_id
    and user_id = auth.uid()
    and source = 'manual'
    and active = true
  for update;

  if not found then
    raise exception 'Manual account not found';
  end if;
  if account_kind_value = 'cash_wallet' and p_balance < 0 then
    raise exception 'Cash wallet balance cannot be negative';
  end if;

  balance_delta := p_balance - current_balance_value;
  update public.financial_accounts
  set current_balance = p_balance,
      balance_as_of = coalesce(p_balance_as_of, now()),
      last_synced_at = coalesce(p_balance_as_of, now())
  where id = p_account_id;

  if balance_delta <> 0 then
    adjustment_kind := case when balance_delta > 0 then 'income' else 'expense' end;
    insert into public.transactions (
      user_id,
      description,
      amount,
      category,
      occurred_at,
      source,
      kind,
      financial_account_id,
      excluded_from_totals,
      internal_transfer,
      excluded_from_budget,
      income_type
    ) values (
      auth.uid(),
      'Rettifica saldo · ' || account_name,
      abs(balance_delta),
      'Rettifica patrimonio',
      coalesce(p_balance_as_of, now()),
      'manual_balance_adjustment',
      adjustment_kind,
      p_account_id,
      true,
      false,
      true,
      case when adjustment_kind = 'income' then 'other_income' else null end
    );
  end if;

  return true;
end;
$$;

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

  if not found then
    raise exception 'Manual account not found';
  end if;

  next_balance := account_balance + case
    when p_kind = 'income' then p_amount
    else -p_amount
  end;
  if account_kind_value = 'cash_wallet' and next_balance < 0 then
    raise exception 'Insufficient cash wallet balance';
  end if;

  insert into public.transactions (
    user_id,
    description,
    amount,
    category,
    occurred_at,
    source,
    kind,
    financial_account_id,
    excluded_from_totals,
    internal_transfer,
    excluded_from_budget,
    income_type
  ) values (
    auth.uid(),
    trim(p_description),
    p_amount,
    trim(p_category),
    coalesce(p_occurred_at, now()),
    'manual',
    p_kind,
    p_account_id,
    coalesce(p_income_type = 'internal_transfer', false),
    coalesce(p_income_type = 'internal_transfer', false),
    coalesce(p_excluded_from_budget, false),
    p_income_type
  )
  returning id into transaction_id;

  update public.financial_accounts
  set current_balance = next_balance,
      balance_as_of = now(),
      last_synced_at = now()
  where id = p_account_id;

  return transaction_id;
end;
$$;

revoke all on function public.create_manual_financial_account(text, text, numeric, timestamptz) from public;
revoke all on function public.set_manual_financial_account_balance(uuid, numeric, timestamptz) from public;
revoke all on function public.record_manual_financial_account_transaction(uuid, text, numeric, text, text, timestamptz, text, boolean) from public;

grant execute on function public.create_manual_financial_account(text, text, numeric, timestamptz) to authenticated;
grant execute on function public.set_manual_financial_account_balance(uuid, numeric, timestamptz) to authenticated;
grant execute on function public.record_manual_financial_account_transaction(uuid, text, numeric, text, text, timestamptz, text, boolean) to authenticated;
