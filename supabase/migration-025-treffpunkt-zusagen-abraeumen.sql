-- =============================================================================
-- Migration 025: Gruppenaufseher räumen die Zusage eines Treffpunkts ab
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent). Neuinstallationen brauchen
-- diese Datei nicht — schema.sql enthält alles.
--
-- WARUM
-- Eine Zusage gibt eine Person, gespeichert wird sie aber unter dem Schlüssel
-- des Platzes (`fs|<Montag>|<Treffpunkt>`). Leitet den Treffpunkt danach
-- jemand anderes, muss die alte Zeile weg — sonst erbt der Nachfolger sie:
-- Er steht als bestätigt da, ohne gefragt worden zu sein, bekommt keine
-- Erinnerung, und sagt er ab, verdeckt die alte Zusage seine Absage (beim
-- Laden gewinnt „bestätigt", `confirmationMap` in src/lib/data.ts).
--
-- Die App löscht die Zeile seit dem 14. September 2026 bei jedem
-- Leiterwechsel (`fsVerwaisteZusagen`, src/data/fs.ts). Treffpunkte besetzen
-- aber nicht nur Planer: Gruppenaufseher und -gehilfen dürfen `fs_weeks`
-- schreiben (`is_group_overseer()`) — löschen durften sie Zusagen bisher
-- nicht. Die Richtlinie ließ ihr Löschen still ins Leere laufen, und die alte
-- Zusage stand nach dem nächsten Laden wieder da.
--
-- WAS SICH ÄNDERT
-- Gruppenaufseher dürfen Zusagen löschen — aber nur die von Treffpunkten.
-- Zusagen zu den Zusammenkünften bleiben Sache der Planer, genau wie das
-- Schreiben der Wochen selbst. Die Einschränkung auf die eigene Gruppe macht
-- die App, wie beim Schreiben der Treffpunkte auch.

drop policy if exists confirmations_delete_planner on public.confirmations;
create policy confirmations_delete_planner on public.confirmations
  for delete using (
    congregation_id = public.my_congregation_id()
    and (
      public.is_planner()
      or (public.is_group_overseer() and task_key like 'fs|%')
    )
  );
