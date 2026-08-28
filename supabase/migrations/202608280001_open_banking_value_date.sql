-- Per diversi istituti Enable Banking espone transaction_date uguale alla data
-- contabile, mentre value_date coincide con il giorno effettivo riportato nella
-- causale. I movimenti pending restano invariati perché la data valuta può essere
-- futura e soltanto stimata.
update public.open_banking_transaction_imports
set occurred_on = coalesce(value_date, transaction_date, booking_date)
where status = 'booked'
  and coalesce(value_date, transaction_date, booking_date) is not null
  and occurred_on is distinct from coalesce(value_date, transaction_date, booking_date);

-- Riallinea soltanto le transazioni create dall'Open Banking. I movimenti
-- manuali successivamente collegati mantengono la data scelta dall'utente.
update public.transactions as transaction
set occurred_at = (
  coalesce(bank_import.value_date, bank_import.transaction_date, bank_import.booking_date)::text
  || 'T12:00:00Z'
)::timestamptz
from public.open_banking_transaction_links as link
join public.open_banking_transaction_imports as bank_import
  on bank_import.id = link.bank_import_id
where link.transaction_id = transaction.id
  and transaction.source = 'open_banking'
  and bank_import.status = 'booked'
  and coalesce(bank_import.value_date, bank_import.transaction_date, bank_import.booking_date) is not null
  and transaction.occurred_at::date is distinct from
    coalesce(bank_import.value_date, bank_import.transaction_date, bank_import.booking_date);
