-- Una spesa di gruppo nasce sempre da una transazione (set_my_transaction_group).
-- Con "on delete set null", eliminando la transazione la spesa restava nel gruppo
-- con descrizione e quote, comparendo tra i movimenti e nei saldi dei membri.

-- Pulizia degli orfani già creati: le quote seguono per cascade.
delete from public.shared_expenses
where transaction_id is null;

alter table public.shared_expenses
  drop constraint if exists shared_expenses_transaction_id_fkey;

alter table public.shared_expenses
  add constraint shared_expenses_transaction_id_fkey
  foreign key (transaction_id) references public.transactions(id) on delete cascade;
