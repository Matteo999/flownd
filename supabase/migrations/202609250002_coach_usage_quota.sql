-- Quota del Money Coach: contatore gestito solo dal backend (service role).
-- Non si usa coach_messages perché l'utente può cancellare le proprie righe.

create table if not exists public.coach_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'Europe/Rome')::date,
  day_count integer not null default 0 check (day_count >= 0),
  minute_start timestamptz not null default now(),
  minute_count integer not null default 0 check (minute_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.coach_usage enable row level security;
-- Nessuna policy: i client non leggono né scrivono questa tabella.

create or replace function public.consume_coach_quota(
  p_user_id uuid,
  p_daily_limit integer,
  p_minute_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/Rome')::date;
  quota_row public.coach_usage;
begin
  insert into public.coach_usage (user_id, day, day_count, minute_start, minute_count)
  values (p_user_id, today, 0, now(), 0)
  on conflict (user_id) do nothing;

  select * into quota_row from public.coach_usage where user_id = p_user_id for update;

  if quota_row.day <> today then
    quota_row.day := today;
    quota_row.day_count := 0;
  end if;
  if quota_row.minute_start <= now() - interval '1 minute' then
    quota_row.minute_start := now();
    quota_row.minute_count := 0;
  end if;

  if quota_row.day_count >= p_daily_limit then
    return jsonb_build_object('allowed', false, 'reason', 'daily', 'remaining', 0);
  end if;
  if quota_row.minute_count >= p_minute_limit then
    return jsonb_build_object('allowed', false, 'reason', 'minute',
      'remaining', p_daily_limit - quota_row.day_count);
  end if;

  update public.coach_usage set
    day = quota_row.day,
    day_count = quota_row.day_count + 1,
    minute_start = quota_row.minute_start,
    minute_count = quota_row.minute_count + 1,
    updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object('allowed', true, 'reason', null,
    'remaining', p_daily_limit - quota_row.day_count - 1);
end;
$$;

revoke all on function public.consume_coach_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_coach_quota(uuid, integer, integer) to service_role;
