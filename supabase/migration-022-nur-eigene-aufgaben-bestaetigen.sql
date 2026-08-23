-- Migration 022: Bestätigen darf nur, wem die Aufgabe gehört (T89)
--
-- WARUM
-- `confirmations_write` prüfte nur, wem die **Zeile** gehört (`user_id =
-- auth.uid()`), nicht ob der `task_key` dieser Person überhaupt zugeteilt ist.
-- Am 19. August 2026 mit zwei echten Konten gemessen und bestätigt: Ein
-- einfaches Mitglied kann eine **fremde** Aufgabe als bestätigt oder verhindert
-- markieren — der Planer sieht es dann so, die Erinnerung verstummt, und beim
-- Hilfsdienst löst es die Ersatzsuche aus.
--
-- Die Zuteilung steht im JSONB der Woche. Der `task_key` sagt aber genau, wo:
-- Er trägt Wochen-Kennung, Zusammenkunft und den Weg zum Platz. Damit lässt
-- sich die Frage „gehört mir das?" direkt in der Richtlinie beantworten, ohne
-- die Fachlogik ein zweites Mal in SQL nachzubauen — nachgeschlagen wird die
-- **Speicherform**, nicht die Regel.
--
-- SCHLÜSSELFORMEN (src/data/planning.ts, src/data/fs.ts)
--   <woche>|<mid|we>|part|<iid>|<ni>          Programmpunkt, stabile Kennung
--   <woche>|<mid|we>|part|<si>|<ii>|<ni>      Programmpunkt, alte Position
--   <woche>|<mid|we>|aux|…                    dasselbe in der Zusätzlichen Klasse
--   <woche>|<mid|we>|ratgeber                 Ratgeber der Zusätzlichen Klasse
--   <woche>|<mid|we>|helper|<dienst>|<pos>    Hilfsdienst
--   fs|<montag>|<instanzId>                   Treffpunkt-Leitung
--
-- **Unbekannte Formen bleiben erlaubt.** Das ist Absicht: Eine zu strenge
-- Richtlinie bricht das Bestätigen, und zwar fast lautlos (der Client schreibt
-- fire-and-forget). Ein Schlüssel, den die App liest, ist immer eine der sechs
-- Formen — eine erfundene Form trifft keinen Platz und bleibt wirkungslos.
--
-- ANWENDEN: einmalig im Supabase SQL-Editor. Idempotent.

-- Anzeigename der eigenen Person — wie `personDisplayName()` in der App:
-- eigener Kurzname, sonst Vor- und Nachname. Nötig für den Altbestand, in dem
-- ein Platz nur einen Namen trägt und keine Person-Id.
create or replace function public.mein_anzeigename()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.dn), ''), btrim(p.fn || ' ' || p.ln))
    from public.persons p
   where p.id = public.my_person_id()
$$;

-- Gehört die Aufgabe hinter diesem Schlüssel der angemeldeten Person?
create or replace function public.task_gehoert_mir(schluessel text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  teile     text[] := string_to_array(coalesce(schluessel, ''), '|');
  n         integer := coalesce(array_length(teile, 1), 0);
  cong      uuid    := public.my_congregation_id();
  meine     uuid    := public.my_person_id();
  zk        jsonb;
  slot      jsonb;
  art       text;
  feld      text;
begin
  if cong is null then return false; end if;

  -- Treffpunkt-Leitung.
  if n = 3 and teile[1] = 'fs' then
    if meine is null then return false; end if;
    select e into slot
      from public.fs_weeks w, jsonb_array_elements(w.data) e
     where w.congregation_id = cong
       and w.start::text = teile[2]
       and e->>'id' = teile[3];
    if slot is null then return false; end if;
    -- Ein Freitext-Leiter (Kreisaufseher) gehört niemandem hier (T63).
    if coalesce(slot->>'lext', 'false') = 'true' then return false; end if;
    return slot->>'lpid' = meine::text
        or (slot->>'lpid' is null and slot->>'leader' = public.mein_anzeigename());
  end if;

  -- Alles Übrige hängt an einer Zusammenkunft. Was nicht so aussieht, ist keine
  -- der bekannten Formen — siehe Kopf.
  if n < 3 or teile[2] not in ('mid', 'we') then return true; end if;
  if meine is null then return false; end if;

  select w.data -> teile[2] into zk
    from public.weeks w
   where w.congregation_id = cong and w.start::text = teile[1];
  if zk is null then return false; end if;

  art := teile[3];
  feld := case when art = 'aux' then 'aux' else 'names' end;

  if art = 'ratgeber' and n = 3 then
    slot := zk -> 'auxRatgeber';

  elsif art = 'helper' and n = 5 and teile[5] ~ '^\d+$' then
    slot := zk -> 'helpers' -> teile[4] -> teile[5]::integer;

  elsif art in ('part', 'aux') and n = 5 and teile[5] ~ '^\d+$' then
    -- Stabile Kennung: der Punkt wird gesucht, nicht seine Position.
    select e -> feld -> teile[5]::integer into slot
      from jsonb_array_elements(zk -> 'sections') s,
           jsonb_array_elements(s -> 'items') e
     where e->>'iid' = teile[4];

  elsif art in ('part', 'aux') and n = 6
        and teile[4] ~ '^\d+$' and teile[5] ~ '^\d+$' and teile[6] ~ '^\d+$' then
    slot := zk -> 'sections' -> teile[4]::integer -> 'items' -> teile[5]::integer
               -> feld -> teile[6]::integer;

  else
    return true; -- keine der bekannten Formen
  end if;

  if slot is null then return false; end if;

  -- Hilfsdienst-Plätze im Altbestand sind ein reiner String, neuere ein Objekt
  -- { name, pid? } — beide Formen kommen vor.
  if jsonb_typeof(slot) = 'string' then
    return slot #>> '{}' = public.mein_anzeigename();
  end if;

  return slot->>'pid' = meine::text
      or (slot->>'pid' is null and slot->>'name' = public.mein_anzeigename());
end $$;

-- 2) Schreiben nur für die eigene Zeile UND die eigene Aufgabe.
drop policy if exists confirmations_write on public.confirmations;
create policy confirmations_write on public.confirmations
  for all
  using (congregation_id = public.my_congregation_id() and user_id = auth.uid())
  with check (
    congregation_id = public.my_congregation_id()
    and user_id = auth.uid()
    and public.task_gehoert_mir(task_key)
  );

-- 3) Verhinderungs-Meldungen gehen an Planer, nicht an beliebige Mitglieder.
--
-- Bisher durfte jedes Mitglied eine Mitteilung vom Typ `verhindert` mit freiem
-- Text an **jeden** Empfänger der Versammlung schreiben. Der legitime Weg
-- adressiert immer die Planer; mehr braucht es nicht. (Was bleibt: ein Mitglied
-- kann den Planern eine erfundene Absage schicken. Dafür bräuchte es den
-- `task_key` an der Mitteilung — den setzt der Client hier noch nicht.)
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert with check (
    congregation_id = public.my_congregation_id()
    and (
      public.is_planner()
      or (
        type = 'verhindert'
        and exists (
          select 1 from public.members m
           where m.user_id = notifications.user_id
             and m.congregation_id = notifications.congregation_id
             and m.planner
        )
      )
    )
  );
