-- Alcune banche non valorizzano creditor.name nei bonifici in uscita e
-- inseriscono la controparte soltanto nella causale dopo "a favore di".

with candidates as (
  select
    id,
    trim(
      trailing ' ,.;:-' from substring(
        raw_description from
        '(?i)(?:(?:a|in)[[:space:]]+favore[[:space:]]+di|in[[:space:]]+favou?r[[:space:]]+of|en[[:space:]]+faveur[[:space:]]+de|zugunsten(?:[[:space:]]+von)?)[[:space:]]+(.+?)(?=[[:space:]]+(?:iban(?:[[:space:]]+beneficiario)?|bic|note|causale|reason|motif|ref(?:erence)?\.?|id\.?|$))'
      )
    ) as beneficiary
  from public.transactions
  where source = 'open_banking'
    and raw_description is not null
    and description = left(raw_description, 180)
), valid_candidates as (
  select id, beneficiary
  from candidates
  where beneficiary is not null
    and length(beneficiary) between 2 and 100
)
update public.transactions as transaction
set description = valid_candidates.beneficiary,
    merchant_name = null,
    counterparty_name = valid_candidates.beneficiary,
    import_confidence = 1
from valid_candidates
where transaction.id = valid_candidates.id;
