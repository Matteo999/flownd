-- Ripara causali legacy rimaste integrali prima dell'introduzione del parser
-- semantico. Interviene solo quando la descrizione visibile coincide ancora
-- con raw_description (o con il suo limite storico di 180 caratteri) e quando
-- è presente un marcatore linguistico ad alta affidabilità.

with candidates as (
  select
    transaction.id,
    bank_import.direction,
    transaction.raw_description,
    case
      when transaction.raw_description ~* '\managrafica[[:space:]]+ordinante\M' then
        nullif(trim(regexp_replace(
          regexp_replace(
            transaction.raw_description,
            '(?is)^.*\managrafica[[:space:]]+ordinante[[:space:]]*[:\-]?[[:space:]]*',
            ''
          ),
          '(?is)[[:space:]]+(?:note|causale|reason|motif|ref(?:erence)?\.?|id\.?|mandato|mand\.?)[[:space:]]*[:\-]?[[:space:]].*$',
          ''
        )), '')
      when transaction.raw_description ~* '\m(?:a|in)[[:space:]]+favore[[:space:]]+di\M' then
        nullif(trim(regexp_replace(
          regexp_replace(
            transaction.raw_description,
            '(?is)^.*(?:a|in)[[:space:]]+favore[[:space:]]+di[[:space:]]+',
            ''
          ),
          '(?is)[[:space:]]+(?:iban|bic|note|causale|reason|motif)[[:space:]].*$',
          ''
        )), '')
      when transaction.raw_description ~* '\m(?:presso|at|chez|bei)\M' then
        nullif(trim(regexp_replace(
          regexp_replace(
            transaction.raw_description,
            '(?is)^.*\m(?:presso|at|chez|bei)[[:space:]]+',
            ''
          ),
          '(?is)[[:space:]]+(?:[-–][[:space:]]*transa(?:zione|ction).*$|(?:tessera|card|carte|karte|iban|causale|reason|date|datum)[[:space:]].*$)',
          ''
        )), '')
      else null
    end as semantic_description,
    case
      when transaction.raw_description ~* '\m(?:presso|at|chez|bei)\M' then 'merchant'
      else 'counterparty'
    end as identity_type
  from public.transactions as transaction
  join public.open_banking_transaction_links as link
    on link.transaction_id = transaction.id
  join public.open_banking_transaction_imports as bank_import
    on bank_import.id = link.bank_import_id
  where transaction.source = 'open_banking'
    and transaction.raw_description is not null
    and (
      transaction.description = transaction.raw_description
      or transaction.description = left(transaction.raw_description, 180)
    )
), valid_candidates as (
  select *
  from candidates
  where semantic_description is not null
    and length(semantic_description) between 2 and 100
    and semantic_description !~* '\m(iban|bic|importo|amount|divisa|currency)\M'
)
update public.transactions as transaction
set description = valid_candidates.semantic_description,
    merchant_name = case
      when valid_candidates.identity_type = 'merchant'
        and valid_candidates.direction = 'debit'
        then valid_candidates.semantic_description
      else null
    end,
    counterparty_name = case
      when valid_candidates.identity_type = 'counterparty'
        or valid_candidates.direction = 'credit'
        then valid_candidates.semantic_description
      else null
    end,
    import_confidence = 1
from valid_candidates
where transaction.id = valid_candidates.id;
