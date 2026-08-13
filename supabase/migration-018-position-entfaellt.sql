-- Migration 018: `position` entfällt (T66, Stufe 3 — die letzte)
--
-- Stufe 1 (migration-017) hat das Startdatum als Spalte angelegt und gefüllt,
-- Stufe 2 hat den `task_key` von der Position auf die Kennung gehoben. Beides
-- war additiv: `position` blieb stehen, damit der laufende Client
-- weiterfunktioniert. Jetzt fällt sie.
--
-- Damit verschwindet die Verwechslung, aus der T66 entstanden ist: eine
-- **Ordnungszahl** diente zugleich als **Kennung**. Die Reihenfolge ist ab hier
-- `order by start` — eine zweite Quelle für dieselbe Aussage wäre wieder eine
-- Annahme, die auseinanderlaufen kann.
--
-- ---------------------------------------------------------------------------
-- REIHENFOLGE: ERST DEPLOYEN, DANN DIESE MIGRATION.
-- ---------------------------------------------------------------------------
-- Der neue Client liest und schreibt `weeks` über `start` und kennt `position`
-- nicht mehr; die Spalte ist ihm gleichgültig, solange sie noch da ist --
-- **außer beim Einfügen**, denn `position` ist `not null`. Bis diese Migration
-- läuft, schlagen deshalb genau zwei Dinge fehl (sichtbar, mit Meldung):
-- der Import einer neuen Woche und das erste Materialisieren von Treffpunkten.
-- Umgekehrt wäre es schlimmer: der alte Client holt `select position, data`
-- und bekäme nach dem Löschen gar nichts mehr.
--
-- Die Edge Functions `send-reminders` und `substitute` müssen vor dieser
-- Migration ebenfalls neu deployt sein -- auch sie lasen `position`.

-- ------------------------------------------- Verbliebene Positions-Schlüssel -
--
-- Die Umstellung des `task_key` läuft seit Stufe 2 im Client beim Laden. Sie
-- erreicht aber nur, wer sich anmeldet, und nur die Wochen im Ladefenster. Was
-- übrig ist, wird **hier** gehoben -- und zwar jetzt, weil es danach nicht mehr
-- geht: `position` ist die einzige Brücke von der alten Form zur neuen, und die
-- wird unten abgerissen.
--
-- Ein Sonderfall braucht Beachtung: `unique (congregation_id, task_key,
-- user_id)`. Derselbe Bruder kann für denselben Programmpunkt **beide** Formen
-- tragen -- er hat unter einer älteren, noch offenen Fassung der App bestätigt,
-- nachdem der Schlüssel schon umgeschrieben war. Dann gewinnt die datierte:
-- sie ist die, die der heutige Client anzeigt. Die Positions-Zeile fällt weg,
-- sonst scheiterte das Umbenennen am Eindeutigkeitsverstoß.

with kennung as (
  select
    c.id,
    c.congregation_id,
    c.user_id,
    -- Treffpunkte tragen die Woche an zweiter Stelle (`fs|<wi>|<instId>`),
    -- alles andere an erster. Der Rest des Schlüssels bleibt unangetastet.
    (case when c.task_key like 'fs|%' then 'fs|' else '' end)
      || to_char(w.start, 'YYYY-MM-DD')
      || substring(c.task_key from '^(?:fs\|)?\d+(\|.*)$') as neu
  from public.confirmations c
  join public.weeks w
    on  w.congregation_id = c.congregation_id
    and w.position = (substring(c.task_key from '^(?:fs\|)?(\d+)\|'))::integer
  where c.task_key ~ '^(?:fs\|)?\d+\|'
),
doppelt as (
  delete from public.confirmations c
  using kennung k
  where c.id = k.id
    and exists (
      select 1 from public.confirmations d
      where d.congregation_id = k.congregation_id
        and d.user_id        = k.user_id
        and d.task_key       = k.neu
    )
  returning c.id
)
update public.confirmations c
set task_key = k.neu
from kennung k
where c.id = k.id
  and c.id not in (select id from doppelt);

-- ------------------------------------------------------------- Nachschau -----
--
-- Was jetzt noch positionsförmig ist, zeigt auf eine Woche, die es nicht (mehr)
-- gibt -- eine gelöschte oder eine, die nie angelegt wurde. Solche Schlüssel
-- sind bereits heute wirkungslos: nichts findet sie, niemand zeigt sie an. Sie
-- werden gemeldet, aber nicht gelöscht; eine Migration, die Bestätigungen
-- wegwirft, wäre die falsche Stelle dafür.

do $$
declare
  verwaist integer;
begin
  select count(*) into verwaist
  from public.confirmations
  where task_key ~ '^(?:fs\|)?\d+\|';
  if verwaist > 0 then
    raise notice
      'T66: % Bestaetigungen zeigen auf eine Woche, die es nicht gibt. Sie '
      'bleiben stehen und bleiben wirkungslos.', verwaist;
  end if;
end $$;

-- ------------------------------------------------------------ Die Spalte -----
--
-- Mit ihr fällt `unique (congregation_id, position)` von selbst -- die Regel,
-- die ausgerechnet auf der Ordnungszahl lag. Was sie sichern sollte, sichert
-- seit Stufe 1 `unique (congregation_id, start)`: eine Woche je Kalenderwoche.

alter table public.weeks    drop column if exists position;
alter table public.fs_weeks drop column if exists position;

-- Und die Regel auf `weeks.start` nachtragen, falls eine Instanz vor
-- migration-017 aufgesetzt wurde: dort legte `schema.sql` sie nicht an.
alter table public.weeks
  drop constraint if exists weeks_congregation_id_start_key;
alter table public.weeks
  add constraint weeks_congregation_id_start_key unique (congregation_id, start);
