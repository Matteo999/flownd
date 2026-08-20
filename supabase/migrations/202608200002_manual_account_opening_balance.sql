-- Il saldo iniziale è un attributo del conto; soltanto i movimenti successivi
-- sono transazioni. Le RPC mantengono saldo e movimenti coerenti in modo atomico.

alter table public.financial_accounts
  add column if not exists opening_balance numeric not null default 0,
  add column if not exists opening_balance_as_of timestamptz;

with manual_movements as (
  select
    account.id,
    coalesce(sum(
      case
        when transaction.kind = 'income' then transaction.amount
        else -transaction.amount
      end
    ) filter (where transaction.source <> 'manual_balance_adjustment'), 0) as movement_total,
    min(transaction.occurred_at)
      filter (where transaction.source = 'manual_balance_adjustment') as adjustment_date
  from public.financial_accounts account
  left join public.transactions transaction
    on transaction.financial_account_id = account.id
  where account.source = 'manual'
  group by account.id
)
update public.financial_accounts account
set opening_balance = account.current_balance - movement.movement_total,
    opening_balance_as_of = coalesce(
      movement.adjustment_date,
      account.balance_as_of,
      account.created_at
    )
from manual_movements movement
where account.id = movement.id;

delete from public.transactions transaction
using public.financial_accounts account
where transaction.financial_account_id = account.id
  and account.source = 'manual'
  and transaction.source = 'manual_balance_adjustment';

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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Account name is required'; end if;
  if p_account_kind not in ('manual_bank', 'cash_wallet') then
    raise exception 'Invalid manual account kind';
  end if;
  if p_account_kind = 'cash_wallet' and coalesce(p_balance, 0) < 0 then
    raise exception 'Cash wallet balance cannot be negative';
  end if;

  insert into public.financial_accounts (
    user_id, name, current_balance, opening_balance, source, currency,
    account_kind, balance_as_of, opening_balance_as_of, last_synced_at, active
  ) values (
    auth.uid(), trim(p_name), coalesce(p_balance, 0), coalesce(p_balance, 0),
    'manual', 'EUR', p_account_kind, coalesce(p_balance_as_of, now()),
    coalesce(p_balance_as_of, now()), coalesce(p_balance_as_of, now()), true
  ) returning id into account_id;

  return account_id;
end;
$$;

create or replace function public.update_manual_financial_account_opening_balance(
  p_account_id uuid,
  p_opening_balance numeric,
  p_opening_balance_as_of timestamptz default now()
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  account_record public.financial_accounts%rowtype;
  next_balance numeric;
begin
  if p_opening_balance is null then raise exception 'Opening balance is required'; end if;
  select * into account_record
  from public.financial_accounts
  where id = p_account_id and user_id = auth.uid() and source = 'manual' and active = true
  for update;
  if not found then raise exception 'Manual account not found'; end if;

  next_balance := account_record.current_balance
    + p_opening_balance - account_record.opening_balance;
  if account_record.account_kind = 'cash_wallet' and next_balance < 0 then
    raise exception 'Cash wallet balance cannot be negative';
  end if;

  update public.financial_accounts
  set opening_balance = p_opening_balance,
      opening_balance_as_of = coalesce(p_opening_balance_as_of, now()),
      current_balance = next_balance,
      balance_as_of = now(),
      last_synced_at = now()
  where id = p_account_id;
  return true;
end;
$$;

-- Compatibilità con le versioni già distribuite dell'app: anche il vecchio
-- endpoint modifica esclusivamente il saldo iniziale, senza creare rettifiche.
create or replace function public.set_manual_financial_account_balance(
  p_account_id uuid,
  p_balance numeric,
  p_balance_as_of timestamptz default now()
)
returns boolean
language sql
security invoker
set search_path = public
as $$
  select public.update_manual_financial_account_opening_balance(
    p_account_id,
    p_balance,
    p_balance_as_of
  );
$$;

create or replace function public.delete_manual_financial_account_transaction(
  p_transaction_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  transaction_record public.transactions%rowtype;
  account_record public.financial_accounts%rowtype;
  next_balance numeric;
begin
  select * into transaction_record
  from public.transactions
  where id = p_transaction_id and user_id = auth.uid() and source = 'manual'
  for update;
  if not found or transaction_record.financial_account_id is null then
    raise exception 'Manual account transaction not found';
  end if;

  select * into account_record
  from public.financial_accounts
  where id = transaction_record.financial_account_id
    and user_id = auth.uid() and source = 'manual' and active = true
  for update;
  if not found then raise exception 'Manual account not found'; end if;

  next_balance := account_record.current_balance + case
    when transaction_record.kind = 'income' then -transaction_record.amount
    else transaction_record.amount
  end;
  if account_record.account_kind = 'cash_wallet' and next_balance < 0 then
    raise exception 'Deleting this transaction would make the wallet negative';
  end if;

  delete from public.transactions where id = p_transaction_id;
  update public.financial_accounts
  set current_balance = next_balance, balance_as_of = now(), last_synced_at = now()
  where id = account_record.id;
  return true;
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

create or replace function public.delete_manual_financial_account(p_account_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from public.financial_accounts
  where id = p_account_id and user_id = auth.uid() and source = 'manual'
  for update;
  if not found then raise exception 'Manual account not found'; end if;
  delete from public.transactions
  where financial_account_id = p_account_id and user_id = auth.uid();
  delete from public.financial_accounts
  where id = p_account_id and user_id = auth.uid() and source = 'manual';
  return true;
end;
$$;

revoke all on function public.update_manual_financial_account_opening_balance(uuid, numeric, timestamptz) from public;
revoke all on function public.delete_manual_financial_account_transaction(uuid) from public;
revoke all on function public.update_manual_financial_account_transaction(uuid, text, numeric, text, text, timestamptz, text, boolean) from public;
revoke all on function public.delete_manual_financial_account(uuid) from public;
grant execute on function public.update_manual_financial_account_opening_balance(uuid, numeric, timestamptz) to authenticated;
grant execute on function public.delete_manual_financial_account_transaction(uuid) to authenticated;
grant execute on function public.update_manual_financial_account_transaction(uuid, text, numeric, text, text, timestamptz, text, boolean) to authenticated;
grant execute on function public.delete_manual_financial_account(uuid) to authenticated;
