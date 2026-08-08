-- Enable Banking: consensi server-side, conti normalizzati e import idempotenti.

create table if not exists public.open_banking_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  authorization_id text,
  return_url text not null,
  requested_valid_until timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.open_banking_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'enable_banking'
    check (provider = 'enable_banking'),
  provider_session_id text not null unique,
  aspsp_name text not null,
  aspsp_country text not null,
  status text not null default 'authorized'
    check (status in ('authorized', 'expired', 'revoked', 'error')),
  valid_until timestamptz not null,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.open_banking_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.open_banking_connections(id) on delete cascade,
  provider_account_uid text not null,
  identification_hash text not null,
  iban_last4 text,
  name text not null,
  currency text not null default 'EUR',
  account_type text,
  product text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, identification_hash),
  unique (connection_id, provider_account_uid)
);

alter table public.financial_accounts
  add column if not exists open_banking_account_id uuid
    references public.open_banking_accounts(id) on delete set null,
  add column if not exists institution_name text,
  add column if not exists currency text not null default 'EUR';

create unique index if not exists financial_accounts_open_banking_account_uidx
  on public.financial_accounts (open_banking_account_id);

create table if not exists public.open_banking_transaction_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_account_id uuid not null references public.open_banking_accounts(id) on delete cascade,
  stable_key text not null,
  entry_reference text,
  provider_transaction_id text,
  content_fingerprint text not null,
  status text not null,
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null,
  booking_date date,
  value_date date,
  transaction_date date,
  occurred_on date not null,
  description text not null,
  counterparty text,
  bank_code text,
  bank_sub_code text,
  merchant_category_code text,
  transfer_hint boolean not null default false,
  refund_hint boolean not null default false,
  match_status text not null default 'unmatched'
    check (match_status in ('unmatched', 'auto_linked', 'provider_duplicate', 'review')),
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (bank_account_id, stable_key)
);

alter table public.transactions
  add column if not exists financial_account_id uuid
    references public.financial_accounts(id) on delete set null,
  add column if not exists bank_status text,
  add column if not exists excluded_from_totals boolean not null default false,
  add column if not exists internal_transfer boolean not null default false;

create table if not exists public.open_banking_transaction_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_import_id uuid not null references public.open_banking_transaction_imports(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  relation text not null
    check (relation in ('bank_created', 'manual_match', 'provider_duplicate')),
  confidence numeric(5, 4),
  created_at timestamptz not null default now(),
  unique (bank_import_id)
);

create table if not exists public.financial_account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  financial_account_id uuid not null references public.financial_accounts(id) on delete cascade,
  balance numeric(12, 2) not null,
  currency text not null,
  balance_type text,
  captured_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (financial_account_id, captured_on)
);

alter table public.open_banking_authorizations enable row level security;
alter table public.open_banking_connections enable row level security;
alter table public.open_banking_accounts enable row level security;
alter table public.open_banking_transaction_imports enable row level security;
alter table public.open_banking_transaction_links enable row level security;
alter table public.financial_account_balance_snapshots enable row level security;

-- I dati di connessione e i payload bancari sono accessibili soltanto dal backend
-- con service role. Il client legge esclusivamente le viste canoniche esistenti.
create policy "balance_snapshots_own_rows_read" on public.financial_account_balance_snapshots
  for select using (auth.uid() = user_id);

-- La policy storica consente all'utente di gestire i conti manuali. Queste
-- policy restrittive impediscono invece di falsificare dal client i conti EB.
create policy "financial_accounts_bank_insert_guard" on public.financial_accounts
  as restrictive for insert
  with check (source <> 'open_banking');
create policy "financial_accounts_bank_update_guard" on public.financial_accounts
  as restrictive for update
  using (source <> 'open_banking')
  with check (source <> 'open_banking');
create policy "financial_accounts_bank_delete_guard" on public.financial_accounts
  as restrictive for delete
  using (source <> 'open_banking');

create index if not exists open_banking_connections_user_status_idx
  on public.open_banking_connections (user_id, status);
create index if not exists open_banking_accounts_user_active_idx
  on public.open_banking_accounts (user_id, active);
create index if not exists open_banking_imports_fingerprint_idx
  on public.open_banking_transaction_imports
  (user_id, bank_account_id, content_fingerprint);
create index if not exists open_banking_imports_occurred_idx
  on public.open_banking_transaction_imports (user_id, occurred_on desc);
create index if not exists open_banking_links_transaction_idx
  on public.open_banking_transaction_links (transaction_id);
create index if not exists balance_snapshots_account_date_idx
  on public.financial_account_balance_snapshots
  (financial_account_id, captured_on desc);
create index if not exists transactions_user_excluded_occurred_idx
  on public.transactions (user_id, excluded_from_totals, occurred_at desc);
