-- =============================================================================
-- Migration 004: Optionaler Anzeigename (Kurzform) je Person
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent). Für Bestände, in denen zwei
-- Personen sonst denselben automatischen Anzeigenamen "V. Nachname" hätten
-- (Zuteilungen hängen am Anzeigenamen): leer = automatisch.

alter table public.persons
  add column if not exists dn text not null default '';
