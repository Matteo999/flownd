-- Movimenti degli altri membri dei miei gruppi per la Timeline, su un
-- intervallo di date. Stesse regole di visibilità di shared_group_transactions:
-- serve l'accesso ai movimenti del gruppo e il membro deve condividerli.
-- Con visibilità 'summary' descrizione e categoria restano private.
create or replace function public.member_timeline_transactions(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  id uuid, member_id uuid, description text, amount numeric,
  kind text, category text, private_details boolean, occurred_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  with visible_members as (
    select member.user_id,
      bool_or(member.transaction_visibility = 'full') as full_details
    from public.group_members viewer
    join public.group_members member
      on member.group_id = viewer.group_id and member.user_id <> viewer.user_id
    where viewer.user_id = auth.uid()
      and viewer.transactions_access in ('view', 'edit')
      and member.transaction_visibility <> 'none'
    group by member.user_id
  )
  select transaction.id, transaction.user_id,
    case when visible.full_details then transaction.description
      else 'Movimento condiviso' end,
    transaction.amount,
    coalesce(transaction.kind, 'expense'),
    case when visible.full_details then transaction.category else null end,
    not visible.full_details,
    transaction.occurred_at
  from visible_members visible
  join public.transactions transaction on transaction.user_id = visible.user_id
  where transaction.occurred_at >= p_from
    and transaction.occurred_at < p_to
    and coalesce(transaction.excluded_from_totals, false) = false
    and coalesce(transaction.internal_transfer, false) = false
  order by transaction.occurred_at desc
  limit 2000;
$$;

revoke all on function public.member_timeline_transactions(timestamptz, timestamptz) from public, anon;
grant execute on function public.member_timeline_transactions(timestamptz, timestamptz) to authenticated;
