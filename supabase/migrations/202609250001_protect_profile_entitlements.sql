-- I client possono aggiornare il proprio profilo (preferenze, budget, FAB),
-- ma il piano e lo stato della detection ricorrenze sono gestiti solo dal
-- backend (service role) o da funzioni security definer.

create or replace function public.protect_profile_entitlements()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.plan_tier := 'free';
    return new;
  end if;

  if new.plan_tier is distinct from old.plan_tier
    or new.recurring_detection_version is distinct from old.recurring_detection_version
    or new.recurring_detection_status is distinct from old.recurring_detection_status
    or new.recurring_detection_started_at is distinct from old.recurring_detection_started_at
    or new.recurring_detection_completed_at is distinct from old.recurring_detection_completed_at
    or new.recurring_detection_next_scan_at is distinct from old.recurring_detection_next_scan_at
  then
    raise exception 'Campo del profilo non modificabile dal client'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_entitlements on public.profiles;
create trigger profiles_protect_entitlements
  before insert or update on public.profiles
  for each row execute function public.protect_profile_entitlements();
