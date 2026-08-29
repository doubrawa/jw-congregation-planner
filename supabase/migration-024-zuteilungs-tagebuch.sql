-- =============================================================================
-- Migration 024: Versand-Tagebuch für gesendete Zuteilungen („Plan senden")
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent). Neuinstallationen brauchen
-- diese Datei nicht — schema.sql enthält alles.
--
-- Wozu. Bis hierher erfuhr die eingeteilte Person von ihrer Zuteilung gar
-- nichts: die Mitteilung „Zuteilung gesendet" ging an die **Planer**, nicht an
-- sie (T74 hat das beim Bauen gemessen und vertagt). Sie erfuhr es frühestens
-- über die zeitliche Erinnerung, also `first` Tage vor der Zusammenkunft — wer
-- drei Wochen im Voraus plant, dessen Leute wussten zwei Wochen lang nichts.
--
-- Der neue Weg ist ein Knopf: der Planer arbeitet die Woche fertig und drückt
-- „Plan senden". Dann bekommt jede betroffene Person **eine** Nachricht mit
-- allen ihren Aufgaben dieser Woche (Edge Function `send-plan`).
--
-- Wozu dann dieses Tagebuch. Ohne es müsste der Knopf jedes Mal alles erneut
-- schicken. Ein Planer, der nach dem Senden noch einen einzigen Platz
-- nachbessert und wieder drückt, verschickte an alle zwölf Personen dieselbe
-- Nachricht ein zweites Mal. Hier steht deshalb, welcher Platz mit welchem
-- Namen bereits gemeldet wurde; gesendet wird nur, was fehlt.
--
-- Warum (task_key, name) und nicht (task_key) allein: Teilt der Planer einen
-- Platz um, ist der Name ein anderer — die neue Person muss es erfahren, die
-- alte hatte ihre Nachricht schon. Der Name statt der Person-Id, weil auch
-- Plätze ohne `pid` vorkommen (Altdaten, Hilfsdienste als reine Zeichenkette);
-- `person_id` steht daneben, wo es eine gibt, und trägt die Anzeige „wer wurde
-- wann benachrichtigt" im Planen.
--
-- Wird ein Platz umgeteilt, löscht `send-plan` (Aktion 'entzug') den Eintrag
-- der bisherigen Person: er behauptete „sie weiß von diesem Platz", und das
-- gilt dann nicht mehr. Bekommt sie ihn später zurück, wird sie also erneut
-- benachrichtigt.

create table if not exists public.assignment_log (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  -- Aufgaben-Schlüssel des Platzes — dieselbe Form wie confirmations.task_key
  task_key        text not null,
  -- Anzeigename zum Zeitpunkt des Sendens (auch für Plätze ohne Person-Id)
  name            text not null,
  -- Person und Konto, wo bekannt; NULL bei Gästen und Altdaten ohne Id
  person_id       uuid references public.persons (id) on delete set null,
  user_id         uuid references auth.users (id) on delete set null,
  sent_at         timestamptz not null default now(),
  -- pro Platz und Name höchstens ein Eintrag → zweites Drücken schickt nichts
  unique (congregation_id, task_key, name)
);

create index if not exists assignment_log_cong_idx
  on public.assignment_log (congregation_id, task_key);

alter table public.assignment_log enable row level security;

-- Lesen darf die Versammlung: der Planen-Screen zeigt an jedem Platz, wann die
-- Nachricht hinausging. Geschrieben wird ausschließlich von `send-plan` mit der
-- Service-Role (umgeht RLS) — ein Client, der sich selbst als „informiert"
-- einträgt, könnte damit sonst Nachrichten unterdrücken.
drop policy if exists assignment_log_select on public.assignment_log;
create policy assignment_log_select on public.assignment_log
  for select using (congregation_id = public.my_congregation_id());
