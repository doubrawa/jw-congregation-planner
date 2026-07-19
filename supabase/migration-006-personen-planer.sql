-- =============================================================================
-- Migration 006: Planer-Recht an der Person (Feste Rollen im Personen-Detail)
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent). Das Planer-Recht wird jetzt
-- an der Person gepflegt; members.planner (Konto) wird von der App gespiegelt
-- und bleibt die maßgebliche Quelle für die Rechteprüfung (RLS is_planner).

alter table public.persons
  add column if not exists planner boolean not null default false;

-- Bestand: Personen, deren verknüpftes Konto Planer ist, übernehmen das Recht.
update public.persons p
set planner = true
from public.members m
where m.person_id = p.id and m.planner and not p.planner;
