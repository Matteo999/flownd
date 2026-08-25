-- La creazione del gruppo deve essere atomica e non dipendere da un owner_id
-- fornito dal client. La RPC ricava sempre il proprietario dal JWT Supabase.

create or replace function public.create_family_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  current_user_id uuid := auth.uid();
  created_group_id uuid;
  current_email text := auth.jwt() ->> 'email';
  current_name text := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() ->> 'email'
  );
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'group name must contain between 1 and 80 characters';
  end if;

  insert into public.groups (name, owner_id)
  values (trim(p_name), current_user_id)
  returning id into created_group_id;

  -- Il trigger della migrazione precedente crea già questa riga. L'upsert
  -- rende la RPC sicura anche se il trigger viene temporaneamente disabilitato.
  insert into public.group_members (
    group_id,
    user_id,
    role,
    transactions_access,
    budgets_access,
    goals_access,
    display_name,
    email
  ) values (
    created_group_id,
    current_user_id,
    'owner',
    'edit',
    'edit',
    'edit',
    current_name,
    current_email
  ) on conflict (group_id, user_id) do update set
    role = 'owner',
    transactions_access = 'edit',
    budgets_access = 'edit',
    goals_access = 'edit',
    display_name = coalesce(excluded.display_name, public.group_members.display_name),
    email = coalesce(excluded.email, public.group_members.email);

  return created_group_id;
end;
$$;

revoke all on function public.create_family_group(text) from public, anon;
grant execute on function public.create_family_group(text) to authenticated;

notify pgrst, 'reload schema';
