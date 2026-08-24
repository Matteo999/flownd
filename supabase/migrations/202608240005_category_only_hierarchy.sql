-- Primo rilascio: le categorie organizzano le transazioni, senza sotto-budget.
-- Unifica inoltre le etichette storiche con le categorie standard.

do $$
declare
  mapping record;
  legacy record;
  canonical_key text;
begin
  for mapping in
    select * from (values
      ('Spesa', 'Cibo e Spesa'),
      ('Trasporti', 'Trasporti e Auto'),
      ('Ristoranti', 'Bar e ristoranti')
    ) as aliases(legacy_name, canonical_name)
  loop
    for legacy in
      select user_id, category_key
      from public.budget_categories
      where not is_macro
        and lower(trim(name)) = lower(mapping.legacy_name)
    loop
      select category_key
      into canonical_key
      from public.budget_categories
      where user_id = legacy.user_id
        and not is_macro
        and lower(trim(name)) = lower(mapping.canonical_name)
      order by created_at
      limit 1;

      if canonical_key is not null then
        update public.budget_categories
        set parent_category_key = canonical_key
        where user_id = legacy.user_id
          and parent_category_key = legacy.category_key;

        delete from public.budget_categories
        where user_id = legacy.user_id
          and category_key = legacy.category_key;
      else
        update public.budget_categories
        set name = mapping.canonical_name
        where user_id = legacy.user_id
          and category_key = legacy.category_key;
      end if;

      canonical_key := null;
    end loop;
  end loop;
end;
$$;

update public.budget_categories
set budget_enabled = false,
    allocation_percentage = 0,
    monthly_limit = 0
where not is_macro;

update public.transactions
set category = case lower(trim(category))
  when 'spesa' then 'Cibo e Spesa'
  when 'trasporti' then 'Trasporti e Auto'
  when 'ristoranti' then 'Bar e ristoranti'
  else category
end
where lower(trim(category)) in ('spesa', 'trasporti', 'ristoranti');
