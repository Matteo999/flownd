-- Consente di eliminare anche gli obiettivi completati. Solo gli
-- accantonamenti del ciclo finanziario corrente vengono resi nuovamente
-- disponibili; lo storico dei cicli chiusi resta invariato.

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

  select goal.id
  into deleted_id
  from public.goals as goal
  where goal.id = p_goal_id
    and goal.user_id = auth.uid()
    and goal.deleted_at is null
    and (goal.active = true or goal.status = 'completed')
  for update;

  if deleted_id is null then
    return false;
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
  where goal_id = deleted_id
    and user_id = auth.uid()
    and occurred_at >= (cycle_start::timestamp at time zone 'Europe/Rome')
    and occurred_at < (cycle_end::timestamp at time zone 'Europe/Rome');

  update public.goals
  set active = false,
      deleted_at = now()
  where id = deleted_id;

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
