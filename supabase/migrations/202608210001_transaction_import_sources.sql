-- Importazioni da file e riconoscimento immagine: provenienza e idempotenza.

alter table public.transactions
  add column if not exists import_fingerprint text;

create unique index if not exists transactions_user_import_fingerprint_idx
  on public.transactions (user_id, import_fingerprint)
  where import_fingerprint is not null;

comment on column public.transactions.import_fingerprint is
  'Chiave stabile data/tipo/importo/descrizione usata per rendere idempotenti gli import file e IA.';
