-- Migration 023: Abwesenheiten nur für die eigene Person (T97)
--
-- WARUM
-- `absences_write` erlaubt das Schreiben in drei Fällen, und der erste war zu
-- weit: `user_id = auth.uid()` — „die Zeile gehört mir". Er sagt aber nichts
-- über `person_id`, und genau diese Spalte entscheidet, **um wen** es geht.
--
-- Ein einfaches Mitglied konnte deshalb eine Abwesenheit auf eine fremde
-- Person eintragen: eigene `user_id` hinein (Zweig 1 greift), fremde
-- `person_id` daneben. Die Person-Id ist keine Hürde — `persons_select` gibt
-- sie versammlungsweit heraus.
--
-- Folgen, alle ohne Zutun des Betroffenen: Er fällt aus der automatischen
-- Zuteilung (`planning.ts`), aus der Kandidatenliste, aus dem Treffpunkt-Pool
-- und aus den Verfügbarkeitszahlen — auch serverseitig, denn `substitute`
-- fragt dieselbe Tabelle. Der frei wählbare `reason` steht dabei unter SEINEM
-- Namen in der Zeitleiste, denn `AufgabenScreen` ordnet nach Person zu, nicht
-- nach Ersteller. Und weil `for all` gilt, ließ sich `person_id` einer selbst
-- angelegten Zeile später auf den nächsten Betroffenen umbiegen.
--
-- Dieselbe Bauart wie T89 (migration-022): eine Regel, die prüft, wem die
-- ZEILE gehört, statt wem die SACHE gehört. Hier ist die Sache die Person.
--
-- WAS BLEIBT ERLAUBT
-- Der erste Zweig verschwindet nicht, er wird auf seinen Zweck eingegrenzt:
-- Konten ohne verknüpfte Person (`members.person_id is null`) tragen ihre
-- Abwesenheit weiter selbst ein — deren Zeilen haben `person_id is null`, und
-- nur dieser Zweig lässt sie durch (AbsencePanel).
--   * eigene Zeile ohne Person            → Zweig 1 (jetzt: nur mit NULL)
--   * eigene Zeile mit eigener Person     → Zweig 1 und 2
--   * importierte Zeile (user_id NULL)    → Zweig 2, für den Betroffenen
--   * fremde Person                       → nur noch Zweig 3, also Planer
--
-- Das `using` bleibt bewusst breiter als das `with check`: Altbestand, der vor
-- dieser Migration mit fremder `person_id` entstanden ist, muss noch lesbar
-- und **löschbar** sein — sonst bliebe genau der Schaden stehen, den die
-- Migration verhindern soll.
--
-- ANWENDEN: einmalig im Supabase SQL-Editor ausführen. Idempotent, gefahrlos
-- mehrfach ausführbar. Neuinstallationen brauchen sie nicht — schema.sql
-- enthält alles.

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
      (user_id = auth.uid() and (person_id is null or person_id = public.my_person_id()))
      or (person_id is not null and person_id = public.my_person_id())
      or public.is_planner()
    )
  );
