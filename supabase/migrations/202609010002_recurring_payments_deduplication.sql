-- Deduplica delle serie manuali e gestione esplicita della cancellazione.

create or replace function public.recurring_identity(p_value text)
returns text
language sql immutable strict
set search_path = public
as $$
  select trim(regexp_replace(
    regexp_replace(lower(p_value), '\m(pagamento|bonifico|addebito|accredito|sepa|carta|card)\M', ' ', 'g'),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

create or replace function public.find_compatible_recurring_payment(
  p_user_id uuid,
  p_name text,
  p_amount numeric,
  p_direction text,
  p_frequency text,
  p_financial_account_id uuid default null
) returns uuid
language sql stable security definer
set search_path = public
as $$
  select recurring.id
  from public.recurring_payments recurring
  where recurring.user_id = p_user_id
    and recurring.status in ('active', 'paused')
    and recurring.origin <> 'loan'
    and recurring.direction = p_direction
    and recurring.frequency = p_frequency
    and public.recurring_identity(recurring.name) = public.recurring_identity(p_name)
    and abs(recurring.amount - p_amount) <= greatest(recurring.amount, p_amount) * 0.25
    and (
      recurring.financial_account_id = p_financial_account_id
      or recurring.financial_account_id is null
      or p_financial_account_id is null
    )
  order by
    (recurring.financial_account_id = p_financial_account_id) desc nulls last,
    recurring.updated_at desc
  limit 1;
$$;
revoke all on function public.find_compatible_recurring_payment(uuid,text,numeric,text,text,uuid) from public, anon, authenticated;

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
  if p_frequency not in ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual') then
    raise exception 'invalid recurring frequency';
  end if;
  if p_financial_account_id is not null then
    select source into account_source from public.financial_accounts
    where id = p_financial_account_id and user_id = current_user_id and active = true;
    if account_source is null then raise exception 'financial account not found'; end if;
  end if;

  -- Serializza le creazioni della stessa identita per evitare duplicati concorrenti.
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

create or replace function public.create_recurring_from_transaction(
  p_transaction_id uuid,
  p_frequency text,
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
  if p_frequency not in ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual') then
    raise exception 'invalid recurring frequency';
  end if;
  if p_financial_account_id is not null then
    select source into account_source from public.financial_accounts
    where id = p_financial_account_id and user_id = auth.uid() and active = true;
    if account_source is null then raise exception 'financial account not found'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    tx.user_id::text || ':' || public.recurring_identity(tx.description) || ':' || tx.kind || ':' || p_frequency,
    0
  ));
  series_id := public.find_compatible_recurring_payment(
    tx.user_id, tx.description, tx.amount, tx.kind, p_frequency,
    coalesce(p_financial_account_id, tx.financial_account_id)
  );
  if series_id is null then
    insert into public.recurring_payments
      (user_id,name,amount,next_due_at,series_type,direction,origin,status,frequency,category,
       anchor_on,next_due_on,financial_account_id,settlement_mode)
    values
      (tx.user_id,tx.description,tx.amount,p_next_due_on::timestamptz,'custom',tx.kind,'manual','active',
       p_frequency,tx.category,tx.occurred_at::date,p_next_due_on,
       coalesce(p_financial_account_id,tx.financial_account_id),
       case when account_source = 'open_banking' then 'bank_match' else 'manual_post' end)
    returning id into series_id;
  end if;

  insert into public.recurring_payment_occurrences
    (user_id,recurring_payment_id,expected_due_on,expected_amount,transaction_id,status,match_confidence,resolved_at)
  values (tx.user_id,series_id,tx.occurred_at::date,tx.amount,tx.id,'matched',1,now())
  on conflict (recurring_payment_id, expected_due_on) do update set
    transaction_id = case
      when public.recurring_payment_occurrences.transaction_id is null then excluded.transaction_id
      else public.recurring_payment_occurrences.transaction_id
    end,
    status = 'matched', resolved_at = now()
  returning id into occurrence_id;
  update public.transactions
  set recurring_payment_id = series_id,
      recurring_occurrence_id = case
        when exists (
          select 1 from public.recurring_payment_occurrences occurrence
          where occurrence.id = occurrence_id and occurrence.transaction_id = tx.id
        ) then occurrence_id else null end
  where id = tx.id;
  perform public.ensure_recurring_occurrence(series_id);
  return series_id;
end;
$$;
revoke all on function public.create_recurring_from_transaction(uuid,text,date,uuid) from public, anon;
grant execute on function public.create_recurring_from_transaction(uuid,text,date,uuid) to authenticated;

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
  if p_frequency not in ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual') then
    raise exception 'invalid recurring frequency';
  end if;
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

-- Converge anche le serie manuali duplicate gia presenti, preservando tutti i
-- movimenti e scegliendo come serie principale quella creata per prima.
do $$
declare
  pair record;
  occurrence record;
  existing_occurrence public.recurring_payment_occurrences%rowtype;
begin
  loop
    select older.id as keep_id, newer.id as duplicate_id
    into pair
    from public.recurring_payments older
    join public.recurring_payments newer
      on older.user_id = newer.user_id
      and older.id <> newer.id
      and (older.created_at, older.id) < (newer.created_at, newer.id)
      and older.origin = 'manual' and newer.origin = 'manual'
      and older.status in ('active','paused') and newer.status in ('active','paused')
      and older.direction = newer.direction
      and older.frequency = newer.frequency
      and public.recurring_identity(older.name) = public.recurring_identity(newer.name)
      and abs(older.amount - newer.amount) <= greatest(older.amount, newer.amount) * 0.25
      and (older.financial_account_id = newer.financial_account_id
        or older.financial_account_id is null or newer.financial_account_id is null)
    order by older.created_at, older.id, newer.created_at, newer.id
    limit 1;
    exit when not found;

    for occurrence in
      select * from public.recurring_payment_occurrences
      where recurring_payment_id = pair.duplicate_id order by expected_due_on
    loop
      select * into existing_occurrence
      from public.recurring_payment_occurrences
      where recurring_payment_id = pair.keep_id
        and expected_due_on = occurrence.expected_due_on;
      if found then
        if occurrence.transaction_id is not null and existing_occurrence.transaction_id is null then
          update public.transactions
          set recurring_payment_id = pair.keep_id,
              recurring_occurrence_id = existing_occurrence.id
          where id = occurrence.transaction_id;
          update public.recurring_payment_occurrences
          set transaction_id = null
          where id = occurrence.id;
          update public.recurring_payment_occurrences
          set transaction_id = occurrence.transaction_id,
              expected_amount = occurrence.expected_amount,
              status = occurrence.status,
              match_confidence = occurrence.match_confidence,
              resolved_at = occurrence.resolved_at
          where id = existing_occurrence.id;
        elsif occurrence.transaction_id is not null then
          update public.transactions
          set recurring_payment_id = pair.keep_id, recurring_occurrence_id = null
          where id = occurrence.transaction_id;
        end if;
        delete from public.recurring_payment_occurrences where id = occurrence.id;
      else
        update public.recurring_payment_occurrences
        set recurring_payment_id = pair.keep_id
        where id = occurrence.id;
        update public.transactions
        set recurring_payment_id = pair.keep_id
        where recurring_occurrence_id = occurrence.id;
      end if;
    end loop;
    update public.transactions set recurring_payment_id = pair.keep_id
    where recurring_payment_id = pair.duplicate_id;
    delete from public.recurring_payments where id = pair.duplicate_id;
  end loop;
end $$;

create or replace function public.unlink_transaction_from_recurring(p_transaction_id uuid)
returns boolean
language plpgsql security invoker
set search_path = public
as $$
declare tx public.transactions%rowtype;
begin
  select * into tx from public.transactions
  where id = p_transaction_id and user_id = auth.uid() for update;
  if not found then raise exception 'transaction not found'; end if;
  update public.transactions
  set recurring_payment_id = null, recurring_occurrence_id = null
  where id = tx.id;
  if tx.recurring_occurrence_id is not null then
    update public.recurring_payment_occurrences
    set transaction_id = null, status = 'skipped', resolved_at = now()
    where id = tx.recurring_occurrence_id and user_id = auth.uid();
  end if;
  return true;
end;
$$;
revoke all on function public.unlink_transaction_from_recurring(uuid) from public, anon;
grant execute on function public.unlink_transaction_from_recurring(uuid) to authenticated;

create or replace function public.delete_recurring_linked_transaction(p_transaction_id uuid)
returns boolean
language plpgsql security invoker
set search_path = public
as $$
declare tx public.transactions%rowtype;
begin
  select * into tx from public.transactions
  where id = p_transaction_id and user_id = auth.uid() for update;
  if not found or tx.recurring_payment_id is null then raise exception 'linked transaction not found'; end if;
  if tx.source = 'recurring_generated' then
    return public.delete_generated_recurring_transaction(tx.id);
  end if;
  if tx.source in ('open_banking','manual_open_banking') and exists (
    select 1 from public.financial_accounts account
    where account.id = tx.financial_account_id and account.user_id = auth.uid() and account.active = true
  ) then
    raise exception 'bank transactions cannot be deleted';
  end if;
  perform public.unlink_transaction_from_recurring(tx.id);
  if tx.source = 'manual' and tx.financial_account_id is not null and exists (
    select 1 from public.financial_accounts account
    where account.id = tx.financial_account_id and account.user_id = auth.uid() and account.source = 'manual'
  ) then
    return public.delete_manual_financial_account_transaction(tx.id);
  end if;
  if tx.source not in ('manual','onboarding','ai_scan','file_import','open_banking','manual_open_banking') then
    raise exception 'transaction source cannot be deleted';
  end if;
  delete from public.transactions where id = tx.id and user_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.delete_recurring_linked_transaction(uuid) from public, anon;
grant execute on function public.delete_recurring_linked_transaction(uuid) to authenticated;

create or replace function public.delete_recurring_payment(
  p_series_id uuid,
  p_delete_manual_transactions boolean default false
) returns jsonb
language plpgsql security invoker
set search_path = public
as $$
declare
  series_owner uuid;
  tx public.transactions%rowtype;
  deleted_count integer := 0;
  detached_count integer := 0;
begin
  select user_id into series_owner from public.recurring_payments
  where id = p_series_id and user_id = auth.uid() for update;
  if not found then raise exception 'recurring payment not found'; end if;

  for tx in select * from public.transactions
    where recurring_payment_id = p_series_id and user_id = auth.uid() for update
  loop
    if p_delete_manual_transactions and tx.source = 'recurring_generated' then
      perform public.delete_generated_recurring_transaction(tx.id);
      deleted_count := deleted_count + 1;
    elsif p_delete_manual_transactions and tx.source = 'manual' and tx.financial_account_id is not null
      and exists (select 1 from public.financial_accounts account
        where account.id = tx.financial_account_id and account.user_id = auth.uid() and account.source = 'manual') then
      perform public.delete_manual_financial_account_transaction(tx.id);
      deleted_count := deleted_count + 1;
    elsif p_delete_manual_transactions and tx.source in ('manual','onboarding','ai_scan','file_import') then
      delete from public.transactions where id = tx.id and user_id = auth.uid();
      deleted_count := deleted_count + 1;
    else
      update public.transactions set recurring_payment_id = null, recurring_occurrence_id = null
      where id = tx.id and user_id = auth.uid();
      detached_count := detached_count + 1;
    end if;
  end loop;
  delete from public.recurring_payments where id = p_series_id and user_id = auth.uid();
  return jsonb_build_object('deletedTransactions', deleted_count, 'detachedTransactions', detached_count);
end;
$$;
revoke all on function public.delete_recurring_payment(uuid,boolean) from public, anon;
grant execute on function public.delete_recurring_payment(uuid,boolean) to authenticated;
