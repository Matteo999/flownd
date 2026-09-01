-- Serie ricorrenti, occorrenze previste e collegamento ai movimenti reali.

alter table public.recurring_payments
  rename column kind to series_type;

alter table public.recurring_payments
  drop constraint if exists recurring_payments_kind_check,
  add constraint recurring_payments_series_type_check
    check (series_type in ('loan', 'subscription', 'custom'));

alter table public.recurring_payments
  add column if not exists direction text not null default 'expense'
    check (direction in ('expense', 'income')),
  add column if not exists origin text not null default 'manual'
    check (origin in ('detected', 'manual', 'loan')),
  add column if not exists status text not null default 'active'
    check (status in ('active', 'paused', 'dismissed', 'completed')),
  add column if not exists frequency text not null default 'monthly'
    check (frequency in ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual')),
  add column if not exists category text not null default 'Altro',
  add column if not exists anchor_on date,
  add column if not exists next_due_on date,
  add column if not exists financial_account_id uuid
    references public.financial_accounts(id) on delete set null,
  add column if not exists settlement_mode text not null default 'manual_post'
    check (settlement_mode in ('bank_match', 'manual_post', 'review')),
  add column if not exists amount_tolerance numeric(5, 4) not null default 0.25
    check (amount_tolerance between 0 and 1),
  add column if not exists date_tolerance_days integer not null default 10
    check (date_tolerance_days between 0 and 10),
  add column if not exists detection_signature text,
  add column if not exists loan_id uuid references public.loans(id) on delete set null,
  add column if not exists occurrence_limit integer
    check (occurrence_limit is null or occurrence_limit > 0),
  add column if not exists occurrences_completed integer not null default 0
    check (occurrences_completed >= 0),
  add column if not exists updated_at timestamptz not null default now();

update public.recurring_payments
set anchor_on = coalesce(anchor_on, next_due_at::date),
    next_due_on = coalesce(next_due_on, next_due_at::date),
    origin = case when series_type = 'loan' then 'loan' else origin end,
    status = case when active then 'active' else 'paused' end,
    category = case when series_type = 'loan' then 'Assicurazioni e Finanza' else category end
where anchor_on is null or next_due_on is null;

alter table public.recurring_payments
  alter column anchor_on set not null,
  alter column next_due_on set not null;

alter table public.transactions
  add column if not exists recurring_payment_id uuid
    references public.recurring_payments(id) on delete set null,
  add column if not exists recurring_occurrence_id uuid;

create table if not exists public.recurring_payment_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_payment_id uuid not null references public.recurring_payments(id) on delete cascade,
  expected_due_on date not null,
  expected_amount numeric(12, 2) not null check (expected_amount > 0),
  transaction_id uuid unique references public.transactions(id) on delete set null,
  status text not null default 'projected'
    check (status in ('projected', 'matched', 'materialized', 'missed', 'skipped')),
  match_confidence numeric(5, 4),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (recurring_payment_id, expected_due_on)
);

alter table public.transactions
  add constraint transactions_recurring_occurrence_fk
  foreign key (recurring_occurrence_id)
  references public.recurring_payment_occurrences(id) on delete set null;

-- Le chiavi composte impediscono collegamenti cross-user anche quando una UUID
-- appartenente a un altro profilo fosse conosciuta dal client.
alter table public.recurring_payments
  add constraint recurring_payments_id_user_unique unique (id, user_id);
alter table public.financial_accounts
  add constraint financial_accounts_id_user_unique unique (id, user_id);
alter table public.loans
  add constraint loans_id_user_unique unique (id, user_id);
alter table public.recurring_payments
  add constraint recurring_payments_account_owner_fk
    foreign key (financial_account_id, user_id)
    references public.financial_accounts(id, user_id)
    on delete set null (financial_account_id),
  add constraint recurring_payments_loan_owner_fk
    foreign key (loan_id, user_id)
    references public.loans(id, user_id)
    on delete set null (loan_id);
alter table public.recurring_payment_occurrences
  add constraint recurring_occurrences_id_user_unique unique (id, user_id);
alter table public.transactions
  add constraint transactions_id_user_unique unique (id, user_id),
  add constraint transactions_recurring_payment_owner_fk
    foreign key (recurring_payment_id, user_id)
    references public.recurring_payments(id, user_id)
    on delete set null (recurring_payment_id),
  add constraint transactions_recurring_occurrence_owner_fk
    foreign key (recurring_occurrence_id, user_id)
    references public.recurring_payment_occurrences(id, user_id)
    on delete set null (recurring_occurrence_id);
alter table public.recurring_payment_occurrences
  add constraint recurring_occurrences_payment_owner_fk
    foreign key (recurring_payment_id, user_id)
    references public.recurring_payments(id, user_id) on delete cascade,
  add constraint recurring_occurrences_transaction_owner_fk
    foreign key (transaction_id, user_id)
    references public.transactions(id, user_id)
    on delete set null (transaction_id);

alter table public.recurring_payment_occurrences enable row level security;
create policy "recurring_occurrences_own_rows" on public.recurring_payment_occurrences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create unique index if not exists recurring_payments_detection_signature_uidx
  on public.recurring_payments (user_id, detection_signature)
  where detection_signature is not null;
create unique index if not exists recurring_payments_loan_uidx
  on public.recurring_payments (loan_id) where loan_id is not null;
create index if not exists recurring_payments_active_due_idx
  on public.recurring_payments (status, next_due_on) where status = 'active';
create index if not exists recurring_payments_account_idx
  on public.recurring_payments (financial_account_id, status);
create index if not exists recurring_occurrences_due_idx
  on public.recurring_payment_occurrences (status, expected_due_on);
create index if not exists transactions_recurring_payment_idx
  on public.transactions (recurring_payment_id, occurred_at desc);
create unique index if not exists transactions_recurring_occurrence_uidx
  on public.transactions (recurring_occurrence_id)
  where recurring_occurrence_id is not null;

create or replace function public.recurring_next_date(
  p_date date,
  p_frequency text,
  p_anchor_day integer default null
) returns date
language plpgsql immutable strict
set search_path = public
as $$
declare
  months_to_add integer;
  target_month date;
  wanted_day integer;
  last_day integer;
begin
  if p_frequency = 'weekly' then return p_date + 7; end if;
  if p_frequency = 'biweekly' then return p_date + 14; end if;
  months_to_add := case p_frequency
    when 'monthly' then 1 when 'bimonthly' then 2 when 'quarterly' then 3
    when 'semiannual' then 6 when 'annual' then 12 else null end;
  if months_to_add is null then raise exception 'invalid recurring frequency'; end if;
  target_month := date_trunc('month', p_date)::date + make_interval(months => months_to_add);
  wanted_day := coalesce(p_anchor_day, extract(day from p_date)::integer);
  last_day := extract(day from (target_month + interval '1 month - 1 day'))::integer;
  return target_month + (least(wanted_day, last_day) - 1);
end;
$$;

create or replace function public.ensure_recurring_occurrence(p_series_id uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  series_row public.recurring_payments%rowtype;
  occurrence_id uuid;
  occurrence_amount numeric(12, 2);
begin
  select * into series_row from public.recurring_payments where id = p_series_id;
  if not found or series_row.status <> 'active' then return null; end if;
  if auth.uid() is null
    and coalesce(auth.role(), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'authentication required';
  end if;
  if auth.uid() is not null and auth.uid() <> series_row.user_id then
    raise exception 'recurring payment access denied';
  end if;
  occurrence_amount := case
    when series_row.loan_id is not null
      and series_row.occurrence_limit is not null
      and series_row.occurrences_completed + 1 = series_row.occurrence_limit
      then coalesce((select final_balloon from public.loans where id = series_row.loan_id), series_row.amount)
    else series_row.amount end;
  insert into public.recurring_payment_occurrences
    (user_id, recurring_payment_id, expected_due_on, expected_amount)
  values (series_row.user_id, series_row.id, series_row.next_due_on, occurrence_amount)
  on conflict (recurring_payment_id, expected_due_on)
  do update set expected_amount = excluded.expected_amount
  returning id into occurrence_id;
  return occurrence_id;
end;
$$;

create or replace function public.advance_recurring_payment(p_series_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare series_row public.recurring_payments%rowtype;
begin
  select * into series_row from public.recurring_payments where id = p_series_id for update;
  if not found then return; end if;
  if auth.uid() is not null and auth.uid() <> series_row.user_id then
    raise exception 'recurring payment access denied';
  end if;
  update public.recurring_payments
  set occurrences_completed = occurrences_completed + 1,
      status = case
        when occurrence_limit is not null and occurrences_completed + 1 >= occurrence_limit
        then 'completed' else status end,
      next_due_on = case
        when occurrence_limit is not null and occurrences_completed + 1 >= occurrence_limit
        then next_due_on
        else public.recurring_next_date(next_due_on, frequency, extract(day from anchor_on)::integer)
      end,
      next_due_at = case
        when occurrence_limit is not null and occurrences_completed + 1 >= occurrence_limit
        then next_due_at
        else public.recurring_next_date(next_due_on, frequency, extract(day from anchor_on)::integer)::timestamptz
      end,
      updated_at = now()
  where id = p_series_id;
  perform public.ensure_recurring_occurrence(p_series_id);
end;
$$;

create or replace function public.apply_recurring_account_delta(
  p_account_id uuid,
  p_delta numeric
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update public.financial_accounts
  set current_balance = current_balance + p_delta
  where id = p_account_id and source = 'manual' and active = true;
  if not found then raise exception 'manual financial account not found'; end if;
end;
$$;
revoke all on function public.apply_recurring_account_delta(uuid, numeric) from public, anon, authenticated;
grant execute on function public.apply_recurring_account_delta(uuid, numeric) to service_role;

create or replace function public.delete_generated_recurring_transaction(p_transaction_id uuid)
returns boolean
language plpgsql security invoker
set search_path = public
as $$
declare tx public.transactions%rowtype; account_row public.financial_accounts%rowtype; next_balance numeric;
begin
  select * into tx from public.transactions
  where id = p_transaction_id and user_id = auth.uid() and source = 'recurring_generated'
  for update;
  if not found then raise exception 'generated recurring transaction not found'; end if;
  if tx.financial_account_id is not null then
    select * into account_row from public.financial_accounts
    where id = tx.financial_account_id and user_id = auth.uid() and source = 'manual'
    for update;
    if found then
      next_balance := account_row.current_balance + case when tx.kind = 'income' then -tx.amount else tx.amount end;
      if account_row.account_kind = 'cash_wallet' and next_balance < 0 then
        raise exception 'deleting this transaction would make the wallet negative';
      end if;
      update public.financial_accounts set current_balance = next_balance,
        balance_as_of = now(), last_synced_at = now() where id = account_row.id;
    end if;
  end if;
  delete from public.transactions where id = tx.id;
  if tx.recurring_occurrence_id is not null then
    update public.recurring_payment_occurrences
    set status = 'skipped', transaction_id = null, resolved_at = now()
    where id = tx.recurring_occurrence_id and user_id = auth.uid();
  end if;
  return true;
end;
$$;
revoke all on function public.delete_generated_recurring_transaction(uuid) from public, anon;
grant execute on function public.delete_generated_recurring_transaction(uuid) to authenticated;

create or replace function public.update_generated_recurring_transaction(
  p_transaction_id uuid,
  p_description text,
  p_amount numeric,
  p_category text,
  p_kind text,
  p_occurred_at timestamptz,
  p_income_type text default null,
  p_excluded_from_budget boolean default false
) returns boolean
language plpgsql security invoker
set search_path = public
as $$
declare tx public.transactions%rowtype; account_row public.financial_accounts%rowtype; next_balance numeric;
begin
  if p_amount <= 0 or p_kind not in ('expense', 'income') or nullif(trim(p_description), '') is null then
    raise exception 'invalid generated recurring transaction';
  end if;
  select * into tx from public.transactions
  where id = p_transaction_id and user_id = auth.uid() and source = 'recurring_generated'
  for update;
  if not found then raise exception 'generated recurring transaction not found'; end if;
  if tx.financial_account_id is not null then
    select * into account_row from public.financial_accounts
    where id = tx.financial_account_id and user_id = auth.uid() and source = 'manual'
    for update;
    if found then
      next_balance := account_row.current_balance
        + case when tx.kind = 'income' then -tx.amount else tx.amount end
        + case when p_kind = 'income' then p_amount else -p_amount end;
      if account_row.account_kind = 'cash_wallet' and next_balance < 0 then
        raise exception 'wallet balance would become negative';
      end if;
      update public.financial_accounts set current_balance = next_balance,
        balance_as_of = now(), last_synced_at = now() where id = account_row.id;
    end if;
  end if;
  update public.transactions set description = trim(p_description), amount = p_amount,
    category = p_category, kind = p_kind, occurred_at = p_occurred_at,
    income_type = p_income_type, excluded_from_budget = p_excluded_from_budget,
    internal_transfer = coalesce(p_income_type = 'internal_transfer', false),
    excluded_from_totals = coalesce(p_income_type = 'internal_transfer', false)
  where id = tx.id;
  return true;
end;
$$;
revoke all on function public.update_generated_recurring_transaction(uuid,text,numeric,text,text,timestamptz,text,boolean) from public, anon;
grant execute on function public.update_generated_recurring_transaction(uuid,text,numeric,text,text,timestamptz,text,boolean) to authenticated;

create or replace function public.create_recurring_from_transaction(
  p_transaction_id uuid,
  p_frequency text,
  p_next_due_on date,
  p_financial_account_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare tx public.transactions%rowtype; account_source text; series_id uuid; occurrence_id uuid;
begin
  select * into tx from public.transactions where id = p_transaction_id and user_id = auth.uid();
  if not found then raise exception 'transaction not found'; end if;
  if p_frequency not in ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual') then
    raise exception 'invalid recurring frequency';
  end if;
  if p_financial_account_id is not null then
    select source into account_source from public.financial_accounts
    where id = p_financial_account_id and user_id = auth.uid() and active = true;
    if account_source is null then raise exception 'financial account not found'; end if;
  end if;
  insert into public.recurring_payments
    (user_id,name,amount,next_due_at,series_type,direction,origin,status,frequency,category,
     anchor_on,next_due_on,financial_account_id,settlement_mode)
  values
    (tx.user_id,tx.description,tx.amount,p_next_due_on::timestamptz,'custom',tx.kind,'manual','active',
     p_frequency,tx.category,tx.occurred_at::date,p_next_due_on,p_financial_account_id,
     case when account_source = 'open_banking' then 'bank_match' else 'manual_post' end)
  returning id into series_id;
  insert into public.recurring_payment_occurrences
    (user_id,recurring_payment_id,expected_due_on,expected_amount,transaction_id,status,match_confidence,resolved_at)
  values (tx.user_id,series_id,tx.occurred_at::date,tx.amount,tx.id,'matched',1,now())
  returning id into occurrence_id;
  update public.transactions set recurring_payment_id = series_id, recurring_occurrence_id = occurrence_id
  where id = tx.id;
  perform public.ensure_recurring_occurrence(series_id);
  return series_id;
end;
$$;
revoke all on function public.create_recurring_from_transaction(uuid, text, date, uuid) from public, anon;
grant execute on function public.create_recurring_from_transaction(uuid, text, date, uuid) to authenticated;

create or replace function public.sync_loan_recurring_payment()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare first_due date; elapsed integer; next_due date; series_id uuid;
begin
  if not new.active then
    update public.recurring_payments set status = 'completed', updated_at = now() where loan_id = new.id;
    return new;
  end if;
  first_due := new.start_date;
  elapsed := 0;
  next_due := first_due;
  while next_due < current_date and elapsed < new.installment_count loop
    elapsed := elapsed + 1;
    next_due := public.recurring_next_date(next_due, 'monthly', extract(day from first_due)::integer);
  end loop;
  insert into public.recurring_payments
    (user_id,name,amount,next_due_at,series_type,direction,origin,status,frequency,category,
     anchor_on,next_due_on,settlement_mode,loan_id,occurrence_limit,occurrences_completed)
  values
    (new.user_id,new.name,new.monthly_payment,next_due::timestamptz,'loan','expense','loan',
     case when elapsed >= new.installment_count then 'completed' else 'active' end,
     'monthly','Assicurazioni e Finanza',first_due,next_due,'review',new.id,
     new.installment_count,elapsed)
  on conflict (loan_id) where loan_id is not null do update set
    name = excluded.name, amount = excluded.amount, anchor_on = excluded.anchor_on,
    next_due_on = excluded.next_due_on, next_due_at = excluded.next_due_at,
    occurrence_limit = excluded.occurrence_limit,
    occurrences_completed = excluded.occurrences_completed,
    status = excluded.status, updated_at = now()
  returning id into series_id;
  perform public.ensure_recurring_occurrence(series_id);
  return new;
end;
$$;

drop trigger if exists loans_sync_recurring_payment on public.loans;
create trigger loans_sync_recurring_payment
after insert or update of name,monthly_payment,start_date,installment_count,final_balloon,active
on public.loans for each row execute function public.sync_loan_recurring_payment();

revoke all on function public.advance_recurring_payment(uuid) from public, anon, authenticated;
grant execute on function public.advance_recurring_payment(uuid) to service_role;
revoke all on function public.sync_loan_recurring_payment() from public, anon, authenticated;

-- Forza il trigger sui finanziamenti esistenti senza alterarne i valori.
update public.loans set active = active where active = true;

do $$ declare series_id uuid;
begin
  for series_id in select id from public.recurring_payments where status = 'active' loop
    perform public.ensure_recurring_occurrence(series_id);
  end loop;
end $$;
