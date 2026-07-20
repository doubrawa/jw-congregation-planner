-- Migration 009: Mitteilungen sind ab jetzt personalisiert (je Empfänger eine
-- eigene Zeile mit eigenem Gelesen-/Lösch-Status) statt eines geteilten
-- Versammlungs-Feeds mit user_id = null.
--
-- Client-Mitteilungen (Zuteilung/Import/Verhinderung) richten sich an die
-- Planer, Erinnerungen an die betroffene Person. Die alten geteilten Zeilen
-- (user_id null) werden entfernt und die Sichtbarkeit strikt auf den eigenen
-- Nutzer beschränkt. „Alle gelesen" / „Alle löschen" wirken damit nur noch
-- auf die eigenen Mitteilungen.
--
-- Ausführen im Supabase SQL-Editor (Projekt izxrhrufdbpbuwbvxdqr).

-- Alten geteilten Feed abräumen (war reines Aktivitätsprotokoll).
delete from public.notifications where user_id is null;

-- Sichtbarkeit/Änderung/Löschen strikt auf die eigenen Zeilen.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (
    congregation_id = public.my_congregation_id()
    and user_id = auth.uid()
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (
    congregation_id = public.my_congregation_id()
    and user_id = auth.uid()
  );

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete using (
    congregation_id = public.my_congregation_id()
    and user_id = auth.uid()
  );

-- Einfügen bleibt: Planer erzeugen Zeilen für beliebige Empfänger der eigenen
-- Versammlung; Verhinderungs-Meldungen dürfen alle Mitglieder erzeugen.
