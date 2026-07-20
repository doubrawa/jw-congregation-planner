-- Migration 008: "Alle löschen"-Button im Mitteilungen-Panel.
-- Bisher gab es keine Delete-Policy auf notifications — Löschen lief ins Leere.
-- Jeder Empfänger darf die für ihn sichtbaren Mitteilungen löschen
-- (gleiche Sichtbarkeitsregel wie beim Lesen/Gelesen-Status: Zeilen der
-- eigenen Versammlung, die an alle oder an ihn selbst gerichtet sind).
--
-- Ausführen im Supabase SQL-Editor (Projekt izxrhrufdbpbuwbvxdqr).

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (
    congregation_id = public.my_congregation_id()
    and (user_id is null or user_id = auth.uid())
  );
