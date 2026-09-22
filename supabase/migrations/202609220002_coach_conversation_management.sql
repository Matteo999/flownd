-- Gestione dello storico Coach: conversazioni fissate e rinominabili.

alter table public.coach_conversations
  add column if not exists is_pinned boolean not null default false;

drop index if exists public.coach_conversations_user_updated_idx;
create index coach_conversations_user_updated_idx
  on public.coach_conversations (user_id, is_pinned desc, updated_at desc, id desc);

create or replace function public.prune_coach_conversations()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  delete from public.coach_conversations conversation
  where conversation.id in (
    select older.id
    from public.coach_conversations older
    where older.user_id = new.user_id
    order by older.is_pinned desc, older.updated_at desc, older.id desc
    offset 10
  );
  return new;
end;
$$;
