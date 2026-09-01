-- ON CONFLICT non puo inferire l'indice parziale precedente. Una UNIQUE
-- normale ammette gia piu valori NULL, quindi e adatta anche alle serie
-- manuali senza detection_signature.

drop index if exists public.recurring_payments_detection_signature_uidx;

alter table public.recurring_payments
  drop constraint if exists recurring_payments_user_detection_signature_key,
  add constraint recurring_payments_user_detection_signature_key
    unique (user_id, detection_signature);

-- Il backfill completo viene eseguito una volta per versione del detector.
-- Incrementare questo valore lato API solo quando cambia l'algoritmo e serve
-- riesaminare lo storico degli utenti.
alter table public.profiles
  add column if not exists recurring_detection_version integer not null default 0
    check (recurring_detection_version >= 0);
