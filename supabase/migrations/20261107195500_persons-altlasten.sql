-- =============================================================================
-- Altlasten in `persons` (T170, 7. November 2026)
-- =============================================================================
-- Zwei Reste, die nur in einer Datenbank stehen, die aus älteren Ständen
-- gewachsen ist. Gefunden hat sie der Abgleich der Produktion mit den beiden
-- ersten Migrationen über dieselben acht Katalog-Abschnitte, die
-- `supabase/migrationen.test.ts` vergleicht; alle übrigen Abschnitte waren
-- gleich.
--
-- `schema.sql` bleibt, wie es ist: Der Gesamtstand kennt beide Reste nicht.
-- In einer frischen Datenbank tun die Anweisungen hier deshalb nichts.
-- =============================================================================

-- Der frühere Anzeigename. Die App liest und schreibt ihn nicht — Vor- und
-- Nachname sind je Versammlung eindeutig. Gemessen vor dem Entfernen: in allen
-- 144 Zeilen leer. Solange die Spalte dastünde, trüge jede Sicherung sie mit
-- (`select=*`), und eine frisch aufgebaute Datenbank nähme sie beim
-- Zurückspielen nicht an.
alter table public.persons drop column if exists dn;

-- Spaltenrechte neben dem Tabellenrecht. `authenticated` darf `persons` ganz
-- lesen, also wirken sie nicht. Entzöge eine spätere Änderung das
-- Tabellenrecht, gälten sie wieder — und nur in dieser einen Datenbank, nicht
-- in einer frisch aufgebauten.
revoke select (id, congregation_id, fn, ln, role, female, priv, planner_vorgemerkt,
               fam, created_at, grp, zuteiler_vorgemerkt)
  on public.persons from authenticated;
