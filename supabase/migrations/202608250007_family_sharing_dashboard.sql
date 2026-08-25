-- Preferenze individuali di condivisione, obiettivi specifici e riepilogo famiglia.

alter table public.group_members
  add column if not exists avatar_url text,
  add column if not exists share_monthly_budget boolean not null default false,
  add column if not exists share_net_worth boolean not null default false,
  add column if not exists share_transactions boolean not null default false,
  add column if not exists share_transaction_categories boolean not null default false;

update public.group_members member
set
  avatar_url = coalesce(
    auth_user.raw_user_meta_data ->> 'avatar_url',
    auth_user.raw_user_meta_data ->> 'picture'
  ),
  display_name = coalesce(
    nullif(member.display_name, ''),
    auth_user.raw_user_meta_data ->> 'full_name',
    auth_user.raw_user_meta_data ->> 'name',
    auth_user.email
  ),
  email = coalesce(member.email, auth_user.email)
from auth.users auth_user
where auth_user.id = member.user_id;

create table if not exists public.goal_group_shares (
  group_id uuid not null references public.groups(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  shared_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, goal_id)
);

alter table public.goal_group_shares enable row level security;

create or replace function public.is_goal_shared_with_user(
  p_goal_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.goal_group_shares goal_share
    where goal_share.goal_id = p_goal_id
      and public.has_group_access(goal_share.group_id, 'goals', 'view', p_user_id)
  );
$$;

revoke all on function public.is_goal_shared_with_user(uuid, uuid) from public, anon;
grant execute on function public.is_goal_shared_with_user(uuid, uuid) to authenticated;

drop policy if exists "goal_group_shares_members_read" on public.goal_group_shares;
create policy "goal_group_shares_members_read" on public.goal_group_shares
  for select using (public.is_group_member(group_id));
drop policy if exists "goal_group_shares_owner_insert" on public.goal_group_shares;
create policy "goal_group_shares_owner_insert" on public.goal_group_shares
  for insert with check (
    shared_by = auth.uid()
    and public.is_group_member(group_id)
    and exists (
      select 1 from public.goals goal
      where goal.id = goal_id
        and goal.user_id = auth.uid()
        and goal.group_id is null
        and goal.status <> 'free_savings'
    )
  );
drop policy if exists "goal_group_shares_owner_delete" on public.goal_group_shares;
create policy "goal_group_shares_owner_delete" on public.goal_group_shares
  for delete using (shared_by = auth.uid());

drop policy if exists "goals_explicit_group_share_read" on public.goals;
create policy "goals_explicit_group_share_read" on public.goals
  for select using (
    group_id is null and public.is_goal_shared_with_user(id)
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

create or replace function public.protect_member_sharing_preferences()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.user_id <> auth.uid() and (
    old.share_monthly_budget is distinct from new.share_monthly_budget
    or old.share_net_worth is distinct from new.share_net_worth
    or old.share_transactions is distinct from new.share_transactions
    or old.share_transaction_categories is distinct from new.share_transaction_categories
  ) then
    raise exception 'sharing preferences belong to the member';
  end if;
  return new;
end;
$$;

drop trigger if exists group_members_protect_sharing on public.group_members;
create trigger group_members_protect_sharing
  before update on public.group_members
  for each row execute function public.protect_member_sharing_preferences();

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
    select 1 from public.goals
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

create or replace function public.leave_family_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if public.is_group_owner(p_group_id) then
    raise exception 'the owner must delete the group';
  end if;
  delete from public.goal_group_shares
  where group_id = p_group_id and shared_by = auth.uid();
  delete from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
  if not found then raise exception 'group membership not found'; end if;
end;
$$;

create or replace function public.delete_family_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if auth.uid() is null or not public.is_group_owner(p_group_id) then
    raise exception 'group owner required';
  end if;
  delete from public.groups where id = p_group_id;
end;
$$;

create or replace function public.family_dashboard_summary(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  selected_group public.groups%rowtype;
  member_count integer := 0;
  budget_total numeric := 0;
  budget_spent numeric := 0;
  net_worth_total numeric := 0;
  goal_count integer := 0;
  goal_saved numeric := 0;
  goal_target numeric := 0;
  transaction_count integer := 0;
  category_count integer := 0;
  member_avatars jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'group membership required';
  end if;
  select * into selected_group from public.groups where id = p_group_id;
  if not found then raise exception 'group not found'; end if;

  select count(*) into member_count
  from public.group_members where group_id = p_group_id;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', member.user_id,
        'displayName', member.display_name,
        'avatarUrl', member.avatar_url
      ) order by member.joined_at
    ),
    '[]'::jsonb
  ) into member_avatars
  from public.group_members member
  where member.group_id = p_group_id;

  select coalesce(sum(monthly_limit), 0) into budget_total
  from public.group_budgets where group_id = p_group_id;
  if budget_total = 0 then
    select coalesce(sum(category.monthly_limit), 0) into budget_total
    from public.group_members member
    join public.budget_categories category on category.user_id = member.user_id
    where member.group_id = p_group_id
      and member.share_monthly_budget
      and category.is_macro;
  end if;

  select
    coalesce(sum(transaction.amount), 0),
    count(transaction.id),
    count(distinct transaction.category)
  into budget_spent, transaction_count, category_count
  from public.group_members member
  join public.transactions transaction on transaction.user_id = member.user_id
  where member.group_id = p_group_id
    and member.share_transactions
    and transaction.kind = 'expense'
    and transaction.occurred_at >= date_trunc('month', now())
    and coalesce(transaction.excluded_from_totals, false) = false
    and not exists (
      select 1 from public.shared_expenses expense
      where expense.transaction_id = transaction.id and expense.group_id = p_group_id
    );

  select
    budget_spent + coalesce(sum(expense.amount), 0),
    transaction_count + count(expense.id)
  into budget_spent, transaction_count
  from public.shared_expenses expense
  where expense.group_id = p_group_id
    and expense.occurred_at >= date_trunc('month', now());

  select coalesce(sum(account.current_balance), 0) into net_worth_total
  from public.group_members member
  join public.financial_accounts account on account.user_id = member.user_id
  where member.group_id = p_group_id
    and member.share_net_worth
    and account.active;

  with visible_goals as (
    select goal.id, goal.saved_amount, goal.target_amount
    from public.goals goal
    where goal.group_id = p_group_id
      and goal.active
      and goal.status <> 'free_savings'
    union
    select goal.id, goal.saved_amount, goal.target_amount
    from public.goal_group_shares goal_share
    join public.goals goal on goal.id = goal_share.goal_id
    where goal_share.group_id = p_group_id
      and goal.active
      and goal.status <> 'free_savings'
  )
  select count(*), coalesce(sum(saved_amount), 0), coalesce(sum(target_amount), 0)
  into goal_count, goal_saved, goal_target
  from visible_goals;

  return jsonb_build_object(
    'groupId', selected_group.id,
    'groupName', selected_group.name,
    'currency', selected_group.currency,
    'memberCount', member_count,
    'members', member_avatars,
    'budgetTotal', budget_total,
    'budgetSpent', budget_spent,
    'netWorthTotal', net_worth_total,
    'sharedGoalCount', goal_count,
    'goalSaved', goal_saved,
    'goalTarget', goal_target,
    'transactionCount', transaction_count,
    'categoryCount', category_count
  );
end;
$$;

create or replace function public.shared_group_transactions(p_group_id uuid)
returns table (
  id uuid,
  member_id uuid,
  description text,
  amount numeric,
  category text,
  occurred_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    transaction.id,
    transaction.user_id as member_id,
    transaction.description,
    transaction.amount,
    transaction.category,
    transaction.occurred_at
  from public.group_members viewer
  join public.group_members member on member.group_id = viewer.group_id
  join public.transactions transaction on transaction.user_id = member.user_id
  where viewer.group_id = p_group_id
    and viewer.user_id = auth.uid()
    and (
      viewer.role = 'owner'
      or viewer.transactions_access in ('view', 'edit')
    )
    and member.share_transactions
    and coalesce(transaction.excluded_from_totals, false) = false
  order by transaction.occurred_at desc
  limit 20;
$$;

create or replace function public.add_group_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (
    group_id, user_id, role, transactions_access, budgets_access, goals_access,
    display_name, email, avatar_url
  ) values (
    new.id, new.owner_id, 'owner', 'edit', 'edit', 'edit',
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'full_name',
      auth.jwt() -> 'user_metadata' ->> 'name',
      auth.jwt() ->> 'email'
    ),
    auth.jwt() ->> 'email',
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'avatar_url',
      auth.jwt() -> 'user_metadata' ->> 'picture'
    )
  );
  return new;
end;
$$;

create or replace function public.accept_group_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  selected_invite public.group_invites%rowtype;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or current_email = '' then raise exception 'authentication required'; end if;
  select * into selected_invite from public.group_invites
  where id = p_invite_id for update;
  if not found or selected_invite.status <> 'pending' then raise exception 'invite not available'; end if;
  if selected_invite.expires_at <= now() then
    update public.group_invites set status = 'expired' where id = p_invite_id;
    raise exception 'invite expired';
  end if;
  if lower(selected_invite.email) <> current_email then
    raise exception 'invite belongs to another account';
  end if;
  insert into public.group_members (
    group_id, user_id, role, transactions_access, budgets_access, goals_access,
    display_name, email, avatar_url
  ) values (
    selected_invite.group_id, auth.uid(), selected_invite.role,
    selected_invite.transactions_access, selected_invite.budgets_access,
    selected_invite.goals_access,
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'full_name',
      auth.jwt() -> 'user_metadata' ->> 'name',
      auth.jwt() ->> 'email'
    ),
    auth.jwt() ->> 'email',
    coalesce(
      auth.jwt() -> 'user_metadata' ->> 'avatar_url',
      auth.jwt() -> 'user_metadata' ->> 'picture'
    )
  ) on conflict (group_id, user_id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    avatar_url = excluded.avatar_url;
  update public.group_invites set status = 'accepted', accepted_at = now()
  where id = p_invite_id;
  return selected_invite.group_id;
end;
$$;

revoke all on function public.update_my_group_sharing(uuid, boolean, boolean, boolean, boolean)
  from public, anon;
revoke all on function public.set_goal_group_sharing(uuid, uuid, boolean)
  from public, anon;
revoke all on function public.leave_family_group(uuid) from public, anon;
revoke all on function public.delete_family_group(uuid) from public, anon;
revoke all on function public.family_dashboard_summary(uuid) from public, anon;
revoke all on function public.shared_group_transactions(uuid) from public, anon;

grant execute on function public.update_my_group_sharing(uuid, boolean, boolean, boolean, boolean)
  to authenticated;
grant execute on function public.set_goal_group_sharing(uuid, uuid, boolean)
  to authenticated;
grant execute on function public.leave_family_group(uuid) to authenticated;
grant execute on function public.delete_family_group(uuid) to authenticated;
grant execute on function public.family_dashboard_summary(uuid) to authenticated;
grant execute on function public.shared_group_transactions(uuid) to authenticated;

notify pgrst, 'reload schema';
