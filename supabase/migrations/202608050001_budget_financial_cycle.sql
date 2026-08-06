alter table public.profiles
  add column if not exists budget_cycle_start_day smallint not null default 1
    check (budget_cycle_start_day between 1 and 28),
  add column if not exists budget_rollover_mode text not null default 'savings'
    check (budget_rollover_mode in ('savings', 'carry', 'reset'));
