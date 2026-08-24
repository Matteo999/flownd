alter table public.goal_notifications
  add column if not exists action_route text;

create table if not exists public.transaction_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_extension text not null check (file_extension in ('csv', 'xlsx', 'pdf')),
  file_base64 text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  provider text,
  model text,
  result jsonb,
  report_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table public.transaction_import_jobs enable row level security;

create policy "transaction_import_jobs_own_read"
  on public.transaction_import_jobs
  for select
  using (auth.uid() = user_id);

create index if not exists transaction_import_jobs_user_created_idx
  on public.transaction_import_jobs (user_id, created_at desc);

comment on column public.transaction_import_jobs.file_base64 is
  'Temporary file payload cleared immediately after processing.';
