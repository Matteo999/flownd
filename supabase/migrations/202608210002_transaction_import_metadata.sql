alter table public.transactions
  add column if not exists raw_description text,
  add column if not exists merchant_name text,
  add column if not exists counterparty_name text,
  add column if not exists import_memo text,
  add column if not exists import_reference text,
  add column if not exists import_confidence numeric(5, 4)
    check (import_confidence is null or import_confidence between 0 and 1);

create index if not exists transactions_user_import_reference_idx
  on public.transactions (user_id, import_reference)
  where import_reference is not null;

update public.transactions
set raw_description = description
where raw_description is null
  and source in ('file_import', 'ai_scan');

comment on column public.transactions.raw_description is
  'Original source description retained independently from the user-facing label.';
comment on column public.transactions.merchant_name is
  'Language-independent semantic merchant extracted from an import.';
comment on column public.transactions.counterparty_name is
  'Language-independent semantic counterparty extracted from an import.';
comment on column public.transactions.import_reference is
  'Provider or statement reference used as the strongest duplicate signal.';
comment on column public.transactions.import_fingerprint is
  'Idempotency key based on reference when available, otherwise date/type/amount and semantic party.';
