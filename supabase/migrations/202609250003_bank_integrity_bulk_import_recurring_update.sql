-- 1) Integrità dei movimenti bancari: le stesse regole già applicate dall'app
--    e da delete_recurring_linked_transaction valgono ora anche per le
--    chiamate dirette alla tabella.

drop policy if exists "transactions_bank_insert_guard" on public.transactions;
create policy "transactions_bank_insert_guard" on public.transactions
  as restrictive for insert to authenticated
  with check (source not in ('open_banking', 'manual_open_banking'));

drop policy if exists "transactions_bank_delete_guard" on public.transactions;
create policy "transactions_bank_delete_guard" on public.transactions
  as restrictive for delete to authenticated
  using (
    source not in ('open_banking', 'manual_open_banking')
    or not exists (
      select 1 from public.financial_accounts account
      where account.id = transactions.financial_account_id
        and account.user_id = auth.uid()
        and account.active = true
    )
  );

-- 2) Debounce server-side della detection ricorrenze su attività.

alter table public.profiles
  add column if not exists recurring_detection_activity_at timestamptz;

create or replace function public.protect_profile_entitlements()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.plan_tier := 'free';
    new.recurring_detection_activity_at := null;
    return new;
  end if;

  if new.plan_tier is distinct from old.plan_tier
    or new.recurring_detection_version is distinct from old.recurring_detection_version
    or new.recurring_detection_status is distinct from old.recurring_detection_status
    or new.recurring_detection_started_at is distinct from old.recurring_detection_started_at
    or new.recurring_detection_completed_at is distinct from old.recurring_detection_completed_at
    or new.recurring_detection_next_scan_at is distinct from old.recurring_detection_next_scan_at
    or new.recurring_detection_activity_at is distinct from old.recurring_detection_activity_at
  then
    raise exception 'Campo del profilo non modificabile dal client'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- 3) Import in blocco (file e scansione IA): un solo round trip, idempotente
--    sull'impronta di import. Le regole RLS restano quelle dell'utente.

create or replace function public.import_transactions(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  inserted_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('inserted', 0, 'ids', '[]'::jsonb);
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'too many rows' using errcode = '22023';
  end if;

  with inserted as (
    insert into public.transactions (
      user_id, description, amount, category, source, kind,
      income_type, excluded_from_budget, internal_transfer, excluded_from_totals,
      occurred_at, occurred_time, occurred_time_source, financial_account_id,
      import_fingerprint, raw_description, merchant_name, counterparty_name,
      import_memo, import_reference, import_confidence
    )
    select
      current_user_id,
      row.description,
      row.amount,
      row.category,
      case when row.source = 'ai_scan' then 'ai_scan' else 'file_import' end,
      coalesce(row.kind, 'expense'),
      row.income_type,
      coalesce(row.excluded_from_budget, false),
      coalesce(row.internal_transfer, false),
      coalesce(row.excluded_from_totals, false),
      coalesce(row.occurred_at, now()),
      row.occurred_time,
      row.occurred_time_source,
      null,
      row.import_fingerprint,
      row.raw_description,
      row.merchant_name,
      row.counterparty_name,
      row.import_memo,
      row.import_reference,
      row.import_confidence
    from jsonb_populate_recordset(null::public.transactions, p_rows) as row
    on conflict (user_id, import_fingerprint) where import_fingerprint is not null
    do nothing
    returning id
  )
  select coalesce(array_agg(id), '{}') into inserted_ids from inserted;

  return jsonb_build_object(
    'inserted', coalesce(array_length(inserted_ids, 1), 0),
    'ids', to_jsonb(inserted_ids)
  );
end;
$$;

revoke all on function public.import_transactions(jsonb) from public, anon;
grant execute on function public.import_transactions(jsonb) to authenticated;

-- 4) Aggiornamento ricorrenza atomico: pulizia delle occorrenze previste,
--    aggiornamento della serie e rigenerazione nella stessa transazione.

create or replace function public.update_recurring_payment(
  p_series_id uuid,
  p_name text,
  p_amount numeric,
  p_direction text,
  p_frequency text,
  p_category text,
  p_next_due_on date,
  p_financial_account_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  account_source text;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' or p_amount is null or p_amount <= 0 then
    raise exception 'invalid recurring payment' using errcode = '22023';
  end if;

  if p_financial_account_id is not null then
    select source into account_source
    from public.financial_accounts
    where id = p_financial_account_id and user_id = current_user_id and active = true;
    if not found then
      raise exception 'financial account not found' using errcode = '22023';
    end if;
  end if;

  perform 1 from public.recurring_payments
  where id = p_series_id and user_id = current_user_id
  for update;
  if not found then
    raise exception 'recurring payment not found' using errcode = 'P0002';
  end if;

  delete from public.recurring_payment_occurrences
  where recurring_payment_id = p_series_id
    and user_id = current_user_id
    and status = 'projected';

  update public.recurring_payments set
    name = trim(p_name),
    amount = p_amount,
    direction = p_direction,
    frequency = p_frequency,
    category = p_category,
    anchor_on = p_next_due_on,
    next_due_on = p_next_due_on,
    next_due_at = (p_next_due_on::text || 'T12:00:00Z')::timestamptz,
    financial_account_id = p_financial_account_id,
    settlement_mode = case when account_source = 'open_banking' then 'bank_match' else 'manual_post' end,
    updated_at = now()
  where id = p_series_id and user_id = current_user_id;

  perform public.ensure_recurring_occurrence(p_series_id);
  return true;
end;
$$;

revoke all on function public.update_recurring_payment(uuid, text, numeric, text, text, text, date, uuid)
  from public, anon;
grant execute on function public.update_recurring_payment(uuid, text, numeric, text, text, text, date, uuid)
  to authenticated;

create or replace function public.set_recurring_payment_status(
  p_series_id uuid,
  p_status text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update public.recurring_payments set
    status = p_status,
    active = p_status = 'active',
    updated_at = now()
  where id = p_series_id and user_id = auth.uid();
  if not found then
    raise exception 'recurring payment not found' using errcode = 'P0002';
  end if;
  if p_status = 'active' then
    perform public.ensure_recurring_occurrence(p_series_id);
  end if;
  return true;
end;
$$;

revoke all on function public.set_recurring_payment_status(uuid, text) from public, anon;
grant execute on function public.set_recurring_payment_status(uuid, text) to authenticated;
