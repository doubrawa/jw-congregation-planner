-- =============================================================================
-- JW Congregation Planner — Datenbankschema (v1)
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (einmalig, idempotent formuliert).
--
-- Grundidee (siehe README "Hosting"):
--   * Mandantenfähig über `congregations` — jede Zeile jeder Tabelle gehört
--     zu genau einer Versammlung.
--   * `members` verknüpft Auth-Benutzer (auth.users) mit ihrer Versammlung
--     und dem Rechte-Flag `planner` (Planen/Personen/Einstellungen).
--   * Row-Level-Security überall: Mitglieder lesen nur ihre Versammlung,
--     schreiben dürfen (bis auf eigene Abwesenheiten und Gelesen-Status)
--     nur Planer. Damit sind die personenbezogenen Daten versammlungsintern
--     geschützt — der anon-Key im Frontend genügt.
--   * Wochenprogramme liegen als JSONB vor (Struktur = Week aus
--     src/data/types.ts): einfach zu laden/speichern, keine Normalisierung
--     nötig, solange eine Versammlung ihre eigenen Wochen pflegt.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.congregations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                      -- "Musterstadt"
  hall          text not null default '',           -- "Hauptstraße 12"
  meeting_times text not null default '',           -- "Di 19:00 · So 10:00"
  settings      jsonb not null default '{}'::jsonb, -- { reminders, congLang }
  created_at    timestamptz not null default now()
);

create table if not exists public.members (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  person_id       uuid,                             -- optionale Verknüpfung zu persons
  planner         boolean not null default false,   -- sieht Planen/Personen/Einstellungen
  email           text not null default '',         -- Anzeige im Mitglieder-Panel
  created_at      timestamptz not null default now()
);

create table if not exists public.persons (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  fn              text not null default '',
  ln              text not null default '',
  dn              text not null default '', -- optionaler Anzeigename (Kurzform); leer = "V. Nachname"
  role            text not null default 'verkuendiger'
                  check (role in ('aeltester', 'dienstamtgehilfe', 'verkuendiger', 'keine')),
  female          boolean not null default false,   -- Schwester (Partner-Zuordnung, Brüder-Bereiche)
  tel             text not null default '',
  mail            text not null default '',
  -- Qualifications: feste Programm-Bereiche (vorsitzMid/vorsitzWe/vortrag/gebet/
  -- bibellesung/leser/schulung/schulungPartner/studium/treffpunkt + wtLeiter/
  -- wtVertreter) plus je Hilfsdienst ein dynamischer Schlüssel `svc:<key>`.
  priv            jsonb not null default '{}'::jsonb,
  planner         boolean not null default false,   -- Planer-Recht (in members.planner gespiegelt)
  -- Haushalt: Personen mit derselben Id sind Familie (Gesprächspartner-Regel).
  -- Frei vergebene UUID, kein Fremdschlüssel — daher text.
  fam             text,
  created_at      timestamptz not null default now()
);

create table if not exists public.services (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  key             text not null,                    -- 'ton', 'mik', … / 'svc-<uuid>'
  name            text not null,
  count           integer not null default 1 check (count between 1 and 6),
  priv            text,                             -- QualificationKey oder null
  groups          boolean not null default false,   -- Gruppen-Rotation (Reinigung)
  position        integer not null default 0,       -- Anzeigereihenfolge
  unique (congregation_id, key)
);

-- Predigtdienstgruppen (Aufseher/Gehilfe je Gruppe). Nach persons definiert,
-- da overseer_id/assistant_id darauf verweisen; persons.grp (unten) schließt
-- den Kreis per nachträglichem alter.
create table if not exists public.groups (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  name            text not null,                    -- z. B. "Gruppe 1"
  overseer_id     uuid references public.persons (id) on delete set null,
  assistant_id    uuid references public.persons (id) on delete set null,
  position        integer not null default 0,       -- Anzeigereihenfolge
  created_at      timestamptz not null default now()
);

create index if not exists groups_congregation_idx
  on public.groups (congregation_id);

-- Gruppenzuordnung der Person (nachträglich, da groups erst hier existiert).
alter table public.persons
  add column if not exists grp uuid references public.groups (id) on delete set null;

create table if not exists public.weeks (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  -- Kennung der Woche (T66): ihr Montag. Keine Ordnungszahl -- die stand hier
  -- bis migration-018 als `position` daneben und war zugleich Kennung, mit
  -- allem, was daran hing (`task_key`, Platzhalter, jede Einfuegung in der
  -- Mitte). Immer Montag, weil jw.org die Programmwoche selbst so definiert
  -- ("2.-8. Maerz 2026"). Sortiert wird danach.
  start           date not null,
  data            jsonb not null,                   -- Week-Objekt aus src/data/types.ts
  -- Stand der Zeile. Wer schreibt, nennt den Stand, auf dem seine Fassung
  -- beruht (siehe saveWeek); trifft er nicht mehr zu, war ein anderer Planer
  -- schneller und der Schreibvorgang findet keine Zeile. Gesetzt wird er vom
  -- Trigger, nicht vom Client — sonst schriebe man sich daran vorbei.
  updated_at      timestamptz not null default now(),
  unique (congregation_id, start)
);

create index if not exists weeks_start_idx on public.weeks (congregation_id, start);

-- Setzt `updated_at` bei jedem Update. Allgemein gehalten, damit dieselbe
-- Funktion später weitere Tabellen bedienen kann.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weeks_touch_updated_at on public.weeks;
create trigger weeks_touch_updated_at
  before update on public.weeks
  for each row execute function public.touch_updated_at();

create table if not exists public.absences (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  -- Ersteller; NULL = importiert (migration-021), z. B. aus New World Scheduler.
  -- Die Abwesenheit hängt fachlich an `person_id`, nicht am Konto: Die meisten
  -- Verkündiger haben gar keines.
  user_id         uuid references auth.users (id) on delete cascade,
  person_id       uuid references public.persons (id) on delete set null,
  from_date       date not null,
  to_date         date not null,
  reason          text not null default '',
  created_at      timestamptz not null default now()
);

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade, -- Empfänger
  type            text not null default 'zuteilung'
                  check (type in ('zuteilung', 'erinnerung', 'gesendet', 'import', 'verhindert')),
  title           text not null,
  body            text not null default '',
  read            boolean not null default false,
  -- Aufgabe, um die es geht (migration-020): derselbe stabile Slot-Pfad wie in
  -- `confirmations`. Damit lässt sich eine erledigte Mitteilung wiederfinden
  -- („Ersatz gesucht", nachdem jemand eingesprungen ist) und eine abgelaufene
  -- erkennen. NULL bei Mitteilungen ohne Aufgabenbezug (Import, Einladung).
  task_key        text,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_task_key_idx
  on public.notifications (congregation_id, task_key);

-- Aufgaben-Bestätigungen: task_key = stabiler Slot-Pfad einer Zuteilung
-- (siehe partTaskKey/helperTaskKey in src/data/planning.ts). Jedes Mitglied
-- schreibt seinen eigenen Status; „offen“ = keine Zeile vorhanden.
create table if not exists public.confirmations (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  task_key        text not null,                    -- "0|mid|part|2|1|0" / "1|we|helper|mik|0"
  status          text not null check (status in ('bestätigt', 'verhindert')),
  created_at      timestamptz not null default now(),
  unique (congregation_id, task_key, user_id)
);

-- Web-Push-Abos: je Gerät, auf dem ein Mitglied Benachrichtigungen aktiviert
-- hat. send-reminders (Service-Role) verschickt darüber Erinnerungen.
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  -- App-Sprache dieses Geräts: Push-Text entsteht beim Versand und kann später
  -- nicht mehr übersetzt werden. null = Deutsch (Abos von vor migration-014).
  lang            text,
  created_at      timestamptz not null default now()
);

create index if not exists push_subscriptions_congregation_idx
  on public.push_subscriptions (congregation_id);

-- Treffpunkte für den Predigtdienst: Grundplan je Versammlung (fs_rules) und
-- die pro Woche materialisierten Treffpunkte samt Leitern (fs_weeks).
-- base = Montag der Woche 0 (Bezug für Wochentag/Datum der Treffpunkte).
create table if not exists public.fs_rules (
  congregation_id uuid primary key references public.congregations (id) on delete cascade,
  base            date,
  rules           jsonb not null default '[]'::jsonb  -- FsRule[]
);

create table if not exists public.fs_weeks (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  start           date not null,                    -- wie weeks.start (T66)
  data            jsonb not null,                   -- FsInstance[]
  unique (congregation_id, start)
);

create index if not exists fs_weeks_congregation_idx
  on public.fs_weeks (congregation_id);
create index if not exists fs_weeks_start_idx
  on public.fs_weeks (congregation_id, start);

-- Versand-Tagebuch der Erinnerungen: send-reminders trägt ein, wem es an
-- welchem Tag welche Art geschickt hat, und überspringt beim zweiten Lauf am
-- selben Tag die schon Erledigten — sonst käme dieselbe Push doppelt an.
--   kind: 'self'    persönliche Erinnerung an die eingeteilte Person
--         'planner' Sammelmeldung „nicht erreichbar" an die Planer
create table if not exists public.reminder_log (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null,
  sent_on         date not null default current_date,
  created_at      timestamptz not null default now(),
  unique (user_id, kind, sent_on)
);

create index if not exists reminder_log_sent_on_idx
  on public.reminder_log (sent_on);

-- Versand-Tagebuch der Zuteilungen: `send-plan` trägt ein, welcher Platz mit
-- welchem Namen schon gemeldet wurde. „Plan senden" verschickt daraufhin nur,
-- was fehlt — ohne das schickte ein zweiter Druck nach einer kleinen
-- Nachbesserung allen dieselbe Nachricht erneut. Der Name statt der Person-Id
-- als Schlüssel, weil auch Plätze ohne `pid` vorkommen (Altdaten, Hilfsdienste
-- als reine Zeichenkette); teilt der Planer um, ist der Name ein anderer und
-- die neue Person erfährt es.
create table if not exists public.assignment_log (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  task_key        text not null,
  name            text not null,
  person_id       uuid references public.persons (id) on delete set null,
  user_id         uuid references auth.users (id) on delete set null,
  sent_at         timestamptz not null default now(),
  unique (congregation_id, task_key, name)
);

create index if not exists assignment_log_cong_idx
  on public.assignment_log (congregation_id, task_key);

-- Einladungscodes: Planer erstellen sie, registrierte Nutzer treten damit der
-- Versammlung bei (redeem_invite unten) — kein SQL für neue Mitglieder nötig.
create table if not exists public.invites (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  code            text not null unique,             -- z. B. "K7TQ4M" (Großbuchstaben)
  person_id       uuid references public.persons (id) on delete set null,
  planner         boolean not null default false,
  created_at      timestamptz not null default now(),
  redeemed_by     uuid references auth.users (id) on delete set null,
  redeemed_at     timestamptz
);

-- ---------------------------------------------------------------------------
-- RLS-Hilfsfunktionen (security definer, um Rekursion über members zu vermeiden)
-- ---------------------------------------------------------------------------

create or replace function public.my_congregation_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select congregation_id from public.members where user_id = auth.uid()
$$;

create or replace function public.is_planner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select planner from public.members where user_id = auth.uid()),
    false
  )
$$;

-- Eigene Person des angemeldeten Kontos (members.person_id) — oder NULL, wenn
-- das Konto noch keiner Person zugeordnet ist. Grundlage dafür, dass jemand
-- seine eigenen Daten auch dann pflegen darf, wenn ein Import sie angelegt hat
-- (absences ohne user_id, migration-021).
create or replace function public.my_person_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select person_id from public.members where user_id = auth.uid()
$$;

-- Ist der aktuelle Nutzer Aufseher oder Gehilfe irgendeiner Predigtdienstgruppe?
-- Sie dürfen die Treffpunkte pflegen, ohne volle Planer-Rechte zu haben; die
-- Einschränkung auf die eigene Gruppe macht die App.
create or replace function public.is_group_overseer()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    join public.members m on m.congregation_id = g.congregation_id
    where m.user_id = auth.uid()
      and m.person_id is not null
      and (g.overseer_id = m.person_id or g.assistant_id = m.person_id)
  )
$$;

-- Anzeigename der eigenen Person — wie `personDisplayName()` in der App:
-- eigener Kurzname, sonst Vor- und Nachname. Nötig für den Altbestand, in dem
-- ein Platz nur einen Namen trägt und keine Person-Id (migration-022).
create or replace function public.mein_anzeigename()
returns text
language sql stable security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(p.dn), ''), btrim(p.fn || ' ' || p.ln))
    from public.persons p
   where p.id = public.my_person_id()
$$;

-- Gehört die Aufgabe hinter diesem Schlüssel der angemeldeten Person?
-- (migration-022). Die Zuteilung steht im JSONB der Woche; der `task_key`
-- trägt den Weg dorthin — Wochen-Kennung, Zusammenkunft, Platz. Nachgeschlagen
-- wird die Speicherform, nicht die Fachregel.
--
-- SCHLÜSSELFORMEN (src/data/planning.ts, src/data/fs.ts)
--   <woche>|<mid|we>|part|<iid>|<ni>          Programmpunkt, stabile Kennung
--   <woche>|<mid|we>|part|<si>|<ii>|<ni>      Programmpunkt, alte Position
--   <woche>|<mid|we>|aux|…                    dasselbe in der Zusätzlichen Klasse
--   <woche>|<mid|we>|ratgeber                 Ratgeber der Zusätzlichen Klasse
--   <woche>|<mid|we>|helper|<dienst>|<pos>    Hilfsdienst
--   fs|<montag>|<instanzId>                   Treffpunkt-Leitung
--
-- **Unbekannte Formen bleiben erlaubt.** Eine zu strenge Richtlinie bricht das
-- Bestätigen fast lautlos (der Client schreibt fire-and-forget); eine erfundene
-- Form trifft dagegen keinen Platz und bleibt wirkungslos.
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

-- ---------------------------------------------------------------------------
-- Row-Level-Security
-- ---------------------------------------------------------------------------

alter table public.congregations enable row level security;
alter table public.members       enable row level security;
alter table public.persons       enable row level security;
alter table public.services      enable row level security;
alter table public.groups        enable row level security;
alter table public.weeks         enable row level security;
alter table public.absences      enable row level security;
alter table public.notifications enable row level security;
alter table public.confirmations enable row level security;
alter table public.invites       enable row level security;

-- Versammlung: Mitglieder lesen ihre eigene; ändern nur Planer.
drop policy if exists congregations_select on public.congregations;
create policy congregations_select on public.congregations
  for select using (id = public.my_congregation_id());

drop policy if exists congregations_update on public.congregations;
create policy congregations_update on public.congregations
  for update using (id = public.my_congregation_id() and public.is_planner());

-- Mitglieder: eigene Zeile lesen; Planer sehen und verwalten alle ihrer
-- Versammlung (sich selbst entfernen ist gesperrt).
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select using (
    user_id = auth.uid()
    or (congregation_id = public.my_congregation_id() and public.is_planner())
  );

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete using (
    congregation_id = public.my_congregation_id()
    and public.is_planner()
    and user_id <> auth.uid()
  );

-- Personen / Dienste / Wochen: Versammlung liest, Planer schreibt.
drop policy if exists persons_select on public.persons;
create policy persons_select on public.persons
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists persons_write on public.persons;
create policy persons_write on public.persons
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists services_write on public.services;
create policy services_write on public.services
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

drop policy if exists weeks_select on public.weeks;
create policy weeks_select on public.weeks
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists weeks_write on public.weeks;
create policy weeks_write on public.weeks
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

-- Abwesenheiten: Versammlung liest; der Betroffene (auch bei importierten
-- Einträgen ohne Ersteller) oder ein Planer schreiben.
--
-- Entscheidend ist die **Person**, nicht der Ersteller (migration-023): Wer nur
-- die eigene `user_id` einträgt, kann damit keine fremde `person_id` daneben
-- setzen. Der Zweig über die eigene Zeile bleibt für Konten ohne verknüpfte
-- Person — deren Einträge tragen gar keine. Das `using` ist bewusst breiter als
-- das `with check`, damit Altbestand mit fremder Person noch löschbar ist.
drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select using (congregation_id = public.my_congregation_id());

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

-- Mitteilungen sind personalisiert (je Empfänger eine Zeile): jeder sieht/ändert/
-- löscht nur die eigenen. Planer erzeugen Zeilen für beliebige Empfänger der
-- Versammlung (Zuteilung/Import); Verhinderungs-Meldungen dürfen alle Mitglieder
-- erzeugen — aber nur an Planer (migration-022). Vorher ging freier Text an
-- jeden Empfänger der Versammlung.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (
    congregation_id = public.my_congregation_id()
    and user_id = auth.uid()
  );

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

-- Bestätigungen: Versammlung liest (Planer braucht den Überblick); jedes
-- Mitglied schreibt nur seine eigenen Zeilen — und nur zu Aufgaben, die ihm
-- auch gehören (migration-022). Ohne den zweiten Teil konnte ein Mitglied eine
-- **fremde** Aufgabe als bestätigt oder verhindert markieren: Der Planer sah
-- es so, die Erinnerung verstummte, beim Hilfsdienst lief die Ersatzsuche an.
drop policy if exists confirmations_select on public.confirmations;
create policy confirmations_select on public.confirmations
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists confirmations_write on public.confirmations;
create policy confirmations_write on public.confirmations
  for all
  using (congregation_id = public.my_congregation_id() and user_id = auth.uid())
  with check (
    congregation_id = public.my_congregation_id()
    and user_id = auth.uid()
    and public.task_gehoert_mir(task_key)
  );

-- Admins räumen beim Neu-Zuteilen den Status eines Slots ab (alle Nutzer-Zeilen)
drop policy if exists confirmations_delete_planner on public.confirmations;
create policy confirmations_delete_planner on public.confirmations
  for delete using (congregation_id = public.my_congregation_id() and public.is_planner());

-- Einladungen: nur Planer der Versammlung (Einlösen läuft über redeem_invite).
drop policy if exists invites_all on public.invites;
create policy invites_all on public.invites
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

-- Push-Abos: jedes Mitglied verwaltet nur seine eigenen Geräte.
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and congregation_id = public.my_congregation_id());

-- Treffpunkte: Versammlung liest; Planer UND Gruppenaufseher schreiben.
alter table public.fs_rules enable row level security;
alter table public.fs_weeks enable row level security;

drop policy if exists fs_rules_select on public.fs_rules;
create policy fs_rules_select on public.fs_rules
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists fs_rules_write on public.fs_rules;
create policy fs_rules_write on public.fs_rules
  for all
  using (congregation_id = public.my_congregation_id() and (public.is_planner() or public.is_group_overseer()))
  with check (congregation_id = public.my_congregation_id() and (public.is_planner() or public.is_group_overseer()));

drop policy if exists fs_weeks_select on public.fs_weeks;
create policy fs_weeks_select on public.fs_weeks
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists fs_weeks_write on public.fs_weeks;
create policy fs_weeks_write on public.fs_weeks
  for all
  using (congregation_id = public.my_congregation_id() and (public.is_planner() or public.is_group_overseer()))
  with check (congregation_id = public.my_congregation_id() and (public.is_planner() or public.is_group_overseer()));

-- Versand-Tagebuch: bewusst ohne Policy. RLS ohne Policy sperrt alles; die
-- Edge Function arbeitet mit der Service-Role und umgeht RLS.
alter table public.reminder_log enable row level security;

-- Zuteilungs-Tagebuch: die Versammlung darf **lesen** — der Planen-Screen zeigt
-- an jedem Platz, wann die Nachricht hinausging. Geschrieben wird nur von
-- `send-plan` mit der Service-Role: ein Client, der sich selbst als
-- „informiert" einträgt, könnte damit sonst Nachrichten unterdrücken.
alter table public.assignment_log enable row level security;

drop policy if exists assignment_log_select on public.assignment_log;
create policy assignment_log_select on public.assignment_log
  for select using (congregation_id = public.my_congregation_id());

-- ---------------------------------------------------------------------------
-- Beitritt per Einladungscode (security definer: der Beitretende hat noch
-- keine Mitgliedschaft und könnte invites/members selbst nicht schreiben).
-- Rückgabe: null = Erfolg, sonst Fehlercode ('already-member' | 'invalid-code').
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite(invite_code text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invites%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then
    return 'invalid-code';
  end if;
  if exists (select 1 from public.members where user_id = uid) then
    return 'already-member';
  end if;
  -- FOR UPDATE sperrt die Einladungszeile: lösen zwei Konten denselben Code
  -- gleichzeitig ein, wartet das zweite und sieht danach redeemed_by gesetzt
  -- (→ 'invalid-code'), statt dass beide ein Mitglied für dieselbe Person anlegen.
  select * into inv
  from public.invites
  where code = upper(trim(invite_code)) and redeemed_by is null
  for update;
  if not found then
    return 'invalid-code';
  end if;
  insert into public.members (user_id, congregation_id, person_id, planner, email)
  values (uid, inv.congregation_id, inv.person_id, inv.planner,
          coalesce(auth.jwt() ->> 'email', ''));
  update public.invites
  set redeemed_by = uid, redeemed_at = now()
  where id = inv.id;
  return null;
end;
$$;

revoke all on function public.redeem_invite(text) from public;
revoke all on function public.redeem_invite(text) from anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Erste Einrichtung (Beispiel — Werte anpassen und einmalig ausführen)
-- ---------------------------------------------------------------------------
-- 1. Versammlung anlegen:
--    insert into public.congregations (name, hall, meeting_times)
--    values ('Musterstadt', 'Hauptstraße 12', 'Di 19:00 · So 10:00');
--
-- 2. Ersten Benutzer (Koordinator) in Supabase anlegen (Dashboard →
--    Authentication → Add user), dann mit der Versammlung verknüpfen:
--    insert into public.members (user_id, congregation_id, planner, email)
--    values ('<auth-user-uuid>', '<congregation-uuid>', true, '<email>');
--
-- Alle weiteren Mitglieder brauchen kein SQL: In der App registrieren und
-- einen Einladungscode einlösen (Einstellungen → Mitglieder → Einladungen).
-- =============================================================================
