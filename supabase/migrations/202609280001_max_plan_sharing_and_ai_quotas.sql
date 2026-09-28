-- Piano Max condiviso e quote AI per piano.
--
-- billing_plan_tier: piano acquistato dall'utente (da aggiornare dal sistema di
--   pagamento o a mano). È l'unica colonna di piano da modificare.
-- plan_tier: piano EFFETTIVO, calcolato dai trigger. Resta la colonna letta da
--   API e funzioni SQL esistenti, che quindi trattano come Pro anche i membri
--   che ricevono il piano da un Max.
-- Un utente Max sceglie un proprio gruppo (shared_plan_group_id): i primi 2
-- membri senza piano a pagamento, per data di ingresso, ottengono Pro.

alter table public.profiles
  add column if not exists billing_plan_tier text not null default 'free'
    check (billing_plan_tier in ('free', 'pro', 'max')),
  add column if not exists shared_plan_group_id uuid
    references public.groups(id) on delete set null,
  add column if not exists plan_source text not null default 'own'
    check (plan_source in ('own', 'shared')),
  -- Non è una foreign key: deve sopravvivere alla cancellazione del proprietario
  -- per poter ricalcolare i beneficiari (vedi trigger su delete).
  add column if not exists plan_shared_by uuid;

update public.profiles set billing_plan_tier = plan_tier where billing_plan_tier <> plan_tier;

create index if not exists profiles_plan_shared_by_idx
  on public.profiles (plan_shared_by) where plan_shared_by is not null;

-- I client non possono modificare nessuna colonna di piano.
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
    new.billing_plan_tier := 'free';
    new.shared_plan_group_id := null;
    new.plan_source := 'own';
    new.plan_shared_by := null;
    new.recurring_detection_activity_at := null;
    return new;
  end if;

  if new.plan_tier is distinct from old.plan_tier
    or new.billing_plan_tier is distinct from old.billing_plan_tier
    or new.shared_plan_group_id is distinct from old.shared_plan_group_id
    or new.plan_source is distinct from old.plan_source
    or new.plan_shared_by is distinct from old.plan_shared_by
    or new.recurring_detection_version is distinct from old.recurring_detection_version
    or new.recurring_detection_status is distinct from old.recurring_detection_status
    or new.recurring_detection_started_at is distinct from old.recurring_detection_started_at
    or new.recurring_detection_completed_at is distinct from old.recurring_detection_completed_at
    or new.recurring_detection_next_scan_at is distinct from old.recurring_detection_next_scan_at
    or new.recurring_detection_activity_at is distinct from old.recurring_detection_activity_at
  then
    raise exception 'Campo del profilo non modificabile dal client'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Piano effettivo: quello acquistato, oppure Pro se l'utente occupa uno dei 2
-- posti del gruppo condiviso da un Max.
create or replace function public.compute_effective_plan(
  p_user_id uuid,
  out tier text,
  out shared_by uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  billing text;
begin
  select billing_plan_tier into billing from public.profiles where id = p_user_id;
  if billing in ('pro', 'max') then
    tier := billing;
    shared_by := null;
    return;
  end if;

  select sharing_group.owner_id into shared_by
  from public.groups as sharing_group
  join public.profiles as owner_profile on owner_profile.id = sharing_group.owner_id
  where owner_profile.billing_plan_tier = 'max'
    and owner_profile.shared_plan_group_id = sharing_group.id
    and p_user_id in (
      select member.user_id
      from public.group_members as member
      join public.profiles as member_profile on member_profile.id = member.user_id
      where member.group_id = sharing_group.id
        and member.user_id <> sharing_group.owner_id
        and member_profile.billing_plan_tier = 'free'
      order by member.joined_at, member.user_id
      limit 2
    )
  order by sharing_group.created_at
  limit 1;

  tier := case when shared_by is null then 'free' else 'pro' end;
end;
$$;

create or replace function public.refresh_effective_plan(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  effective record;
  next_source text;
begin
  if p_user_id is null then return; end if;
  select * into effective from public.compute_effective_plan(p_user_id);
  next_source := case when effective.shared_by is null then 'own' else 'shared' end;
  update public.profiles
  set plan_tier = effective.tier,
      plan_source = next_source,
      plan_shared_by = effective.shared_by,
      updated_at = now()
  where id = p_user_id
    and (plan_tier, plan_source, plan_shared_by)
      is distinct from (effective.tier, next_source, effective.shared_by);
end;
$$;

-- Ricalcola chi riceve (o riceveva) il piano di un proprietario Max e i membri
-- del suo gruppo condiviso.
create or replace function public.refresh_plan_sharing_for_owner(p_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid;
begin
  for affected in
    select id from public.profiles where plan_shared_by = p_owner_id
    union
    select member.user_id
    from public.profiles as owner_profile
    join public.group_members as member on member.group_id = owner_profile.shared_plan_group_id
    where owner_profile.id = p_owner_id
  loop
    perform public.refresh_effective_plan(affected);
  end loop;
end;
$$;

create or replace function public.refresh_plan_sharing_for_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid;
begin
  for affected in
    select user_id from public.group_members where group_id = p_group_id
  loop
    perform public.refresh_effective_plan(affected);
  end loop;
end;
$$;

create or replace function public.on_profile_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_group uuid;
begin
  perform public.refresh_effective_plan(new.id);
  perform public.refresh_plan_sharing_for_owner(new.id);
  -- Il piano acquistato da un membro libera o occupa un posto nei gruppi condivisi.
  if new.billing_plan_tier is distinct from old.billing_plan_tier then
    for member_group in
      select group_id from public.group_members where user_id = new.id
    loop
      perform public.refresh_plan_sharing_for_group(member_group);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_plan_change on public.profiles;
create trigger profiles_plan_change
  after update of billing_plan_tier, shared_plan_group_id on public.profiles
  for each row execute function public.on_profile_plan_change();

create or replace function public.on_profile_deleted_plan_sharing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid;
begin
  for affected in select id from public.profiles where plan_shared_by = old.id loop
    perform public.refresh_effective_plan(affected);
  end loop;
  return null;
end;
$$;

drop trigger if exists profiles_deleted_plan_sharing on public.profiles;
create trigger profiles_deleted_plan_sharing
  after delete on public.profiles
  for each row execute function public.on_profile_deleted_plan_sharing();

create or replace function public.on_group_membership_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_effective_plan(old.user_id);
    perform public.refresh_plan_sharing_for_group(old.group_id);
  else
    perform public.refresh_plan_sharing_for_group(new.group_id);
  end if;
  return null;
end;
$$;

drop trigger if exists group_members_plan_change on public.group_members;
create trigger group_members_plan_change
  after insert or delete on public.group_members
  for each row execute function public.on_group_membership_plan_change();

create or replace function public.on_group_owner_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Il vecchio proprietario non condivide più un gruppo che non possiede.
  update public.profiles
  set shared_plan_group_id = null
  where id = old.owner_id and shared_plan_group_id = old.id;
  perform public.refresh_plan_sharing_for_owner(old.owner_id);
  perform public.refresh_plan_sharing_for_group(new.id);
  return null;
end;
$$;

drop trigger if exists groups_owner_plan_change on public.groups;
create trigger groups_owner_plan_change
  after update of owner_id on public.groups
  for each row execute function public.on_group_owner_plan_change();

-- Scelta del gruppo con cui condividere il piano Max (null = nessuno).
create or replace function public.set_plan_sharing_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and billing_plan_tier = 'max'
  ) then
    raise exception 'Max plan required' using errcode = '42501';
  end if;
  if p_group_id is not null and not exists (
    select 1 from public.groups where id = p_group_id and owner_id = current_user_id
  ) then
    raise exception 'group not owned' using errcode = '42501';
  end if;
  update public.profiles set shared_plan_group_id = p_group_id, updated_at = now()
  where id = current_user_id;
  return true;
end;
$$;

revoke all on function public.set_plan_sharing_group(uuid) from public, anon;
grant execute on function public.set_plan_sharing_group(uuid) to authenticated;

revoke all on function public.compute_effective_plan(uuid) from public, anon, authenticated;
revoke all on function public.refresh_effective_plan(uuid) from public, anon, authenticated;
revoke all on function public.refresh_plan_sharing_for_owner(uuid) from public, anon, authenticated;
revoke all on function public.refresh_plan_sharing_for_group(uuid) from public, anon, authenticated;

-- Quote AI per funzione. Il "pool" è l'utente stesso, oppure il proprietario Max
-- per chi usa il piano condiviso: le quote mensili Max sono comuni al gruppo.
-- I limiti al minuto e giornalieri restano per singolo utente (anti-abuso).

create table if not exists public.ai_usage (
  subject_id uuid not null,
  feature text not null check (feature in ('coach', 'scan', 'import')),
  day date not null default (now() at time zone 'Europe/Rome')::date,
  day_count integer not null default 0,
  minute_start timestamptz not null default now(),
  minute_count integer not null default 0,
  week_start date not null default date_trunc('week', now() at time zone 'Europe/Rome')::date,
  week_count integer not null default 0,
  month_start date not null default date_trunc('month', now() at time zone 'Europe/Rome')::date,
  month_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (subject_id, feature)
);

alter table public.ai_usage enable row level security;
-- Nessuna policy: solo il backend (service role) legge e scrive.

create or replace function public.ai_quota_pool(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pool_id', case when plan_source = 'shared' and plan_shared_by is not null
      then plan_shared_by else id end,
    'tier', case
      when plan_source = 'shared' and plan_shared_by is not null then 'max'
      else plan_tier end
  )
  from public.profiles
  where id = p_user_id;
$$;

create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_pool_id uuid,
  p_feature text,
  p_user_daily integer default null,
  p_user_minute integer default null,
  p_pool_weekly integer default null,
  p_pool_monthly integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Europe/Rome')::date;
  this_week date := date_trunc('week', now() at time zone 'Europe/Rome')::date;
  this_month date := date_trunc('month', now() at time zone 'Europe/Rome')::date;
  user_row public.ai_usage;
  pool_row public.ai_usage;
begin
  insert into public.ai_usage (subject_id, feature)
  values (p_user_id, p_feature), (p_pool_id, p_feature)
  on conflict (subject_id, feature) do nothing;

  -- Normalizza le finestre scadute (lock in ordine stabile per evitare deadlock).
  update public.ai_usage set
    day_count = case when day <> today then 0 else day_count end,
    day = today,
    minute_count = case when minute_start <= now() - interval '1 minute' then 0 else minute_count end,
    minute_start = case when minute_start <= now() - interval '1 minute' then now() else minute_start end,
    week_count = case when week_start <> this_week then 0 else week_count end,
    week_start = this_week,
    month_count = case when month_start <> this_month then 0 else month_count end,
    month_start = this_month
  where feature = p_feature and subject_id in (p_user_id, p_pool_id);

  select * into user_row from public.ai_usage
  where subject_id = p_user_id and feature = p_feature for update;
  select * into pool_row from public.ai_usage
  where subject_id = p_pool_id and feature = p_feature for update;

  if p_pool_monthly is not null and pool_row.month_count >= p_pool_monthly then
    return jsonb_build_object('allowed', false, 'reason', 'monthly',
      'resets_on', (this_month + interval '1 month')::date::text);
  end if;
  if p_pool_weekly is not null and pool_row.week_count >= p_pool_weekly then
    return jsonb_build_object('allowed', false, 'reason', 'weekly',
      'resets_on', (this_week + 7)::text);
  end if;
  if p_user_daily is not null and user_row.day_count >= p_user_daily then
    return jsonb_build_object('allowed', false, 'reason', 'daily');
  end if;
  if p_user_minute is not null and user_row.minute_count >= p_user_minute then
    return jsonb_build_object('allowed', false, 'reason', 'minute');
  end if;

  update public.ai_usage set
    day_count = day_count + 1,
    minute_count = minute_count + 1,
    updated_at = now()
  where subject_id = p_user_id and feature = p_feature;
  update public.ai_usage set
    week_count = week_count + 1,
    month_count = month_count + 1,
    updated_at = now()
  where subject_id = p_pool_id and feature = p_feature;

  return jsonb_build_object(
    'allowed', true,
    'monthly_remaining', case when p_pool_monthly is null then null
      else p_pool_monthly - pool_row.month_count - 1 end
  );
end;
$$;

revoke all on function public.ai_quota_pool(uuid) from public, anon, authenticated;
grant execute on function public.ai_quota_pool(uuid) to service_role;
revoke all on function public.consume_ai_quota(uuid, uuid, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, uuid, text, integer, integer, integer, integer)
  to service_role;
