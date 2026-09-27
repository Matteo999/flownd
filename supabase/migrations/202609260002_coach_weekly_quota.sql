-- Quota settimanale del Coach (piano free: 1 richiesta a settimana).
-- La settimana parte dal lunedì, fuso Europe/Rome.

alter table public.coach_usage
  add column if not exists week_start date not null
    default date_trunc('week', now() at time zone 'Europe/Rome')::date,
  add column if not exists week_count integer not null default 0
    check (week_count >= 0);

drop function if exists public.consume_coach_quota(uuid, integer, integer);

create or replace function public.consume_coach_quota(
  p_user_id uuid,
  p_daily_limit integer,
  p_minute_limit integer,
  p_weekly_limit integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/Rome')::date;
  this_week date := date_trunc('week', now() at time zone 'Europe/Rome')::date;
  quota_row public.coach_usage;
begin
  insert into public.coach_usage (user_id, day, day_count, minute_start, minute_count, week_start, week_count)
  values (p_user_id, today, 0, now(), 0, this_week, 0)
  on conflict (user_id) do nothing;

  select * into quota_row from public.coach_usage where user_id = p_user_id for update;

  if quota_row.day <> today then
    quota_row.day := today;
    quota_row.day_count := 0;
  end if;
  if quota_row.week_start <> this_week then
    quota_row.week_start := this_week;
    quota_row.week_count := 0;
  end if;
  if quota_row.minute_start <= now() - interval '1 minute' then
    quota_row.minute_start := now();
    quota_row.minute_count := 0;
  end if;

  if p_weekly_limit is not null and quota_row.week_count >= p_weekly_limit then
    return jsonb_build_object('allowed', false, 'reason', 'weekly', 'remaining', 0,
      'resets_on', (this_week + 7)::text);
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
    week_start = quota_row.week_start,
    week_count = quota_row.week_count + 1,
    minute_start = quota_row.minute_start,
    minute_count = quota_row.minute_count + 1,
    updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object('allowed', true, 'reason', null,
    'remaining', p_daily_limit - quota_row.day_count - 1);
end;
$$;

revoke all on function public.consume_coach_quota(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_coach_quota(uuid, integer, integer, integer)
  to service_role;
