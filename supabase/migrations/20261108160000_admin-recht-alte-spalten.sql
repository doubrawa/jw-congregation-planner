-- =============================================================================
-- E4, Schritt 2 von 2: Die alten Namen des Admin-Rechts gehen (8. November 2026)
-- =============================================================================
-- Schritt 1 (`20261108150000_admin-recht.sql`) hat `members.admin` und
-- `persons.admin_vorgemerkt` neben die alten Spalten gelegt und beide per
-- Trigger gleich gehalten, solange ältere App-Stände die alten schrieben. Alle
-- Geräte haben die neue Fassung geladen (Betreiber: „und ja ich bin weiter
-- Admin"), Functions und App lesen nur noch die neuen Spalten.
--
-- Erst die Trigger, dann ihre Funktionen, dann die Spalten: Die Funktionen
-- lesen die alten Spalten, und Postgres trägt Funktionsrümpfe nicht als
-- Abhängigkeit ein — eine stehengebliebene scheiterte erst beim nächsten
-- Schreiben.
-- =============================================================================

drop trigger if exists members_admin_angleichen on public.members;
drop function if exists public.admin_recht_angleichen();

drop trigger if exists persons_admin_angleichen on public.persons;
drop function if exists public.admin_vormerkung_angleichen();

alter table public.members drop column if exists planner;
alter table public.persons drop column if exists planner_vorgemerkt;
