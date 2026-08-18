-- Regole esplicite per categorizzare i futuri movimenti Open Banking simili.

create table if not exists public.transaction_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description_key text not null check (length(description_key) > 0),
  kind text not null check (kind in ('expense', 'income')),
  category text not null,
  financial_account_id uuid references public.financial_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, kind, description_key, financial_account_id)
);

alter table public.transaction_category_rules enable row level security;

create policy "transaction_category_rules_own_rows"
  on public.transaction_category_rules
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.normalize_transaction_description(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(value, '')), '[0-9]{4,}', ' ', 'g'),
        '[-_/.,*]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

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

  update public.transactions
  set category = p_category,
      income_type = case
        when selected_kind <> 'income' then null
        when p_category = 'Stipendio' then 'salary'
        when p_category = 'Tredicesima' then 'extra_salary'
        when p_category = 'Rimborso spese' then 'reimbursement'
        when p_category = 'Giroconto' then 'internal_transfer'
        else 'other_income'
      end,
      excluded_from_budget = case
        when selected_kind <> 'income' then false
        when p_category in ('Tredicesima', 'Rimborso spese', 'Giroconto') then true
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

revoke all on function public.categorize_transactions_bulk(uuid[], text, boolean)
  from public;
grant execute on function public.categorize_transactions_bulk(uuid[], text, boolean)
  to authenticated;

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
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_apply_category_rule on public.transactions;
create trigger transactions_apply_category_rule
before insert on public.transactions
for each row execute function public.apply_transaction_category_rule();

create index if not exists transaction_category_rules_lookup_idx
  on public.transaction_category_rules
  (user_id, kind, description_key, financial_account_id);
