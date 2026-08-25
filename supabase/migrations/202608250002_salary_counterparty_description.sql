-- Ripara le entrate Open Banking per cui il provider ha inserito l'ordinante
-- soltanto nella narrativa. Il testo completo resta disponibile in
-- raw_description, mentre description diventa l'etichetta leggibile.

with extracted as (
  select
    id,
    trim(
      split_part(
        split_part(raw_description, 'Anagrafica Ordinante ', 2),
        ' Note:',
        1
      )
    ) as counterparty
  from public.transactions
  where source = 'open_banking'
    and kind = 'income'
    and raw_description like '%Anagrafica Ordinante %'
)
update public.transactions as transaction
set description = extracted.counterparty,
    counterparty_name = coalesce(
      nullif(transaction.counterparty_name, ''),
      extracted.counterparty
    ),
    import_confidence = greatest(
      coalesce(transaction.import_confidence, 0),
      0.9
    )
from extracted
where transaction.id = extracted.id
  and length(extracted.counterparty) between 3 and 100;
