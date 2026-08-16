-- Migration 020: Mitteilungen bekommen einen Bezug zur Aufgabe (T86 / T77)
--
-- WARUM
-- Eine Mitteilung wusste bisher nicht, worum es geht — nur Titel und Rumpf, die
-- beide reiner Anzeigetext sind. Daraus folgten zwei Fehler, die der Betreiber
-- gemeldet hat:
--
--   * „Ersatz gesucht" blieb in der Glocke aller Qualifizierten stehen, auch
--     nachdem längst jemand eingesprungen war. Es gab nichts, wonach man die
--     erledigten hätte löschen können.
--   * Mitteilungen zu einem Termin, der vorbei ist, ließen sich nicht als
--     abgelaufen erkennen („die interessieren keinen mehr").
--
-- Mit `task_key` — demselben stabilen Slot-Pfad, den `confirmations` schon
-- führt (siehe partTaskKey/helperTaskKey in src/data/planning.ts) — lässt sich
-- beides beantworten: Die Edge Function räumt beim Einspringen auf, und die App
-- erkennt am Datum in der Kennung, was vergangen ist.
--
-- Bewusst NULL-bar und ohne Fremdschlüssel: Es gibt Mitteilungen ohne Aufgabe
-- (Import fertig, Einladung), und `confirmations` ist keine Elterntabelle —
-- eine Aufgabe existiert auch ohne Bestätigungszeile. Altbestand behält NULL
-- und bleibt damit stehen; er läuft ohnehin über die 50er-Grenze aus.
--
-- ANWENDEN: einmalig im Supabase SQL-Editor ausführen. Danach die Function
-- `substitute` neu deployen — sie schreibt den Schlüssel und räumt damit auf.
-- Reihenfolge: erst Migration, dann Deploy (die alte Fassung schreibt die
-- Spalte einfach nicht).

alter table public.notifications
  add column if not exists task_key text;

-- Gelesen wird immer nach Empfänger; der Bezug dient dem Aufräumen einer
-- einzelnen Aufgabe („welche Zeilen gehören zu diesem Platz?").
create index if not exists notifications_task_key_idx
  on public.notifications (congregation_id, task_key);

comment on column public.notifications.task_key is
  'Stabiler Slot-Pfad der Aufgabe, auf die sich die Mitteilung bezieht (wie confirmations.task_key); NULL bei Mitteilungen ohne Aufgabenbezug.';
