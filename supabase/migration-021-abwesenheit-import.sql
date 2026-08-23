-- Migration 021: Abwesenheiten ohne Ersteller (Import aus New World Scheduler)
--
-- WARUM
-- `absences.user_id` war `not null` — jede Abwesenheit hatte einen Ersteller,
-- weil sie bisher nur eines sein konnte: ein Eintrag, den jemand im eigenen
-- Bereich selbst angelegt hat. Ein Import hat diesen Ersteller nicht. Er kennt
-- die **Person**, nicht das Konto; die meisten Verkündiger haben gar keines.
--
-- Trüge der Import ersatzweise das Konto des Planers ein, stünden dessen
-- „Deine Einträge" (AufgabenScreen) voll mit den Abwesenheiten der ganzen
-- Versammlung — die Liste filtert auf `userId === meiner || personId === meine`.
-- Genau deshalb wird `user_id` jetzt NULL-bar: NULL heißt „niemand hat das hier
-- erfasst, es kommt von außen". Der personId-Zweig zeigt sie dann dem, um den
-- es geht, und nur ihm.
--
-- Damit fällt aber der Schreibschutz auf die eigene Zeile auseinander: Die
-- bisherige Regel war `user_id = auth.uid() or is_planner()`; bei NULL ist der
-- erste Zweig immer falsch, und eine importierte Abwesenheit könnte nur noch
-- ein Planer entfernen — nicht einmal der Betroffene selbst. Deshalb kommt der
-- Zweig über die **Person** dazu: Wer die Abwesenheit betrifft, darf sie auch
-- ändern und löschen, gleich wer sie eingetragen hat.
--
-- `my_person_id()` ist die dafür nötige Auskunft (eigene Person aus `members`)
-- und folgt `my_congregation_id()`/`is_planner()` in Bau und Rechten:
-- `security definer`, damit die Regel nicht selbst wieder an RLS hängt.
--
-- ANWENDEN: einmalig im Supabase SQL-Editor ausführen. Idempotent, gefahrlos
-- mehrfach ausführbar. Danach spielt `scripts/abwesenheiten-importieren.mjs`
-- die NWS-Abwesenheiten ein.

-- 1) Ersteller darf fehlen.
alter table public.absences alter column user_id drop not null;

comment on column public.absences.user_id is
  'Ersteller des Eintrags; NULL = importiert (z. B. aus New World Scheduler).';

-- 2) Eigene Person des angemeldeten Kontos.
create or replace function public.my_person_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select person_id from public.members where user_id = auth.uid()
$$;

-- 3) Schreibrecht: eigener Eintrag, eigene Person — oder Planer.
drop policy if exists absences_write on public.absences;
create policy absences_write on public.absences
  for all
  using (
    congregation_id = public.my_congregation_id()
    and (
      user_id = auth.uid()
      or (person_id is not null and person_id = public.my_person_id())
      or public.is_planner()
    )
  )
  with check (
    congregation_id = public.my_congregation_id()
    and (
      user_id = auth.uid()
      or (person_id is not null and person_id = public.my_person_id())
      or public.is_planner()
    )
  );
