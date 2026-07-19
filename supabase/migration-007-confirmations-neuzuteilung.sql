-- =============================================================================
-- Migration 007: Neuzuteilung räumt Bestätigungs-Status des Slots ab
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent). Bisher durfte jedes Mitglied
-- nur eigene confirmations-Zeilen löschen — beim Neu-Zuteilen eines Slots
-- blieb dadurch ein fremder „verhindert“/„bestätigt“-Eintrag kleben und die
-- neu eingeteilte Person erbte den Status. Admins dürfen jetzt die Einträge
-- ihrer Versammlung löschen (die App tut das automatisch beim Zuteilen).

drop policy if exists confirmations_delete_planner on public.confirmations;
create policy confirmations_delete_planner on public.confirmations
  for delete using (congregation_id = public.my_congregation_id() and public.is_planner());
