-- Distingue entrate e uscite mantenendo gli importi positivi e confrontabili.

alter table public.transactions
  add column if not exists kind text not null default 'expense'
  check (kind in ('expense', 'income'));

create index if not exists transactions_user_occurred_kind_idx
  on public.transactions (user_id, occurred_at desc, kind);
