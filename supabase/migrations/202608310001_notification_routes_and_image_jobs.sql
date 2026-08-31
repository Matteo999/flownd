-- Collega le notifiche di risparmio al dettaglio del Risparmio libero e
-- consente alle scansioni immagine di usare la stessa coda persistente degli import.

alter table public.transaction_import_jobs
  drop constraint if exists transaction_import_jobs_file_extension_check;

alter table public.transaction_import_jobs
  add constraint transaction_import_jobs_file_extension_check
  check (file_extension in ('csv', 'xlsx', 'pdf', 'jpg', 'jpeg', 'png', 'webp'));

create or replace function public.route_flownd_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  free_savings_id uuid;
begin
  if new.action_route is not null then return new; end if;

  if new.title in ('Avanzo accantonato', 'Risparmi accantonati') then
    select id into free_savings_id
    from public.goals
    where user_id = new.user_id
      and status = 'free_savings'
      and deleted_at is null
    order by created_at
    limit 1;

    if free_savings_id is not null then
      new.action_route := '/goal-detail?goalId=' || free_savings_id::text;
    else
      new.action_route := '/budget-allocation';
    end if;
  elsif new.title = 'Ciclo mensile concluso' then
    new.action_route := '/budget-allocation';
  end if;

  return new;
end;
$$;

drop trigger if exists route_flownd_notification_before_insert
  on public.goal_notifications;
create trigger route_flownd_notification_before_insert
  before insert on public.goal_notifications
  for each row execute function public.route_flownd_notification();

update public.goal_notifications as notification
set action_route = '/goal-detail?goalId=' || goal.id::text
from public.goals as goal
where notification.action_route is null
  and notification.title in ('Avanzo accantonato', 'Risparmi accantonati')
  and goal.user_id = notification.user_id
  and goal.status = 'free_savings'
  and goal.deleted_at is null;

update public.goal_notifications
set action_route = '/budget-allocation'
where action_route is null
  and title = 'Ciclo mensile concluso';
