-- Il risultato decodificato resta disponibile finché l'utente non importa o
-- scarta esplicitamente il job. Il file originale continua a essere eliminato
-- subito dopo l'elaborazione.

create policy "transaction_import_jobs_own_delete"
  on public.transaction_import_jobs
  for delete
  using (auth.uid() = user_id);

comment on column public.transaction_import_jobs.result is
  'Decoded transactions retained until the user imports or discards the job.';
