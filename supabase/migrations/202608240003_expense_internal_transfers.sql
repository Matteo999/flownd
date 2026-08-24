-- Permette di classificare come giroconto anche un'uscita diretta verso un
-- conto proprio che non è collegato a Flownd.

create or replace function public.categorize_transactions_bulk(
  p_transaction_ids uuid[],
  p_category text,
  p_remember_similar boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  selected_count integer;
  selected_kind text;
  kind_count integer;
  is_internal_transfer boolean;
begin
  select count(*), count(distinct coalesce(kind, 'expense')), min(coalesce(kind, 'expense'))
  into selected_count, kind_count, selected_kind
  from public.transactions
  where user_id = auth.uid()
    and id = any(p_transaction_ids)
    and internal_transfer = false;

  if selected_count = 0 or selected_count <> cardinality(p_transaction_ids) then
    raise exception 'Invalid bulk transaction selection';
  end if;
  if kind_count <> 1 then
    raise exception 'Bulk transactions must have the same kind';
  end if;

  is_internal_transfer := p_category = 'Giroconto';

  update public.transactions
  set category = p_category,
      income_type = case
        when is_internal_transfer then 'internal_transfer'
        when selected_kind <> 'income' then null
        when p_category = 'Stipendio' then 'salary'
        when p_category = 'Tredicesima' then 'extra_salary'
        when p_category = 'Rimborso spese' then 'reimbursement'
        else 'other_income'
      end,
      internal_transfer = is_internal_transfer,
      excluded_from_totals = is_internal_transfer,
      excluded_from_budget = case
        when is_internal_transfer then true
        when selected_kind = 'income'
          and p_category in ('Tredicesima', 'Rimborso spese') then true
        else false
      end
  where user_id = auth.uid()
    and id = any(p_transaction_ids);

  if p_remember_similar and selected_kind = 'expense' then
    insert into public.transaction_category_rules (
      user_id,
      description_key,
      kind,
      category,
      financial_account_id,
      updated_at
    )
    select
      auth.uid(),
      public.normalize_transaction_description(description),
      'expense',
      p_category,
      financial_account_id,
      now()
    from public.transactions
    where user_id = auth.uid()
      and id = any(p_transaction_ids)
      and public.normalize_transaction_description(description) <> ''
    group by public.normalize_transaction_description(description), financial_account_id
    on conflict (user_id, kind, description_key, financial_account_id)
    do update set
      category = excluded.category,
      updated_at = excluded.updated_at;
  end if;

  return selected_count;
end;
$$;

create or replace function public.apply_transaction_category_rule()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  matched_category text;
begin
  if new.kind <> 'expense' or new.source <> 'open_banking' then
    return new;
  end if;

  select rule.category
  into matched_category
  from public.transaction_category_rules rule
  where rule.user_id = new.user_id
    and rule.kind = new.kind
    and rule.description_key = public.normalize_transaction_description(new.description)
    and (
      rule.financial_account_id is null
      or rule.financial_account_id = new.financial_account_id
    )
  order by (rule.financial_account_id is not null) desc
  limit 1;

  if matched_category is not null then
    new.category := matched_category;
    if matched_category = 'Giroconto' then
      new.income_type := 'internal_transfer';
      new.internal_transfer := true;
      new.excluded_from_totals := true;
      new.excluded_from_budget := true;
    end if;
  end if;
  return new;
end;
$$;
