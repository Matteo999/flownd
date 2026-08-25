-- Fase F: gruppi, condivisione granulare, obiettivi, split e budget familiari.

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'member', 'readonly')),
  transactions_access text not null default 'view'
    check (transactions_access in ('none', 'view', 'edit')),
  budgets_access text not null default 'view'
    check (budgets_access in ('none', 'view', 'edit')),
  goals_access text not null default 'view'
    check (goals_access in ('none', 'view', 'edit')),
  display_name text,
  email text,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role text not null default 'member'
    check (role in ('member', 'readonly')),
  transactions_access text not null default 'view'
    check (transactions_access in ('none', 'view', 'edit')),
  budgets_access text not null default 'view'
    check (budgets_access in ('none', 'view', 'edit')),
  goals_access text not null default 'view'
    check (goals_access in ('none', 'view', 'edit')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists group_invites_pending_email_idx
  on public.group_invites (group_id, lower(email)) where status = 'pending';
create index if not exists group_members_user_idx
  on public.group_members (user_id, joined_at desc);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;

create or replace function public.is_group_member(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

create or replace function public.has_group_access(
  p_group_id uuid,
  p_area text,
  p_required text default 'view',
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
    from public.group_members member
    where member.group_id = p_group_id
      and member.user_id = p_user_id
      and (
        member.role = 'owner'
        or (
          case p_area
            when 'transactions' then member.transactions_access
            when 'budgets' then member.budgets_access
            when 'goals' then member.goals_access
            else 'none'
          end
          = 'edit'
        )
        or (
          p_required <> 'edit'
          and case p_area
            when 'transactions' then member.transactions_access
            when 'budgets' then member.budgets_access
            when 'goals' then member.goals_access
            else 'none'
          end = 'view'
        )
      )
  );
$$;

create or replace function public.is_group_owner(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = p_user_id
  );
$$;

create or replace function public.is_pending_group_invitee(
  p_group_id uuid,
  p_email text default (auth.jwt() ->> 'email')
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_invites
    where group_id = p_group_id
      and status = 'pending'
      and expires_at > now()
      and lower(email) = lower(coalesce(p_email, ''))
  );
$$;

revoke all on function public.is_group_member(uuid, uuid) from public, anon;
revoke all on function public.has_group_access(uuid, text, text, uuid) from public, anon;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.has_group_access(uuid, text, text, uuid) to authenticated;
revoke all on function public.is_group_owner(uuid, uuid) from public, anon;
revoke all on function public.is_pending_group_invitee(uuid, text) from public, anon;
grant execute on function public.is_group_owner(uuid, uuid) to authenticated;
grant execute on function public.is_pending_group_invitee(uuid, text) to authenticated;

create policy "groups_members_read" on public.groups
  for select using (public.is_group_member(id));
create policy "groups_invited_read" on public.groups
  for select using (public.is_pending_group_invitee(id));
create policy "groups_owner_insert" on public.groups
  for insert with check (owner_id = auth.uid());
create policy "groups_owner_update" on public.groups
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "groups_owner_delete" on public.groups
  for delete using (owner_id = auth.uid());

create policy "group_members_group_read" on public.group_members
  for select using (public.is_group_member(group_id));
create policy "group_members_owner_manage" on public.group_members
  for all using (public.is_group_owner(group_id))
  with check (public.is_group_owner(group_id));

create policy "group_invites_managers" on public.group_invites
  for all using (public.is_group_owner(group_id)) with check (
    invited_by = auth.uid()
    and public.is_group_owner(group_id)
  );
create policy "group_invites_recipient_read" on public.group_invites
  for select using (
    status = 'pending'
    and expires_at > now()
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create or replace function public.add_group_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (
    group_id, user_id, role, transactions_access, budgets_access, goals_access,
    display_name, email
  ) values (
    new.id, new.owner_id, 'owner', 'edit', 'edit', 'edit',
    coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() ->> 'email'),
    auth.jwt() ->> 'email'
  );
  return new;
end;
$$;

drop trigger if exists groups_add_owner on public.groups;
create trigger groups_add_owner
  after insert on public.groups
  for each row execute function public.add_group_owner();

create or replace function public.accept_group_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_invite public.group_invites%rowtype;
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or current_email = '' then
    raise exception 'authentication required';
  end if;

  select * into selected_invite
  from public.group_invites
  where id = p_invite_id
  for update;

  if not found or selected_invite.status <> 'pending' then
    raise exception 'invite not available';
  end if;
  if selected_invite.expires_at <= now() then
    update public.group_invites set status = 'expired' where id = p_invite_id;
    raise exception 'invite expired';
  end if;
  if lower(selected_invite.email) <> current_email then
    raise exception 'invite belongs to another account';
  end if;

  insert into public.group_members (
    group_id, user_id, role, transactions_access, budgets_access, goals_access,
    display_name, email
  ) values (
    selected_invite.group_id, auth.uid(), selected_invite.role,
    selected_invite.transactions_access, selected_invite.budgets_access,
    selected_invite.goals_access,
    coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() ->> 'email'),
    auth.jwt() ->> 'email'
  ) on conflict (group_id, user_id) do nothing;

  update public.group_invites
  set status = 'accepted', accepted_at = now()
  where id = p_invite_id;
  return selected_invite.group_id;
end;
$$;

grant execute on function public.accept_group_invite(uuid) to authenticated;

alter table public.goals
  add column if not exists group_id uuid references public.groups(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id) on delete set null;
update public.goals set created_by = user_id where created_by is null;

alter table public.goal_contributions
  add column if not exists contributor_id uuid references auth.users(id) on delete set null,
  add column if not exists group_id uuid references public.groups(id) on delete cascade;
update public.goal_contributions set contributor_id = user_id where contributor_id is null;
update public.goal_contributions contribution
set group_id = goal.group_id
from public.goals goal
where goal.id = contribution.goal_id and goal.group_id is not null;

create index if not exists goals_group_status_idx
  on public.goals (group_id, status, priority) where group_id is not null;
create index if not exists goal_contributions_contributor_idx
  on public.goal_contributions (contributor_id, occurred_at desc);

-- Le policy storiche basate soltanto su user_id renderebbero ancora visibile
-- un dato condiviso al suo creatore dopo la rimozione dal gruppo.
drop policy if exists "goals_own_rows" on public.goals;
create policy "goals_personal_own_rows" on public.goals
  for all using (auth.uid() = user_id and group_id is null)
  with check (auth.uid() = user_id and group_id is null);

drop policy if exists "goal_contributions_own_rows" on public.goal_contributions;
create policy "goal_contributions_personal_own_rows" on public.goal_contributions
  for all using (
    auth.uid() = user_id
    and group_id is null
  ) with check (
    auth.uid() = user_id
    and group_id is null
  );

create or replace function public.validate_shared_goal_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.group_id is not null
      and not public.has_group_access(old.group_id, 'goals', 'edit') then
      raise exception 'shared goal access denied';
    end if;
    return old;
  end if;
  if new.group_id is null then return new; end if;
  if not public.has_group_access(new.group_id, 'goals', 'edit') then
    raise exception 'shared goal access denied';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists goals_validate_shared_scope on public.goals;
create trigger goals_validate_shared_scope
  before insert or update or delete on public.goals
  for each row execute function public.validate_shared_goal_scope();

create or replace function public.validate_goal_contribution_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  selected_group_id uuid;
begin
  if new.goal_id is null then
    new.group_id := null;
    return new;
  end if;
  select group_id into selected_group_id from public.goals where id = new.goal_id;
  new.group_id := selected_group_id;
  if selected_group_id is not null then
    if not public.has_group_access(selected_group_id, 'goals', 'edit') then
      raise exception 'shared goal contribution access denied';
    end if;
    new.contributor_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists goal_contributions_validate_shared_scope
  on public.goal_contributions;
create trigger goal_contributions_validate_shared_scope
  before insert or update of goal_id on public.goal_contributions
  for each row execute function public.validate_goal_contribution_scope();

create policy "goals_group_access" on public.goals
  for all using (
    group_id is not null and public.has_group_access(group_id, 'goals', 'view')
  ) with check (
    group_id is not null and public.has_group_access(group_id, 'goals', 'edit')
  );
create policy "goal_contributions_group_access" on public.goal_contributions
  for all using (
    group_id is not null and public.has_group_access(group_id, 'goals', 'view')
  ) with check (
    contributor_id = auth.uid()
    and group_id is not null
    and public.has_group_access(group_id, 'goals', 'edit')
  );

create or replace function public.add_shared_goal_contribution(
  p_goal_id uuid,
  p_amount numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_goal public.goals%rowtype;
  applied_amount numeric;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select * into selected_goal from public.goals
  where id = p_goal_id and group_id is not null and active = true
  for update;
  if not found or not public.has_group_access(selected_goal.group_id, 'goals', 'edit') then
    raise exception 'goal not available';
  end if;

  applied_amount := case when selected_goal.status = 'free_savings'
    then p_amount
    else least(p_amount, greatest(selected_goal.target_amount - selected_goal.saved_amount, 0))
  end;
  if applied_amount <= 0 then return 0; end if;

  update public.goals set
    saved_amount = saved_amount + applied_amount,
    status = case
      when status <> 'free_savings' and saved_amount + applied_amount >= target_amount
        then 'reached'
      else status
    end
  where id = p_goal_id;

  insert into public.goal_contributions
    (user_id, contributor_id, group_id, goal_id, amount, source)
  values (
    selected_goal.user_id, auth.uid(), selected_goal.group_id,
    p_goal_id, applied_amount, 'manual'
  );
  return applied_amount;
end;
$$;

grant execute on function public.add_shared_goal_contribution(uuid, numeric) to authenticated;

create or replace function public.create_shared_goal(
  p_group_id uuid,
  p_name text,
  p_target_amount numeric,
  p_deadline_label text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_goal_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_group_access(p_group_id, 'goals', 'edit') then
    raise exception 'shared goal access denied';
  end if;
  if char_length(trim(p_name)) = 0 or p_target_amount <= 0 then
    raise exception 'invalid goal';
  end if;
  insert into public.goals (
    user_id, created_by, group_id, name, target_amount, deadline_label
  ) values (
    auth.uid(), auth.uid(), p_group_id, trim(p_name), p_target_amount,
    nullif(trim(p_deadline_label), '')
  ) returning id into created_goal_id;
  return created_goal_id;
end;
$$;

grant execute on function public.create_shared_goal(uuid, text, numeric, text) to authenticated;

create table if not exists public.group_budgets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  category text not null check (char_length(trim(category)) between 1 and 80),
  monthly_limit numeric(12, 2) not null check (monthly_limit >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, category)
);

create table if not exists public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_by uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.expense_split_shares (
  expense_id uuid not null references public.shared_expenses(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  settled_amount numeric(12, 2) not null default 0
    check (settled_amount >= 0 and settled_amount <= amount),
  updated_at timestamptz not null default now(),
  primary key (expense_id, member_id)
);

alter table public.group_budgets enable row level security;
alter table public.shared_expenses enable row level security;
alter table public.expense_split_shares enable row level security;

create policy "group_budgets_read" on public.group_budgets
  for select using (public.has_group_access(group_id, 'budgets', 'view'));
create policy "group_budgets_insert" on public.group_budgets
  for insert
  with check (
    public.has_group_access(group_id, 'budgets', 'edit')
    and created_by = auth.uid()
  );
create policy "group_budgets_update" on public.group_budgets
  for update using (public.has_group_access(group_id, 'budgets', 'edit'))
  with check (public.has_group_access(group_id, 'budgets', 'edit'));
create policy "group_budgets_delete" on public.group_budgets
  for delete using (public.has_group_access(group_id, 'budgets', 'edit'));

create policy "shared_expenses_read" on public.shared_expenses
  for select using (public.has_group_access(group_id, 'transactions', 'view'));
create policy "shared_expenses_insert" on public.shared_expenses
  for insert
  with check (
    public.has_group_access(group_id, 'transactions', 'edit')
    and paid_by = auth.uid()
  );
create policy "shared_expenses_update" on public.shared_expenses
  for update using (public.has_group_access(group_id, 'transactions', 'edit'))
  with check (
    public.has_group_access(group_id, 'transactions', 'edit')
    and public.is_group_member(group_id, paid_by)
  );
create policy "shared_expenses_delete" on public.shared_expenses
  for delete using (public.has_group_access(group_id, 'transactions', 'edit'));

create policy "expense_split_shares_read" on public.expense_split_shares
  for select using (
    exists (
      select 1 from public.shared_expenses expense
      where expense.id = expense_id
        and public.has_group_access(expense.group_id, 'transactions', 'view')
    )
  );
create policy "expense_split_shares_write" on public.expense_split_shares
  for all using (
    exists (
      select 1 from public.shared_expenses expense
      where expense.id = expense_id
        and public.has_group_access(expense.group_id, 'transactions', 'edit')
    )
  ) with check (
    exists (
      select 1 from public.shared_expenses expense
      where expense.id = expense_id
        and public.has_group_access(expense.group_id, 'transactions', 'edit')
    )
  );

create or replace function public.save_group_budget(
  p_group_id uuid,
  p_category text,
  p_monthly_limit numeric
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_budget_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_group_access(p_group_id, 'budgets', 'edit') then
    raise exception 'group budget access denied';
  end if;
  if char_length(trim(p_category)) = 0 or p_monthly_limit < 0 then
    raise exception 'invalid budget';
  end if;
  insert into public.group_budgets (
    group_id, category, monthly_limit, created_by
  ) values (
    p_group_id, trim(p_category), p_monthly_limit, auth.uid()
  ) on conflict (group_id, category) do update set
    monthly_limit = excluded.monthly_limit,
    updated_at = now()
  returning id into saved_budget_id;
  return saved_budget_id;
end;
$$;

create or replace function public.create_shared_expense(
  p_group_id uuid,
  p_description text,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_shares jsonb,
  p_transaction_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_expense_id uuid;
  share jsonb;
  shares_total numeric;
  share_member_id uuid;
  share_amount numeric;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.has_group_access(p_group_id, 'transactions', 'edit') then
    raise exception 'shared expense access denied';
  end if;
  if p_amount <= 0 or char_length(trim(p_description)) = 0
    or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'invalid shared expense';
  end if;
  select coalesce(sum((item ->> 'amount')::numeric), 0)
    into shares_total
  from jsonb_array_elements(p_shares) item;
  if abs(shares_total - p_amount) > 0.01 then
    raise exception 'split shares must match expense amount';
  end if;

  insert into public.shared_expenses (
    group_id, transaction_id, description, amount, paid_by, occurred_at
  ) values (
    p_group_id, p_transaction_id, trim(p_description), p_amount, auth.uid(),
    coalesce(p_occurred_at, now())
  ) returning id into created_expense_id;

  for share in select * from jsonb_array_elements(p_shares)
  loop
    share_member_id := (share ->> 'memberId')::uuid;
    share_amount := (share ->> 'amount')::numeric;
    if share_amount < 0 or not public.is_group_member(p_group_id, share_member_id) then
      raise exception 'invalid split member';
    end if;
    insert into public.expense_split_shares (expense_id, member_id, amount)
    values (created_expense_id, share_member_id, share_amount);
  end loop;
  return created_expense_id;
end;
$$;

grant execute on function public.save_group_budget(uuid, text, numeric) to authenticated;
grant execute on function public.create_shared_expense(uuid, text, numeric, timestamptz, jsonb, uuid)
  to authenticated;

create index if not exists group_budgets_group_idx on public.group_budgets (group_id);
create index if not exists shared_expenses_group_date_idx
  on public.shared_expenses (group_id, occurred_at desc);

create or replace function public.group_member_balances(p_group_id uuid)
returns table (user_id uuid, balance numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with paid as (
    select expense.paid_by as user_id,
      sum(expense.amount - coalesce(settlement.amount, 0)) as amount
    from public.shared_expenses expense
    left join (
      select expense_id, sum(settled_amount) as amount
      from public.expense_split_shares
      group by expense_id
    ) settlement on settlement.expense_id = expense.id
    where expense.group_id = p_group_id
    group by expense.paid_by
  ), owed as (
    select share.member_id as user_id,
      sum(share.amount - share.settled_amount) as amount
    from public.expense_split_shares share
    join public.shared_expenses expense on expense.id = share.expense_id
    where expense.group_id = p_group_id
    group by share.member_id
  )
  select member.user_id,
    coalesce(paid.amount, 0) - coalesce(owed.amount, 0) as balance
  from public.group_members member
  left join paid on paid.user_id = member.user_id
  left join owed on owed.user_id = member.user_id
  where member.group_id = p_group_id
    and public.has_group_access(p_group_id, 'transactions', 'view');
$$;

grant execute on function public.group_member_balances(uuid) to authenticated;
