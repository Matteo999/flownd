-- Lista d'attesa pubblica della landing: chi lascia l'email riceve un link di
-- conferma (doppio opt-in) e, una volta confermato, l'avviso al lancio negli
-- store. La tabella è accessibile solo dal backend tramite service role.

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(email) and char_length(email) between 3 and 254),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'unsubscribed')),
  -- Solo l'hash SHA-256 del token inviato via email, mai il token in chiaro.
  token_hash text unique,
  token_expires_at timestamptz,
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  -- Hash dell'IP con sale lato server, usato solo per il limite di tentativi.
  ip_hash text,
  source text not null default 'landing',
  consent_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists waitlist_signups_ip_sent_idx
  on public.waitlist_signups (ip_hash, confirmation_sent_at desc);

alter table public.waitlist_signups enable row level security;

-- Nessuna policy: anon e authenticated non leggono né scrivono la lista.
revoke all on public.waitlist_signups from anon, authenticated;
