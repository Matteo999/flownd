-- Pianificazione e lock per il sync automatico Open Banking.

alter table public.open_banking_connections
  add column if not exists auto_sync_enabled boolean not null default true,
  add column if not exists next_sync_at timestamptz,
  add column if not exists sync_locked_until timestamptz,
  add column if not exists last_auto_sync_at timestamptz;

update public.open_banking_connections
set next_sync_at = coalesce(last_synced_at, now())
  + interval '6 hours'
  + make_interval(
      secs => mod(
        mod(hashtextextended(id::text, 0), 1800) + 1800,
        1800
      )::integer
    )
where next_sync_at is null;

create index if not exists open_banking_connections_auto_sync_due_idx
  on public.open_banking_connections (next_sync_at)
  where status = 'authorized' and auto_sync_enabled = true;

create or replace function public.claim_open_banking_sync_batch(
  p_limit integer default 2,
  p_lock_minutes integer default 15
)
returns table(connection_id uuid, user_id uuid)
language sql
security definer
set search_path = public
as $$
  with due as (
    select connection.id
    from public.open_banking_connections connection
    join public.profiles profile on profile.id = connection.user_id
    where connection.status = 'authorized'
      and connection.auto_sync_enabled = true
      and connection.valid_until > now()
      and coalesce(
        connection.next_sync_at,
        connection.created_at + interval '6 hours'
      ) <= now()
      and (connection.sync_locked_until is null or connection.sync_locked_until <= now())
      and profile.plan_tier in ('pro', 'max')
    order by coalesce(
      connection.next_sync_at,
      connection.created_at + interval '6 hours'
    )
    limit greatest(1, least(p_limit, 10))
    for update of connection skip locked
  )
  update public.open_banking_connections connection
  set sync_locked_until = now() + make_interval(mins => greatest(1, p_lock_minutes)),
      updated_at = now()
  from due
  where connection.id = due.id
  returning connection.id, connection.user_id;
$$;

create or replace function public.claim_open_banking_connection_sync(
  p_connection_id uuid,
  p_user_id uuid,
  p_lock_minutes integer default 15
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  update public.open_banking_connections
  set sync_locked_until = now() + make_interval(mins => greatest(1, p_lock_minutes)),
      updated_at = now()
  where id = p_connection_id
    and user_id = p_user_id
    and status = 'authorized'
    and (sync_locked_until is null or sync_locked_until <= now())
  returning id into claimed_id;
  return claimed_id is not null;
end;
$$;

revoke all on function public.claim_open_banking_sync_batch(integer, integer)
  from public;
revoke all on function public.claim_open_banking_connection_sync(uuid, uuid, integer)
  from public;
grant execute on function public.claim_open_banking_sync_batch(integer, integer)
  to service_role;
grant execute on function public.claim_open_banking_connection_sync(uuid, uuid, integer)
  to service_role;
