-- =============================================================================
-- Migration 005: Web-Push-Abos (Erinnerungen als Browser-Benachrichtigung)
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent). Jedes Gerät, auf dem ein
-- Mitglied Benachrichtigungen aktiviert, legt hier sein Push-Abo ab; die Edge
-- Function send-reminders verschickt darüber (Service-Role liest alle Zeilen,
-- Clients nur die eigenen).

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  endpoint        text not null unique,              -- Push-Service-URL des Geräts
  p256dh          text not null,                     -- Verschlüsselungs-Schlüssel des Abos
  auth            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists push_subscriptions_congregation_idx
  on public.push_subscriptions (congregation_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and congregation_id = public.my_congregation_id());
