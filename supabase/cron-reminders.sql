-- =============================================================================
-- Täglicher Trigger für die Erinnerungs-Function (send-reminders)
-- =============================================================================
-- Voraussetzung: Extensions pg_cron und pg_net aktiviert (Supabase-Dashboard →
-- Database → Extensions). Ersetze <PROJECT_REF> und <CRON_SECRET>.
--
-- Der Aufruf schickt CRON_SECRET im Authorization-Header; die Function lehnt
-- alles ohne gültiges Secret ab. Standardmäßig läuft die Function im Dry-Run
-- (kein echter Versand), bis das Secret SEND_EMAILS=true gesetzt ist.
-- Zeit ist UTC; hier täglich um 08:00 UTC.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'jw-send-reminders-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Zum Entfernen:  select cron.unschedule('jw-send-reminders-daily');
