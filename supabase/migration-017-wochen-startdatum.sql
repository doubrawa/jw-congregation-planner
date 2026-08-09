-- Migration 017: Eine Woche ist ihr Datum, nicht ihre Nummer (T66, Stufe 1)
--
-- `weeks.id` (uuid) gibt es seit dem ersten Schema — und es wird nirgends
-- benutzt. Identifiziert wird eine Woche über `position`, also über eine
-- **Ordnungszahl**, die zugleich als **Kennung** dient. Daran hängt mehr, als
-- es zunächst aussieht:
--
--   * `confirmations.task_key` beginnt mit der Position ("0|mid|part|2|1|0"),
--   * `Week.stub` existiert **nur**, damit der Array-Index die Position bleibt,
--   * `send-reminders` und `substitute` lesen den Schlüssel aus rohem JSONB,
--   * und jede Einfügung in der Mitte verschiebt alles dahinter.
--
-- Aufgefallen ist es an einer harmlosen Stelle: Im Arbeitsheft fehlt die Woche
-- des Gedächtnismahls vollständig (T65). Wer sie nachträgt, verschiebt jede
-- Position dahinter — und lässt damit jede gespeicherte Bestätigung auf die
-- falsche Woche zeigen.
--
-- Das Startdatum ist die richtige Kennung: eindeutig je Versammlung, stabil,
-- lesbar, und fachlich das, was eine Woche *ist*. Es steht schon im Datenmodell
-- (`Week.start`) — aber **im JSONB-Blob**, wo die Datenbank es weder prüfen
-- noch eindeutig halten noch danach sortieren kann.
--
-- Diese Migration ist **Stufe 1 von dreien** und ausschließlich additiv: Sie
-- legt die Spalte an und füllt sie. `position` bleibt unangetastet, der
-- laufende Client funktioniert unverändert weiter. Erst Stufe 2 stellt den
-- `task_key` um, erst Stufe 3 lässt `position` und die Platzhalter fallen.
--
-- **Der Wochenanfang ist immer Montag.** Das ist keine gewählte Konvention:
-- jw.org definiert die Programmwoche selbst als Montag bis Sonntag
-- ("2.–8. März 2026", und der 2. März ist ein Montag), in jeder Sprache.

-- ---------------------------------------------------------------- Spalten ---

alter table public.weeks     add column if not exists start date;
alter table public.fs_weeks  add column if not exists start date;

-- --------------------------------------------------------------- Füllen -----
--
-- Zwei Quellen, in dieser Reihenfolge:
--   1. `data->>'start'` — steht bei jeder importierten Woche schon drin.
--   2. `fs_rules.base + position * 7` — der Montag der Woche 0 ist als Bezug
--      der Treffpunkt-Datumsrechnung längst gespeichert. Wochen liegen genau
--      sieben Tage auseinander; das ist die Definition der Programmwoche.

update public.weeks w
set start = coalesce(
      nullif(w.data ->> 'start', '')::date,
      (select r.base from public.fs_rules r where r.congregation_id = w.congregation_id)
        + (w.position * 7)
    )
where w.start is null;

update public.fs_weeks f
set start = (select r.base from public.fs_rules r where r.congregation_id = f.congregation_id)
      + (f.position * 7)
where f.start is null;

-- ------------------------------------------------------------ Nachschau -----
--
-- Bleibt etwas leer, fehlt `fs_rules.base` für diese Versammlung. Dann lieber
-- laut abbrechen als eine Kennung raten: eine falsch datierte Woche wäre
-- schlimmer als eine fehlende Spalte.

do $$
declare
  offen integer;
begin
  select count(*) into offen from public.weeks where start is null;
  if offen > 0 then
    raise exception
      'T66: % Wochen ohne Startdatum. Ursache ist ein fehlendes fs_rules.base. '
      'Erst dort den Montag der Woche 0 eintragen, dann diese Migration erneut '
      'ausfuehren.', offen;
  end if;
end $$;

-- ------------------------------------------------------- Pflicht + Regel ----
--
-- Ab hier hält die Datenbank selbst, was bisher nur Absprache war: **eine Woche
-- je Kalenderwoche**, keine zwei, keine namenlose.

alter table public.weeks    alter column start set not null;
alter table public.fs_weeks alter column start set not null;

alter table public.weeks
  drop constraint if exists weeks_congregation_id_start_key;
alter table public.weeks
  add constraint weeks_congregation_id_start_key unique (congregation_id, start);

alter table public.fs_weeks
  drop constraint if exists fs_weeks_congregation_id_start_key;
alter table public.fs_weeks
  add constraint fs_weeks_congregation_id_start_key unique (congregation_id, start);

-- Sortiert wird künftig danach (Stufe 3 löst `order by position` ab).
create index if not exists weeks_start_idx    on public.weeks    (congregation_id, start);
create index if not exists fs_weeks_start_idx on public.fs_weeks (congregation_id, start);
