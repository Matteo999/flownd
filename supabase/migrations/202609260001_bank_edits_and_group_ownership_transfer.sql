-- 1) Movimenti bancari modificabili dall'utente.
--    La sync Open Banking aggiornava data, descrizione e categoria dei movimenti
--    già importati a ogni sincronizzazione (finestra di 14 giorni), annullando
--    le correzioni dell'utente. user_edited_at segna le righe corrette a mano:
--    la sync continua ad aggiornare solo stato e metadati bancari.

alter table public.transactions
  add column if not exists user_edited_at timestamptz;

comment on column public.transactions.user_edited_at is
  'Ultima modifica manuale dell''utente: la sync bancaria non sovrascrive data, descrizione, categoria e importo.';

-- 2) Cancellazione account: i gruppi passano al membro più anziano invece di
--    essere eliminati per tutti. Chiamata solo dal backend (service role).

create or replace function public.transfer_owned_groups(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  owned record;
  successor uuid;
  transferred integer := 0;
begin
  for owned in
    select id from public.groups where owner_id = p_user_id for update
  loop
    select member.user_id into successor
    from public.group_members member
    where member.group_id = owned.id
      and member.user_id <> p_user_id
    order by member.joined_at asc, member.user_id asc
    limit 1;

    -- Nessun altro membro: il gruppo verrà eliminato insieme all'account.
    if successor is null then
      continue;
    end if;

    update public.groups
    set owner_id = successor, updated_at = now()
    where id = owned.id;

    update public.group_members
    set role = 'owner',
        transactions_access = 'edit',
        budgets_access = 'edit',
        goals_access = 'edit'
    where group_id = owned.id and user_id = successor;

    transferred := transferred + 1;
  end loop;
  return transferred;
end;
$$;

revoke all on function public.transfer_owned_groups(uuid) from public, anon, authenticated;
grant execute on function public.transfer_owned_groups(uuid) to service_role;
