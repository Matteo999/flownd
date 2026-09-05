-- Il detector mantiene evidenze aggregate separate dalle serie confermate.
-- La versione forza un backfill solo quando cambia l'algoritmo; next_scan_at
-- distribuisce invece le verifiche periodiche tra gli utenti attivi.

alter table public.profiles
  add column if not exists recurring_detection_status text not null default 'pending'
    check (recurring_detection_status in ('pending','running','completed','failed')),
  add column if not exists recurring_detection_started_at timestamptz,
  add column if not exists recurring_detection_completed_at timestamptz,
  add column if not exists recurring_detection_next_scan_at timestamptz not null default now();

create index if not exists profiles_recurring_detection_schedule_idx
  on public.profiles (recurring_detection_next_scan_at)
  where onboarding_completed = true;

create table if not exists public.recurring_detection_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_key text not null,
  identity_key text not null,
  name text not null,
  direction text not null check (direction in ('expense','income')),
  category text not null,
  financial_account_id uuid references public.financial_accounts(id) on delete set null,
  amount_center numeric(14,2) not null check (amount_center > 0),
  amount_min numeric(14,2) not null check (amount_min > 0),
  amount_max numeric(14,2) not null check (amount_max > 0),
  occurrence_count integer not null check (occurrence_count >= 2),
  frequency_guess text check (
    frequency_guess is null or frequency_guess in
      ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual')
  ),
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  first_seen_on date not null,
  last_seen_on date not null,
  evidence_transaction_ids uuid[] not null default '{}',
  detector_version integer not null check (detector_version > 0),
  status text not null default 'observing'
    check (status in ('observing','promoted','rejected')),
  recurring_payment_id uuid references public.recurring_payments(id) on delete set null,
  last_evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, candidate_key),
  check (amount_min <= amount_center and amount_center <= amount_max),
  check (first_seen_on <= last_seen_on)
);

alter table public.recurring_detection_candidates enable row level security;

create policy "recurring_detection_candidates_own_rows"
on public.recurring_detection_candidates
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists recurring_detection_candidates_review_idx
  on public.recurring_detection_candidates (user_id, status, last_seen_on desc);

create index if not exists recurring_detection_candidates_account_idx
  on public.recurring_detection_candidates (financial_account_id, status)
  where financial_account_id is not null;

