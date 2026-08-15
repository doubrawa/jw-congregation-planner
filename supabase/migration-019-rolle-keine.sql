-- =============================================================================
-- Migration 019: Rolle „Keine" zulassen
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent). Erweitert den CHECK auf
-- persons.role um 'keine' — die Rolle für Personen, die keine Verkündiger sind
-- (z. B. inaktive Schüler, die nur Schülerteile übernehmen). Ohne diese
-- Migration weist die Datenbank ein role='keine' beim Einspielen ab.

alter table public.persons
  drop constraint if exists persons_role_check;
alter table public.persons
  add constraint persons_role_check
  check (role in ('aeltester', 'dienstamtgehilfe', 'verkuendiger', 'keine'));
