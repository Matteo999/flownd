-- Frequenze manuali esposte dal selettore della transazione.

alter table public.recurring_payments
  drop constraint if exists recurring_payments_frequency_check,
  add constraint recurring_payments_frequency_check check (frequency in (
    'daily','weekdays','weekly','biweekly','fourweekly','monthly',
    'bimonthly','quarterly','semiannual','annual'
  ));

alter table public.recurring_detection_candidates
  drop constraint if exists recurring_detection_candidates_frequency_guess_check,
  add constraint recurring_detection_candidates_frequency_guess_check check (
    frequency_guess is null or frequency_guess in (
      'daily','weekdays','weekly','biweekly','fourweekly','monthly',
      'bimonthly','quarterly','semiannual','annual'
    )
  );

create or replace function public.recurring_next_date(
  p_date date,
  p_frequency text,
  p_anchor_day integer default null
) returns date
language plpgsql immutable strict
set search_path = public
as $$
declare
  next_day date;
  months_to_add integer;
  target_month date;
  wanted_day integer;
  last_day integer;
begin
  if p_frequency = 'daily' then return p_date + 1; end if;
  if p_frequency = 'weekdays' then
    next_day := p_date + 1;
    while extract(isodow from next_day) > 5 loop
      next_day := next_day + 1;
    end loop;
    return next_day;
  end if;
  if p_frequency = 'weekly' then return p_date + 7; end if;
  if p_frequency = 'biweekly' then return p_date + 14; end if;
  if p_frequency = 'fourweekly' then return p_date + 28; end if;
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

create or replace function public.create_recurring_payment(
  p_name text,
  p_amount numeric,
  p_direction text,
  p_frequency text,
  p_category text,
  p_next_due_on date,
  p_financial_account_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  account_source text;
  series_id uuid;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if trim(coalesce(p_name, '')) = '' or p_amount <= 0 then raise exception 'invalid recurring payment'; end if;
  if p_direction not in ('expense','income') then raise exception 'invalid direction'; end if;
  if p_frequency not in (
    'daily','weekdays','weekly','biweekly','fourweekly','monthly',
    'bimonthly','quarterly','semiannual','annual'
  ) then raise exception 'invalid recurring frequency'; end if;
  if p_financial_account_id is not null then
    select source into account_source from public.financial_accounts
    where id = p_financial_account_id and user_id = current_user_id and active = true;
    if account_source is null then raise exception 'financial account not found'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    current_user_id::text || ':' || public.recurring_identity(p_name) || ':' || p_direction || ':' || p_frequency,
    0
  ));
  series_id := public.find_compatible_recurring_payment(
    current_user_id, p_name, p_amount, p_direction, p_frequency, p_financial_account_id
  );
  if series_id is not null then return series_id; end if;
  insert into public.recurring_payments
    (user_id,name,amount,next_due_at,series_type,direction,origin,status,frequency,category,
     anchor_on,next_due_on,financial_account_id,settlement_mode)
  values
    (current_user_id,trim(p_name),p_amount,p_next_due_on::timestamptz,'custom',p_direction,'manual','active',
     p_frequency,p_category,p_next_due_on,p_next_due_on,p_financial_account_id,
     case when account_source = 'open_banking' then 'bank_match' else 'manual_post' end)
  returning id into series_id;
  perform public.ensure_recurring_occurrence(series_id);
  return series_id;
end;
$$;
revoke all on function public.create_recurring_payment(text,numeric,text,text,text,date,uuid) from public, anon;
grant execute on function public.create_recurring_payment(text,numeric,text,text,text,date,uuid) to authenticated;

create or replace function public.create_recurring_from_transaction_v2(
  p_transaction_id uuid,
  p_name text,
  p_expected_amount numeric,
  p_frequency text,
  p_category text,
  p_next_due_on date,
  p_financial_account_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  tx public.transactions%rowtype;
  account_source text;
  series_id uuid;
  occurrence_id uuid;
begin
  select * into tx from public.transactions where id = p_transaction_id and user_id = auth.uid();
  if not found then raise exception 'transaction not found'; end if;
  if trim(coalesce(p_name, '')) = '' or p_expected_amount <= 0 then raise exception 'invalid recurring payment'; end if;
  if p_frequency not in (
    'daily','weekdays','weekly','biweekly','fourweekly','monthly',
    'bimonthly','quarterly','semiannual','annual'
  ) then raise exception 'invalid recurring frequency'; end if;
  if p_financial_account_id is not null then
    select source into account_source from public.financial_accounts
    where id = p_financial_account_id and user_id = auth.uid() and active = true;
    if account_source is null then raise exception 'financial account not found'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    tx.user_id::text || ':' || public.recurring_identity(p_name) || ':' || tx.kind || ':' || p_frequency,
    0
  ));
  series_id := public.find_compatible_recurring_payment(
    tx.user_id, p_name, p_expected_amount, tx.kind, p_frequency,
    coalesce(p_financial_account_id, tx.financial_account_id)
  );
  if series_id is null then
    insert into public.recurring_payments
      (user_id,name,amount,next_due_at,series_type,direction,origin,status,frequency,category,
       anchor_on,next_due_on,financial_account_id,settlement_mode)
    values
      (tx.user_id,trim(p_name),p_expected_amount,p_next_due_on::timestamptz,'custom',tx.kind,'manual','active',
       p_frequency,p_category,tx.occurred_at::date,p_next_due_on,
       coalesce(p_financial_account_id,tx.financial_account_id),
       case when account_source = 'open_banking' then 'bank_match' else 'manual_post' end)
    returning id into series_id;
  end if;
  insert into public.recurring_payment_occurrences
    (user_id,recurring_payment_id,expected_due_on,expected_amount,transaction_id,status,match_confidence,resolved_at)
  values (tx.user_id,series_id,tx.occurred_at::date,tx.amount,tx.id,'matched',1,now())
  on conflict (recurring_payment_id, expected_due_on) do update set
    transaction_id = case when public.recurring_payment_occurrences.transaction_id is null
      then excluded.transaction_id else public.recurring_payment_occurrences.transaction_id end,
    status = 'matched', resolved_at = now()
  returning id into occurrence_id;
  update public.transactions
  set recurring_payment_id = series_id,
      recurring_occurrence_id = case when exists (
        select 1 from public.recurring_payment_occurrences occurrence
        where occurrence.id = occurrence_id and occurrence.transaction_id = tx.id
      ) then occurrence_id else null end
  where id = tx.id;
  perform public.ensure_recurring_occurrence(series_id);
  return series_id;
end;
$$;
revoke all on function public.create_recurring_from_transaction_v2(uuid,text,numeric,text,text,date,uuid) from public, anon;
grant execute on function public.create_recurring_from_transaction_v2(uuid,text,numeric,text,text,date,uuid) to authenticated;

