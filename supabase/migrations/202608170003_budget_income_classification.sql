-- Distingue le entrate reali dai movimenti che non finanziano il budget.

alter table public.transactions
  add column if not exists excluded_from_budget boolean not null default false,
  add column if not exists income_type text;

alter table public.transactions
  drop constraint if exists transactions_income_type_check,
  add constraint transactions_income_type_check check (
    income_type is null or income_type in (
      'salary',
      'extra_salary',
      'reimbursement',
      'internal_transfer',
      'other_income'
    )
  );

update public.transactions
set category = 'Cibo e Spesa'
where lower(trim(category)) in ('spesa', 'cibo & spesa', 'cibo e spesa');

update public.transactions
set income_type = case
      when internal_transfer then 'internal_transfer'
      when lower(description) ~ '(rimborso|storno|refund)' then 'reimbursement'
      when lower(description) ~ '(tredicesima|13ma|13esima)' then 'extra_salary'
      when category = 'Stipendio' then 'salary'
      else 'other_income'
    end,
    excluded_from_budget = case
      when internal_transfer then true
      when lower(description) ~ '(rimborso|storno|refund)' then true
      when lower(description) ~ '(tredicesima|13ma|13esima)' then true
      else excluded_from_budget
    end,
    category = case
      when internal_transfer then 'Giroconto'
      when lower(description) ~ '(rimborso|storno|refund)' then 'Rimborso spese'
      when lower(description) ~ '(tredicesima|13ma|13esima)' then 'Tredicesima'
      when category in ('Entrata', 'Entrate') then 'Altra entrata'
      else category
    end
where kind = 'income';

create index if not exists transactions_user_budget_income_idx
  on public.transactions (user_id, occurred_at desc)
  where kind = 'income'
    and excluded_from_totals = false
    and excluded_from_budget = false;
