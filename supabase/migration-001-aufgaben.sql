-- =============================================================================
-- Migration 001 — Aufgaben-Bestätigungen & Einstellungen
-- =============================================================================
-- Für Datenbanken, die bereits mit schema.sql (v1) eingerichtet wurden.
-- Einmalig im Supabase SQL-Editor ausführen (idempotent formuliert).
-- Neuinstallationen brauchen diese Datei nicht — schema.sql enthält alles.
--
-- Inhalt:
--   1. congregations.settings (JSONB) — Erinnerungen + Versammlungssprache
--   2. Tabelle confirmations — Bestätigungs-Status je Zuteilung und Mitglied
--   3. notifications: Typ 'verhindert' erlauben; Verhinderungs-Meldungen
--      dürfen auch Nicht-Planer erzeugen
-- =============================================================================

-- 1. Versammlungsweite Einstellungen ({ reminders, congLang })
alter table public.congregations
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- 2. Aufgaben-Bestätigungen: task_key = stabiler Slot-Pfad einer Zuteilung
--    (siehe partTaskKey/helperTaskKey in src/data/planning.ts). Jedes Mitglied
--    schreibt seinen eigenen Status; „offen“ = keine Zeile vorhanden.
create table if not exists public.confirmations (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  task_key        text not null,                    -- "0|mid|part|2|1|0" / "1|we|helper|mik|0"
  status          text not null check (status in ('bestätigt', 'verhindert')),
  created_at      timestamptz not null default now(),
  unique (congregation_id, task_key, user_id)
);

alter table public.confirmations enable row level security;

drop policy if exists confirmations_select on public.confirmations;
create policy confirmations_select on public.confirmations
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists confirmations_write on public.confirmations;
create policy confirmations_write on public.confirmations
  for all
  using (congregation_id = public.my_congregation_id() and user_id = auth.uid())
  with check (congregation_id = public.my_congregation_id() and user_id = auth.uid());

-- 3. Mitteilungen: Typ 'verhindert' zulassen …
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('zuteilung', 'erinnerung', 'gesendet', 'import', 'verhindert'));

-- … und Verhinderungs-Meldungen auch von Nicht-Planern erlauben.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert with check (
    congregation_id = public.my_congregation_id()
    and (public.is_planner() or type = 'verhindert')
  );

-- =============================================================================
-- Optional: eigenes Konto mit einer Person verknüpfen, damit „Meine Aufgaben“
-- die eigenen Zuteilungen zeigt (Werte anpassen). Beispiel für den
-- Demo-Datensatz (Simon Krüger):
--
--   update public.members m
--   set person_id = p.id
--   from public.persons p, auth.users u
--   where u.email = 'DEINE-EMAIL'
--     and m.user_id = u.id
--     and p.congregation_id = m.congregation_id
--     and p.fn = 'Simon' and p.ln = 'Krüger';
-- =============================================================================
