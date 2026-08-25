-- Transazioni e categorie sono un'unica preferenza; il risparmio libero non è un obiettivo.

update public.group_members
set share_transaction_categories = share_transactions
where share_transaction_categories is distinct from share_transactions;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'group_members_transactions_include_categories'
      and conrelid = 'public.group_members'::regclass
  ) then
    alter table public.group_members
      add constraint group_members_transactions_include_categories
      check (share_transaction_categories = share_transactions);
  end if;
end;
$$;

delete from public.goal_group_shares goal_share
using public.goals goal
where goal.id = goal_share.goal_id
  and goal.status = 'free_savings';

drop policy if exists "goal_group_shares_owner_insert" on public.goal_group_shares;
create policy "goal_group_shares_owner_insert" on public.goal_group_shares
  for insert with check (
    shared_by = auth.uid()
    and public.is_group_member(group_id)
    and exists (
      select 1
      from public.goals goal
      where goal.id = goal_id
        and goal.user_id = auth.uid()
        and goal.group_id is null
        and goal.status <> 'free_savings'
    )
  );

create or replace function public.update_my_group_sharing(
  p_group_id uuid,
  p_share_monthly_budget boolean,
  p_share_net_worth boolean,
  p_share_transactions boolean,
  p_share_transaction_categories boolean
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.group_members
  set
    share_monthly_budget = coalesce(p_share_monthly_budget, false),
    share_net_worth = coalesce(p_share_net_worth, false),
    share_transactions = coalesce(p_share_transactions, false),
    share_transaction_categories = coalesce(p_share_transactions, false),
    avatar_url = coalesce(
      auth.jwt() -> 'user_metadata' ->> 'avatar_url',
      auth.jwt() -> 'user_metadata' ->> 'picture',
      avatar_url
    ),
    display_name = coalesce(
      auth.jwt() -> 'user_metadata' ->> 'full_name',
      auth.jwt() -> 'user_metadata' ->> 'name',
      display_name
    )
  where group_id = p_group_id and user_id = auth.uid();
  if not found then raise exception 'group membership not found'; end if;
end;
$$;

create or replace function public.set_goal_group_sharing(
  p_group_id uuid,
  p_goal_id uuid,
  p_shared boolean
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'group membership not found';
  end if;
  if not exists (
    select 1
    from public.goals
    where id = p_goal_id
      and user_id = auth.uid()
      and group_id is null
      and status <> 'free_savings'
  ) then
    raise exception 'personal goal not found';
  end if;
  if coalesce(p_shared, false) then
    insert into public.goal_group_shares (group_id, goal_id, shared_by)
    values (p_group_id, p_goal_id, auth.uid())
    on conflict (group_id, goal_id) do nothing;
  else
    delete from public.goal_group_shares
    where group_id = p_group_id and goal_id = p_goal_id and shared_by = auth.uid();
  end if;
end;
$$;

notify pgrst, 'reload schema';
