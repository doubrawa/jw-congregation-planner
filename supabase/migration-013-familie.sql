-- =============================================================================
-- Migration 013: Familien-/Haushaltszugehörigkeit der Personen
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent). Personen mit derselben `fam`-Id
-- gehören zum selben Haushalt (Familienangehörige). Genutzt für die
-- Gesprächspartner-Regel bei Schülerteilen: normalerweise gleiches Geschlecht,
-- Familienangehörige dürfen auch geschlechtsübergreifend Partner sein.
--
-- Die Id ist eine frei vergebene UUID (Client: crypto.randomUUID) — kein
-- Fremdschlüssel, daher als text gespeichert.

alter table public.persons add column if not exists fam text;
