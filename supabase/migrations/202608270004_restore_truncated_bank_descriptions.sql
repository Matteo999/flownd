-- La migrazione ritirata 202608270002 aveva copiato i primi 100 caratteri
-- della raw_description in description/counterparty_name. Ripristiniamo solo
-- le righe che conservano esattamente quella firma, usando il valore canonico
-- dell'import Open Banking già esistente.

with damaged as (
  select
    transaction.id,
    transaction.raw_description,
    bank_import.description as canonical_description,
    bank_import.counterparty as canonical_counterparty,
    bank_import.direction
  from public.transactions as transaction
  join public.open_banking_transaction_links as link
    on link.transaction_id = transaction.id
  join public.open_banking_transaction_imports as bank_import
    on bank_import.id = link.bank_import_id
  where transaction.source = 'open_banking'
    and transaction.raw_description is not null
    and bank_import.description is not null
    and (
      transaction.description = left(transaction.raw_description, 100)
      or transaction.counterparty_name = left(transaction.raw_description, 100)
    )
), parsed as (
  select
    damaged.*,
    case
      when raw_description ~* '\m(presso|at|chez|bei)\M' then
        nullif(trim(regexp_replace(
          regexp_replace(
            raw_description,
            '(?is)^.*\m(?:presso|at|chez|bei)[[:space:]]+',
            ''
          ),
          '(?is)[[:space:]]+(?:[-–][[:space:]]*transa(?:zione|ction).*$|(?:tessera|card|carte|karte|iban|causale|reason|date|datum)[[:space:]].*$)',
          ''
        )), '')
      else null
    end as narrative_merchant,
    case
      when raw_description ~* '\m(?:(?:a|in)[[:space:]]+favore[[:space:]]+di|a[[:space:]]+favor[[:space:]]+de|em[[:space:]]+favor[[:space:]]+de)\M' then
        nullif(trim(regexp_replace(
          regexp_replace(
            raw_description,
            '(?is)^.*(?:(?:a|in)[[:space:]]+favore[[:space:]]+di|a[[:space:]]+favor[[:space:]]+de|em[[:space:]]+favor[[:space:]]+de)[[:space:]]+',
            ''
          ),
          '(?is)[[:space:]]+(?:iban|bic|note|causale|reason|motif)[[:space:]].*$',
          ''
        )), '')
      else null
    end as narrative_beneficiary,
    not (
      length(canonical_description) >= 45
      and canonical_description ~* '\m(carta|card|carte|karte|iban|operazione|operation|transaction|transazione)\M'
      and canonical_description ~* '\m(importo|amount|betrag|montant|divisa|currency|valuta|date|datum)\M'
    ) as canonical_is_concise
  from damaged
), restorable as (
  select
    parsed.*,
    coalesce(
      case when canonical_is_concise then canonical_description else null end,
      narrative_merchant,
      narrative_beneficiary
    ) as restored_description
  from parsed
)
update public.transactions as transaction
set description = left(restorable.restored_description, 180),
    merchant_name = case
      when restorable.direction = 'debit' then coalesce(
        restorable.narrative_merchant,
        restorable.canonical_counterparty
      )
      else null
    end,
    counterparty_name = case
      when restorable.narrative_beneficiary is not null then restorable.narrative_beneficiary
      when restorable.direction = 'credit' then restorable.canonical_counterparty
      else null
    end,
    import_confidence = case
      when coalesce(
        restorable.narrative_merchant,
        restorable.narrative_beneficiary,
        restorable.canonical_counterparty
      ) is null then 0.5
      else 1
    end
from restorable
where transaction.id = restorable.id
  and restorable.restored_description is not null
  and length(restorable.restored_description) between 2 and 180;
