-- =============================================================================
-- Migration 003 — Predigtdienstgruppen
-- =============================================================================
-- Für Datenbanken, die vor dieser Migration eingerichtet wurden. Einmalig im
-- Supabase SQL-Editor ausführen (idempotent formuliert). Neuinstallationen
-- brauchen diese Datei nicht — schema.sql enthält alles.
--
-- Inhalt:
--   1. Tabelle groups (Predigtdienstgruppen mit Aufseher/Gehilfe)
--   2. persons.grp — Zuordnung einer Person zu ihrer Gruppe
--   3. RLS: Versammlung liest, nur Planer schreiben (wie persons/services)
-- =============================================================================

-- 1. Gruppen. Aufseher/Gehilfe verweisen auf Personen; wird eine Person
--    gelöscht, bleibt die Gruppe bestehen (Feld auf null).
create table if not exists public.groups (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  name            text not null,                    -- z. B. "Gruppe 1"
  overseer_id     uuid references public.persons (id) on delete set null,
  assistant_id    uuid references public.persons (id) on delete set null,
  position        integer not null default 0,       -- Anzeigereihenfolge
  created_at      timestamptz not null default now()
);

create index if not exists groups_congregation_idx
  on public.groups (congregation_id);

-- 2. Gruppenzuordnung der Person. set null: wird die Gruppe gelöscht, verliert
--    die Person nur die Zuordnung.
alter table public.persons
  add column if not exists grp uuid references public.groups (id) on delete set null;

-- 3. Row-Level-Security wie bei persons/services: Versammlung liest, Planer schreiben.
alter table public.groups enable row level security;

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());
