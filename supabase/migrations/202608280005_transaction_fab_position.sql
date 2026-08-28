alter table public.profiles
  add column if not exists transaction_fab_side text not null default 'right',
  add column if not exists transaction_fab_y_ratio numeric not null default 1;

alter table public.profiles
  drop constraint if exists profiles_transaction_fab_side_check,
  add constraint profiles_transaction_fab_side_check
    check (transaction_fab_side in ('left', 'right')),
  drop constraint if exists profiles_transaction_fab_y_ratio_check,
  add constraint profiles_transaction_fab_y_ratio_check
    check (transaction_fab_y_ratio between 0 and 1);

comment on column public.profiles.transaction_fab_side is
  'Bordo scelto dall’utente per il pulsante di aggiunta transazione.';
comment on column public.profiles.transaction_fab_y_ratio is
  'Posizione verticale relativa del pulsante entro l’area sicura della schermata.';
