-- =============================================================================
-- Täglicher Aufräumlauf (T125) — löscht, was älter ist als seine Frist
-- =============================================================================
-- Die Fristen stehen in `public.alte_daten_loeschen` (supabase/schema.sql):
-- ein Jahr für die Wochen und was zu ihnen gehört, acht Wochen für alles
-- andere samt dem Protokoll von Supabase Auth, ein Tag für die Fehlversuche
-- beim Anmelden.
--
-- Voraussetzung: Extension pg_cron (wie für die Erinnerungen) und das Schema
-- mit der Funktion. Ein Secret braucht es nicht — der Lauf bleibt in der
-- Datenbank. Zeit ist UTC; hier täglich um 03:30 UTC, nachts und fern vom
-- Erinnerungslauf.
--
-- Vor dem ersten Lauf ansehen, was ginge (zählt nur, löscht nichts):
--   select * from public.alte_daten_loeschen(true);

create extension if not exists pg_cron;

select cron.schedule(
  'jw-alte-daten-loeschen',
  '30 3 * * *',
  $$select public.alte_daten_loeschen()$$
);

-- Zum Entfernen:  select cron.unschedule('jw-alte-daten-loeschen');
