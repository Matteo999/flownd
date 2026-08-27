-- Ripristina i valori canonici conservati nell'import Open Banking dopo la
-- migrazione 202608270002, che attribuiva priorità globale al campo Note.

with linked_imports as (
  select
    link.transaction_id,
    bank_import.id as bank_import_id,
    bank_import.user_id,
    bank_import.bank_account_id,
    bank_import.description as canonical_description,
    bank_import.counterparty as canonical_counterparty,
    bank_import.direction,
    bank_import.amount,
    bank_import.currency,
    bank_import.occurred_on,
    transaction.raw_description,
    transaction.category,
    transaction.internal_transfer,
    transaction.excluded_from_totals,
    transaction.excluded_from_budget
  from public.open_banking_transaction_links as link
  join public.open_banking_transaction_imports as bank_import
    on bank_import.id = link.bank_import_id
  join public.transactions as transaction
    on transaction.id = link.transaction_id
  where transaction.source = 'open_banking'
    and transaction.raw_description is not null
    and transaction.raw_description ~* '\m(note|causale|reason|motif|verwendungszweck)\M'
), restored as (
  select
    linked_imports.*,
    case
      when raw_description ~* '\m(?:a|in)[[:space:]]+favore[[:space:]]+di\M' then
        nullif(trim(regexp_replace(
          regexp_replace(
            raw_description,
            '(?is)^.*(?:a|in)[[:space:]]+favore[[:space:]]+di[[:space:]]+',
            ''
          ),
          '(?is)[[:space:]]+IBAN.*$',
          ''
        )), '')
      else null
    end as narrative_beneficiary,
    exists (
      select 1
      from public.open_banking_transaction_imports as counterpart
      where counterpart.user_id = linked_imports.user_id
        and counterpart.id <> linked_imports.bank_import_id
        and counterpart.bank_account_id <> linked_imports.bank_account_id
        and counterpart.status = 'booked'
        and counterpart.direction <> linked_imports.direction
        and counterpart.amount = linked_imports.amount
        and counterpart.currency = linked_imports.currency
        and abs(counterpart.occurred_on - linked_imports.occurred_on) <= 2
    ) as has_internal_pair
  from linked_imports
)
update public.transactions as transaction
set description = left(coalesce(
      restored.narrative_beneficiary,
      restored.canonical_description,
      transaction.description
    ), 180),
    merchant_name = case
      when restored.narrative_beneficiary is not null then null
      when restored.direction = 'debit' then restored.canonical_counterparty
      else null
    end,
    counterparty_name = case
      when restored.narrative_beneficiary is not null then restored.narrative_beneficiary
      when restored.direction = 'credit' then restored.canonical_counterparty
      else null
    end,
    import_confidence = case
      when coalesce(restored.narrative_beneficiary, restored.canonical_counterparty) is null then 0.5
      else 1
    end,
    category = case
      when restored.raw_description ~* '\mgiroconto\M' then 'Altro'
      when restored.raw_description ~* '\m(?:a|in)[[:space:]]+favore[[:space:]]+di\M'
        and restored.raw_description ~* '\m(conforama|divano)\M'
        and transaction.category = 'Casa e utenze' then 'Altro'
      else transaction.category
    end,
    income_type = case
      when restored.raw_description ~* '\mgiroconto\M' and restored.has_internal_pair
        then 'internal_transfer'
      when restored.raw_description ~* '\mgiroconto\M' then null
      else transaction.income_type
    end,
    internal_transfer = case
      when restored.raw_description ~* '\mgiroconto\M' then restored.has_internal_pair
      else transaction.internal_transfer
    end,
    excluded_from_totals = case
      when restored.raw_description ~* '\mgiroconto\M' then restored.has_internal_pair
      else transaction.excluded_from_totals
    end,
    excluded_from_budget = case
      when restored.raw_description ~* '\mgiroconto\M' then restored.has_internal_pair
      else transaction.excluded_from_budget
    end
from restored
where transaction.id = restored.transaction_id;
