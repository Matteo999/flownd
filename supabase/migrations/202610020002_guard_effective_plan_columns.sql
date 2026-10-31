-- plan_tier, plan_source e plan_shared_by sono il piano EFFETTIVO, calcolato da
-- refresh_effective_plan a partire da billing_plan_tier. Una modifica manuale
-- (Table Editor, SQL, service role) veniva sovrascritta al ricalcolo successivo:
-- ora è rifiutata per qualsiasi ruolo. Il piano si cambia su billing_plan_tier.

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
  -- Unico punto autorizzato a scrivere il piano effettivo (vedi guard_effective_plan).
  perform set_config('flownd.effective_plan_refresh', 'on', true);
  update public.profiles
  set plan_tier = effective.tier,
      plan_source = next_source,
      plan_shared_by = effective.shared_by,
      updated_at = now()
  where id = p_user_id
    and (plan_tier, plan_source, plan_shared_by)
      is distinct from (effective.tier, next_source, effective.shared_by);
  perform set_config('flownd.effective_plan_refresh', '', true);
end;
$$;

revoke all on function public.refresh_effective_plan(uuid) from public, anon, authenticated;

create or replace function public.guard_effective_plan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Un profilo nuovo non è in nessun gruppo: il piano effettivo è quello acquistato.
    new.plan_tier := new.billing_plan_tier;
    new.plan_source := 'own';
    new.plan_shared_by := null;
    return new;
  end if;

  if coalesce(current_setting('flownd.effective_plan_refresh', true), '') = 'on' then
    return new;
  end if;

  if new.plan_tier is distinct from old.plan_tier
    or new.plan_source is distinct from old.plan_source
    or new.plan_shared_by is distinct from old.plan_shared_by
  then
    raise exception 'plan_tier è calcolato: modifica billing_plan_tier'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_effective_plan on public.profiles;
create trigger profiles_guard_effective_plan
  before insert or update on public.profiles
  for each row execute function public.guard_effective_plan();
