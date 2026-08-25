-- Enable Banking espone date contabili separate e, per molte banche, nessun
-- timestamp. Conserviamo quindi l'orario locale come dato opzionale, senza
-- trasformare una data priva di ora in un falso timestamp alle 14:00.

alter table public.open_banking_transaction_imports
  add column if not exists occurred_time time,
  add column if not exists occurred_time_source text;

alter table public.open_banking_transaction_imports
  drop constraint if exists open_banking_imports_time_source_check,
  add constraint open_banking_imports_time_source_check check (
    occurred_time_source is null
    or occurred_time_source in ('structured', 'narrative')
  );

alter table public.transactions
  add column if not exists occurred_time time,
  add column if not exists occurred_time_source text;

alter table public.transactions
  drop constraint if exists transactions_occurred_time_source_check,
  add constraint transactions_occurred_time_source_check check (
    occurred_time_source is null
    or occurred_time_source in ('structured', 'narrative')
  );

-- transaction_date è la data operativa; value_date è la data valuta e
-- booking_date la data di contabilizzazione.
update public.open_banking_transaction_imports
set occurred_on = coalesce(transaction_date, value_date, booking_date)
where coalesce(transaction_date, value_date, booking_date) is not null
  and occurred_on is distinct from coalesce(transaction_date, value_date, booking_date);

-- Estrae soltanto orari accompagnati da indicatori linguistici espliciti.
-- In questo modo numeri di riferimento e importi non vengono scambiati per ore.
with candidates as (
  select
    id,
    replace(
      substring(
        raw_description from
        '(?i)(?:alle[[:space:]]+ore|ore|at|a[[:space:]]+las|à|um)[[:space:]]+([0-9]{1,2}[:.][0-9]{2})'
      ),
      '.',
      ':'
    ) as local_time
  from public.transactions
  where source = 'open_banking'
    and raw_description is not null
    and occurred_time is null
), valid_candidates as (
  select id, local_time
  from candidates
  where local_time is not null
    and split_part(local_time, ':', 1)::integer between 0 and 23
    and split_part(local_time, ':', 2)::integer between 0 and 59
)
update public.transactions as transaction
set occurred_time = valid_candidates.local_time::time,
    occurred_time_source = 'narrative'
from valid_candidates
where transaction.id = valid_candidates.id;

-- Riallinea data operativa e orario dei movimenti creati dalla banca. I match
-- manuali mantengono invece la data scelta dall'utente.
update public.transactions as transaction
set occurred_at = (bank_import.occurred_on::text || 'T12:00:00Z')::timestamptz
from public.open_banking_transaction_links as link
join public.open_banking_transaction_imports as bank_import
  on bank_import.id = link.bank_import_id
where link.transaction_id = transaction.id
  and transaction.source = 'open_banking';

update public.open_banking_transaction_imports as bank_import
set occurred_time = transaction.occurred_time,
    occurred_time_source = transaction.occurred_time_source
from public.open_banking_transaction_links as link
join public.transactions as transaction
  on transaction.id = link.transaction_id
where link.bank_import_id = bank_import.id
  and transaction.source = 'open_banking';

create index if not exists transactions_user_occurred_time_idx
  on public.transactions (user_id, occurred_at desc, occurred_time desc);
