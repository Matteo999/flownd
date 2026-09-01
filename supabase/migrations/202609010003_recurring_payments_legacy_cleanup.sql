-- Nelle versioni precedenti il comando "Elimina" impostava dismissed e
-- nascondeva soltanto la serie. Ora l'eliminazione e fisica. Le firme delle
-- serie rilevate restano in una tombstone separata per non ricrearle al
-- successivo avvio del detector.

create table if not exists public.recurring_payment_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  detection_signature text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, detection_signature)
);

alter table public.recurring_payment_dismissals enable row level security;
create policy "recurring_payment_dismissals_own_rows"
on public.recurring_payment_dismissals
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.remember_deleted_recurring_signature()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.detection_signature is not null then
    insert into public.recurring_payment_dismissals (user_id, detection_signature)
    values (old.user_id, old.detection_signature)
    on conflict (user_id, detection_signature) do nothing;
  end if;
  return old;
end;
$$;

drop trigger if exists recurring_payments_remember_deleted_signature
on public.recurring_payments;
create trigger recurring_payments_remember_deleted_signature
before delete on public.recurring_payments
for each row execute function public.remember_deleted_recurring_signature();

insert into public.recurring_payment_dismissals (user_id, detection_signature)
select user_id, detection_signature
from public.recurring_payments
where status = 'dismissed' and detection_signature is not null
on conflict (user_id, detection_signature) do nothing;

delete from public.recurring_payments where status = 'dismissed';

revoke all on function public.remember_deleted_recurring_signature() from public, anon, authenticated;
