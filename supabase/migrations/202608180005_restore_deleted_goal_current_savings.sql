-- Ripristina la quota del ciclo corrente per gli obiettivi eliminati,
-- preservando gli accantonamenti appartenenti ai cicli finanziari chiusi.

with cycle_boundaries as (
  select
    profile.id as user_id,
    (
      case
        when extract(day from (now() at time zone 'Europe/Rome')::date) <
          least(28, greatest(1, profile.budget_cycle_start_day))
          then (
            date_trunc('month', (now() at time zone 'Europe/Rome')::date) -
            interval '1 month'
          )::date
        else date_trunc(
          'month',
          (now() at time zone 'Europe/Rome')::date
        )::date
      end + (least(28, greatest(1, profile.budget_cycle_start_day)) - 1)
    ) as cycle_start
  from public.profiles as profile
)
delete from public.goal_contributions as contribution
using public.goals as goal, cycle_boundaries as boundary
where contribution.goal_id = goal.id
  and goal.user_id = boundary.user_id
  and goal.deleted_at is not null
  and contribution.occurred_at >= boundary.cycle_start::timestamptz
  and contribution.occurred_at <
    (boundary.cycle_start + interval '1 month')::timestamptz;

create or replace function public.delete_goal(p_goal_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_id uuid;
  cycle_start_day integer;
  cycle_today date := (now() at time zone 'Europe/Rome')::date;
  cycle_start date;
  cycle_end date;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select least(28, greatest(1, budget_cycle_start_day))
  into cycle_start_day
  from public.profiles
  where id = auth.uid();
  cycle_start_day := coalesce(cycle_start_day, 1);
  cycle_start :=
    case
      when extract(day from cycle_today) < cycle_start_day
        then (date_trunc('month', cycle_today) - interval '1 month')::date
      else date_trunc('month', cycle_today)::date
    end + (cycle_start_day - 1);
  cycle_end := (cycle_start + interval '1 month')::date;

  delete from public.goal_contributions
  where goal_id = p_goal_id
    and user_id = auth.uid()
    and occurred_at >= cycle_start::timestamptz
    and occurred_at < cycle_end::timestamptz;

  update public.goals
  set active = false,
      deleted_at = now()
  where id = p_goal_id
    and user_id = auth.uid()
    and active = true
  returning id into deleted_id;

  if deleted_id is null then
    return false;
  end if;

  with ranked as (
    select
      id,
      (row_number() over (order by priority, created_at) - 1)::integer as next_priority
    from public.goals
    where user_id = auth.uid() and active = true
  )
  update public.goals as goal
  set priority = ranked.next_priority
  from ranked
  where goal.id = ranked.id;

  return true;
end;
$$;

revoke all on function public.delete_goal(uuid) from public, anon;
grant execute on function public.delete_goal(uuid) to authenticated;
