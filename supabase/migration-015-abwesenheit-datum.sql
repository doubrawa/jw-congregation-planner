-- Migration 015: Abwesenheiten am Datum statt am Wochenindex
--
-- `persons.absent` war ein Feld aus Wochenindizes (integer[]). Das war zweimal
-- falsch:
--
--  1. Ein Index zeigt auf „die n-te geladene Woche". Sobald nicht mehr alle
--     Wochen ab Position 0 geladen werden, zeigt derselbe Eintrag auf eine
--     andere Woche — die Abwesenheit verschiebt sich stillschweigend.
--  2. Ein Index kennt keine Tage. Wer nur übers Wochenende weg war, galt für
--     die ganze Woche als abwesend (und umgekehrt).
--
-- Es gibt bereits die Tabelle `absences` mit `from_date`/`to_date` und einer
-- Verknüpfung zur Person. Sie war bisher nur die persoenliche Liste im eigenen
-- Bereich; die Planung hat sie nie gelesen (und `persons.absent` hat umgekehrt
-- nie jemand geschrieben — es gab keine Oberfläche dafür). Beide Hälften sind
-- jetzt zusammengeführt: die Planung liest `absences` versammlungsweit.
--
-- Die Spalte wird deshalb entfernt. Datenverlust ist keiner zu erwarten: ohne
-- schreibende Oberfläche steht dort überall das Vorgabe-'{}'. Zur Sicherheit
-- meldet der erste Block, falls doch Werte drinstehen — dann bitte VOR dem
-- Ausführen des zweiten Blocks melden.
--
-- Idempotent, gefahrlos mehrfach ausführbar.

-- 1) Kontrolle: gibt es überhaupt gefüllte Wochenindizes?
do $$
declare n integer;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'persons' and column_name = 'absent'
  ) then
    execute 'select count(*) from public.persons where array_length(absent, 1) > 0' into n;
    if n > 0 then
      raise warning 'persons.absent enthaelt bei % Personen Werte — diese Abwesenheiten gehen verloren.', n;
    end if;
  end if;
end $$;

-- 2) Spalte entfernen.
alter table public.persons drop column if exists absent;

-- 3) Die Verknüpfung zur Person ist ab jetzt das, woran die Planung haengt.
comment on column public.absences.person_id is
  'Betroffene Person — nur mit ihr zaehlt die Abwesenheit fuer die Zuteilung; null = Konto ohne Person.';
