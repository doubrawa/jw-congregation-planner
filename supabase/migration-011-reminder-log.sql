-- =============================================================================
-- Migration 011: Versand-Tagebuch für Erinnerungen (Doppel-Versand-Sperre)
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent). Die Edge Function
-- send-reminders trägt hier ein, wem sie an welchem Tag welche Art Erinnerung
-- geschickt hat, und überspringt bei einem zweiten Lauf am selben Tag die schon
-- Erledigten — sonst käme dieselbe Push/Glocke doppelt an. Nur die Service-Role
-- schreibt/liest; Clients haben keinen Zugriff (RLS ohne Policy = alles gesperrt).
--
-- kind: 'self'    persönliche Erinnerung an die eingeteilte Person
--       'planner' Sammelmeldung „nicht erreichbar" an die Planer

create table if not exists public.reminder_log (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null,
  sent_on         date not null default current_date,
  created_at      timestamptz not null default now(),
  -- pro Empfänger, Art und Tag höchstens ein Eintrag → idempotenter Neulauf
  unique (user_id, kind, sent_on)
);

create index if not exists reminder_log_sent_on_idx
  on public.reminder_log (sent_on);

alter table public.reminder_log enable row level security;
-- Bewusst keine Policy: Clients kommen nicht heran, die Function nutzt die
-- Service-Role (umgeht RLS).
