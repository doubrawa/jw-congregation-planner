-- =============================================================================
-- JW Congregation Planner — Datenbankschema (v1)
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (einmalig, idempotent formuliert).
--
-- **Diese Datei ist die einzige Quelle des Schemas.** Neben ihr stand bis zum
-- 17. September 2026 eine Kette von 25 Migrationen, die jede für sich
-- versicherte „Neuinstallationen brauchen diese Datei nicht — schema.sql
-- enthält alles". Zwei Quellen für dieselbe Sache laufen auseinander, und das
-- taten sie auch (fs_rules, fs_weeks, reminder_log fehlten hier monatelang).
-- Die App ist noch nicht ausgerollt, also wurde die Kette gestrichen: Wer die
-- Datenbank aufsetzt, führt diese Datei aus — mehr gibt es nicht. Änderungen am
-- Schema kommen hier hinein.
--
-- **Ändert sich eine Spalte, wird neu aufgebaut**, nicht migriert: `create table
-- if not exists` lässt eine bestehende Tabelle in Ruhe, eine geänderte
-- Definition erreicht sie also nicht. `neuaufbau.sql` daneben räumt dafür alle
-- Tabellen ab (ohne eigene Tabellenliste, damit sie nicht veralten kann);
-- danach diese Datei ausführen. Die Konten in `auth.users` bleiben dabei
-- bestehen — ihre Mitgliedschaft nicht, siehe „Erste Einrichtung" am Ende.
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
--
-- **Jeder Verweis auf eine Person, Gruppe oder einen Haushalt trägt die
-- Versammlung mit** — die Fremdschlüssel sind zusammengesetzt und zeigen auf
-- `(id, congregation_id)`. Deshalb steht auf `persons`, `groups` und
-- `households` neben dem Primärschlüssel ein `unique (id, congregation_id)`:
-- kein Versehen, sondern das Ziel dieser Fremdschlüssel. Ohne sie konnte eine
-- Zeile der Versammlung A auf eine Person der Versammlung B zeigen — RLS
-- verhindert das Lesen, nicht das Schreiben.
--
-- `on delete set null (spalte)` nennt ausdrücklich die Spalte, die genullt
-- wird. Ohne diese Liste nullte PostgreSQL **alle** Spalten des
-- Fremdschlüssels, also auch `congregation_id` — die `not null` ist, womit
-- jedes Löschen einer Person fehlschlüge. Die Schreibweise gibt es seit
-- PostgreSQL 15.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table if not exists public.congregations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                      -- "Musterstadt"
  hall          text not null default '',           -- "Hauptstraße 12"

  -- Regeltermin der beiden Zusammenkünfte: Wochentag als Zahl (0 = Sonntag …
  -- 6 = Samstag, dieselbe Zählung wie `FsRule.wd` und `Date#getDay()`) und die
  -- Uhrzeit als `time`.
  --
  -- Hier stand bis zum 17. September 2026 **eine Spalte** `meeting_times text`
  -- mit dem Anzeigetext „Di 19:00 · So 10:00", und aus der lasen drei
  -- verschiedene reguläre Ausdrücke Tag und Uhrzeit zurück — der erste Treffer
  -- war die Zusammenkunft unter der Woche, der zweite das Wochenende. Daran
  -- hängt alles, was ein Datum hat: Erinnerungen, Countdown, „Meine Aufgaben",
  -- das S-89-Formular. Die Muster kannten dabei nur die deutschen Kürzel
  -- (Mo|Di|…|So) in einer App mit 34 Bediensprachen, und ein unpassender Text
  -- fiel stumm auf Montag/Samstag zurück. Genau diese Rückleserei hat
  -- `src/data/types.ts` an drei Stellen als Fehlerursache vermerkt (T32 die
  -- Minuten, T33 das Lied, T30 der Termin einer Woche) — nur an der eigenen
  -- Regelzeit stand sie weiter.
  mid_wd        smallint not null default 2 check (mid_wd between 0 and 6),
  mid_time      time not null default '19:00',
  we_wd         smallint not null default 0 check (we_wd between 0 and 6),
  we_time       time not null default '10:00',

  -- Erinnerungen (Einstellungen → ERINNERUNGEN). Eigene Spalten statt eines
  -- JSONB-Beutels: die Grenzen sind damit zugesagt, nicht nur im Eingabefeld
  -- geprüft. `first` = Tage vorher, `last` = letzte Erinnerung (0 = am Tag).
  reminder_first  smallint not null default 7 check (reminder_first between 1 and 21),
  reminder_last   smallint not null default 1 check (reminder_last between 0 and 7),
  reminder_repeat boolean not null default false,

  -- Versammlungssprache und weitere Programmsprachen als **jw.org-Sprachcode**
  -- ("de", "en", "cmn-hant"), nicht als Anzeigename.
  --
  -- Bis zum 17. September 2026 stand hier der **deutsche** Name („Deutsch",
  -- „Arabisch (Ägypten)") — ein Eintrag aus einer Tabelle von 482 Namen, die
  -- aus dem „LESEN IN"-Umschalter der deutschen Wochenseite stammt. Der Import
  -- schlug ihn darin nach (`CONG_TO_JW[congLang] ?? 'de'`): Wird einer dieser
  -- Namen je berichtigt, holt die betroffene Versammlung ab dann wortlos das
  -- **deutsche** Arbeitsheft. Ein Name ist keine Kennung.
  cong_lang     text not null default 'de' check (cong_lang <> ''),
  prog_langs    text[] not null default '{}',

  -- Zusätzliche Klasse eingerichtet (jw.org S-38, Absatz 26).
  aux_class     boolean not null default false,

  created_at    timestamptz not null default now()
);

-- Haushalt (Familie). Personen desselben Haushalts gelten als Angehörige —
-- daran hängt die Gesprächspartner-Regel im Schülerteil.
--
-- Die Zeile trägt nichts als ihre Kennung, und das ist der Punkt: `persons.fam`
-- war eine frei vergebene UUID in einer `text`-Spalte **ohne Gegenstelle**.
-- Ein Tippfehler ergab einen stillen Ein-Personen-Haushalt, und ausräumen
-- konnte das niemand, weil es nichts gab, worauf man hätte zeigen können.
create table if not exists public.households (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (id, congregation_id)                      -- Ziel des Verweises aus persons
);

create index if not exists households_congregation_idx
  on public.households (congregation_id);

create table if not exists public.persons (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  fn              text not null default '',
  ln              text not null default '',
  dn              text not null default '', -- abweichender Anzeigename bei Namensgleichheit; leer = "Vorname Nachname"
  role            text not null default 'verkuendiger'
                  check (role in ('aeltester', 'dienstamtgehilfe', 'verkuendiger', 'keine')),
  female          boolean not null default false,   -- Schwester (Partner-Zuordnung, Brüder-Bereiche)
  tel             text not null default '',
  mail            text not null default '',
  -- Qualifications: feste Programm-Bereiche (vorsitzMid/vorsitzWe/vortrag/gebet/
  -- bibellesung/leser/schulung/schulungPartner/studium/treffpunkt + wtLeiter/
  -- wtVertreter) plus je Hilfsdienst ein dynamischer Schlüssel `svc:<key>`.
  priv            jsonb not null default '{}'::jsonb,

  -- **Vormerkung** des Planer-Rechts, nicht das Recht selbst: Sie wandert beim
  -- Einladen in `invites.planner` und von dort in `members.planner`, damit
  -- jemand das Recht schon bei der ersten Anmeldung hat. Wirksam ist allein
  -- `members.planner` — daran hängt `is_planner()`.
  --
  -- Die Spalte hieß bis zum 17. September 2026 ebenfalls `planner`, und dieser
  -- eine Name für zwei verschiedene Tatsachen war der ganze Fehler: Der
  -- Personen-Neuaufbau aus New World Scheduler schreibt sie nicht mit, also
  -- stand sie bei allen auf `false` — und der Personen-Bildschirm zeigte dem
  -- Betreiber „Admin: aus", während er Admin war (PlannerToggle).
  planner_vorgemerkt boolean not null default false,

  -- Haushalt; null = keiner. Wird beim Löschen des Haushalts genullt.
  fam             uuid,
  created_at      timestamptz not null default now(),

  unique (id, congregation_id),                     -- Ziel der Verweise auf eine Person
  constraint persons_fam_fk foreign key (fam, congregation_id)
    references public.households (id, congregation_id) on delete set null (fam)
);

create index if not exists persons_congregation_idx
  on public.persons (congregation_id);
create index if not exists persons_fam_idx
  on public.persons (fam) where fam is not null;

create table if not exists public.services (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  key             text not null,                    -- 'ton', 'mik', … / 'svc-<uuid>'
  name            text not null,
  count           integer not null default 1 check (count between 1 and 6),
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
  overseer_id     uuid,
  assistant_id    uuid,
  position        integer not null default 0,       -- Anzeigereihenfolge
  created_at      timestamptz not null default now(),

  unique (id, congregation_id),                     -- Ziel der Verweise auf eine Gruppe
  constraint groups_overseer_fk foreign key (overseer_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (overseer_id),
  constraint groups_assistant_fk foreign key (assistant_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (assistant_id)
);

create index if not exists groups_congregation_idx
  on public.groups (congregation_id);

-- Gruppenzuordnung der Person (nachträglich, da groups erst hier existiert).
-- `drop constraint if exists` davor, damit ein erneuter Lauf dieselbe
-- Bedingung nicht ein zweites Mal anzulegen versucht.
alter table public.persons
  add column if not exists grp uuid;
alter table public.persons
  drop constraint if exists persons_grp_fk;
alter table public.persons
  add constraint persons_grp_fk foreign key (grp, congregation_id)
    references public.groups (id, congregation_id) on delete set null (grp);

-- Trägt das Nullen beim Löschen einer Gruppe; ohne ihn liest PostgreSQL dafür
-- die ganze Personentabelle.
create index if not exists persons_grp_idx
  on public.persons (grp) where grp is not null;

create table if not exists public.members (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  -- Verknüpfte Person; null = Konto ohne Person.
  --
  -- Dies war die **einzige** Beziehung auf eine Person ohne Fremdschlüssel, und
  -- entsprechend räumte die App sie von Hand (`saveMemberRow({…, personId:
  -- null})` beim Löschen einer Person). Wer eine Person per Skript löschte,
  -- hinterließ eine Zeile, deren `my_person_id()` ins Leere zeigt.
  person_id       uuid,
  planner         boolean not null default false,   -- sieht Planen/Personen/Einstellungen
  email           text not null default '',         -- Anzeige im Mitglieder-Panel
  created_at      timestamptz not null default now(),

  constraint members_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (person_id)
);

create index if not exists members_congregation_idx
  on public.members (congregation_id);

create table if not exists public.weeks (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  -- Kennung der Woche (T66): ihr Montag. Keine Ordnungszahl -- die stand hier
  -- einmal als `position` daneben und war zugleich Kennung, mit allem, was
  -- daran hing (`task_key`, Platzhalter, jede Einfuegung in der Mitte). Immer
  -- Montag, weil jw.org die Programmwoche selbst so definiert ("2.-8. Maerz
  -- 2026"). Sortiert wird danach — und die Bedingung sagt es zu, statt es zu
  -- hoffen: ein Schluessel, der auf einen Dienstag faellt, findet nie wieder
  -- seine Woche.
  start           date not null check (extract(isodow from start) = 1),
  data            jsonb not null,                   -- Week-Objekt aus src/data/types.ts
  -- Stand der Zeile. Wer schreibt, nennt den Stand, auf dem seine Fassung
  -- beruht (siehe saveWeek); trifft er nicht mehr zu, war ein anderer Planer
  -- schneller und der Schreibvorgang findet keine Zeile. Gesetzt wird er vom
  -- Trigger, nicht vom Client — sonst schriebe man sich daran vorbei.
  updated_at      timestamptz not null default now(),
  -- Legt zugleich den Index an, über den jede Wochen-Abfrage läuft
  -- (`congregation_id` + Sortierung nach `start`). Ein zweiter Index auf
  -- denselben beiden Spalten stand hier und trug nichts bei.
  unique (congregation_id, start)
);

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
  -- Ersteller; NULL = importiert, z. B. aus New World Scheduler.
  -- Die Abwesenheit hängt fachlich an `person_id`, nicht am Konto: Die meisten
  -- Verkündiger haben gar keines. Deshalb `set null` statt `cascade` — ein
  -- gelöschtes Konto nahm die Abwesenheit der Person sonst mit, und die
  -- Planung teilte den Verreisten wieder ein.
  user_id         uuid references auth.users (id) on delete set null,
  person_id       uuid,
  from_date       date not null,
  to_date         date not null,
  reason          text not null default '',
  created_at      timestamptz not null default now(),

  -- Ein Zeitraum, dessen Ende vor seinem Anfang liegt, sperrt niemanden und
  -- bedeutet nichts. Der NWS-Import prüft das seit jeher selbst („verdreht") —
  -- weil die Datenbank es zuließ.
  constraint absences_zeitraum check (to_date >= from_date),
  constraint absences_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (person_id)
);

create index if not exists absences_congregation_idx
  on public.absences (congregation_id);
create index if not exists absences_person_idx
  on public.absences (person_id) where person_id is not null;

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade, -- Empfänger
  type            text not null default 'zuteilung'
                  check (type in ('zuteilung', 'erinnerung', 'gesendet', 'import', 'verhindert')),
  title           text not null,
  body            text not null default '',
  read            boolean not null default false,
  -- Aufgabe, um die es geht: derselbe stabile Slot-Pfad wie in
  -- `confirmations`. Damit lässt sich eine erledigte Mitteilung wiederfinden
  -- („Ersatz gesucht", nachdem jemand eingesprungen ist) und eine abgelaufene
  -- erkennen. NULL bei Mitteilungen ohne Aufgabenbezug (Import, Einladung).
  task_key        text,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_task_key_idx
  on public.notifications (congregation_id, task_key);

-- Die Glocke: die jüngsten 50 Zeilen des angemeldeten Kontos. Die einzige
-- Abfrage dieser Tabelle, die wächst — und sie hatte als einzige keinen Index.
create index if not exists notifications_feed_idx
  on public.notifications (congregation_id, user_id, created_at desc);

-- Aufgaben-Bestätigungen: task_key = stabiler Slot-Pfad einer Zuteilung
-- (siehe partTaskKey/helperTaskKey in src/data/planning.ts). Jedes Mitglied
-- schreibt seinen eigenen Status; „offen“ = keine Zeile vorhanden.
create table if not exists public.confirmations (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  task_key        text not null,                    -- "2026-09-07|mid|part|a1b2c3d4|0"
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
  -- nicht mehr übersetzt werden. null = Deutsch.
  lang            text,
  created_at      timestamptz not null default now()
);

create index if not exists push_subscriptions_congregation_idx
  on public.push_subscriptions (congregation_id);

-- Treffpunkte für den Predigtdienst: der Grundplan (fs_rules — eine Zeile je
-- Regel) und die daraus pro Woche materialisierten Treffpunkte samt Leitern
-- (fs_weeks, als JSONB wie die Wochen).
--
-- Der Grundplan war bis zum 17. September 2026 ein JSONB-Blob je Versammlung.
-- Er ist aber das Gegenteil eines Blobs: lauter gleichförmige Zeilen, von denen
-- jede auf eine Gruppe zeigt. Weil dieser Verweis im JSON steckte, musste die
-- App beim Löschen einer Gruppe selbst darin aufräumen (`fsGruppeEntfernen`) —
-- eine Handarbeit, die ein Fremdschlüssel erledigt.
--
-- Daneben stand eine Spalte `base` (Montag der Woche 0). Sie wurde bei jedem
-- Speichern mitgeschrieben und **nie gelesen**: Der Ladevorgang leitet die
-- Basis aus den Wochen selbst ab (`fsBaseFromWeeks`), ausdrücklich „unabhängig
-- von der gespeicherten Basis". Sie ist weg.
create table if not exists public.fs_rules (
  -- **`text`, nicht `uuid`** — und das ist kein Versehen: Die Kennung vergibt
  -- der Client (`r<uuid>`, siehe `fsRuleAdd` im Reducer), das führende `r`
  -- hält sie im Aufgaben-Schlüssel (`fs|<montag>|<instanzId>`) lesbar. Eine
  -- `uuid`-Spalte wiese jede einzelne Regel ab, und weil die Schreibschicht
  -- fire-and-forget arbeitet, bliebe davon nur ein Fehler-Toast.
  id              text primary key check (id <> ''),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  -- Gruppentreffpunkt; null = Versammlungstreffpunkt (alle).
  grp             uuid,
  wd              smallint not null check (wd between 0 and 6),  -- 0 = Sonntag
  time            time not null,
  place           text not null default '',
  monthly         smallint not null default 0 check (monthly between 0 and 4), -- 0 = jede Woche
  skip_cong       boolean not null default false,   -- entfällt, wenn am selben Tag ein Versammlungstreffpunkt ist
  created_at      timestamptz not null default now(),

  constraint fs_rules_grp_fk foreign key (grp, congregation_id)
    references public.groups (id, congregation_id) on delete cascade
);

create index if not exists fs_rules_congregation_idx
  on public.fs_rules (congregation_id);

create table if not exists public.fs_weeks (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  start           date not null check (extract(isodow from start) = 1), -- wie weeks.start (T66)
  data            jsonb not null,                   -- FsInstance[]
  -- Wie bei `weeks`: diese Bedingung ist zugleich der Index für beide
  -- Abfragewege (nach Versammlung, sortiert nach Kennung).
  unique (congregation_id, start)
);

-- Versand-Tagebuch der Erinnerungen: send-reminders trägt ein, wem es an
-- welchem Tag welche Art geschickt hat, und überspringt beim zweiten Lauf am
-- selben Tag die schon Erledigten — sonst käme dieselbe Push doppelt an.
--   kind: 'self'    persönliche Erinnerung an die eingeteilte Person
--         'planner' Sammelmeldung „nicht erreichbar" an die Planer
create table if not exists public.reminder_log (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('self', 'planner')),
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
-- als Schlüssel, weil auch Plätze ohne `pid` vorkommen (Reinigungsgruppen, von
-- Hand eingetragener Text); teilt der Planer um, ist der Name ein anderer und
-- die neue Person erfährt es.
create table if not exists public.assignment_log (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  task_key        text not null,
  name            text not null,
  person_id       uuid,
  user_id         uuid references auth.users (id) on delete set null,
  sent_at         timestamptz not null default now(),
  -- Ein eigener Index auf (congregation_id, task_key) stand hier einmal und
  -- trug nichts bei: Diese Bedingung legt schon einen über
  -- (congregation_id, task_key, name) an, und Postgres nutzt dessen führende
  -- Spalten für dieselben Abfragen. Beide Leser filtern ohnehin nur nach
  -- `congregation_id`.
  unique (congregation_id, task_key, name),
  constraint assignment_log_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (person_id)
);

-- Einladungscodes: Planer erstellen sie, registrierte Nutzer treten damit der
-- Versammlung bei (redeem_invite unten) — kein SQL für neue Mitglieder nötig.
create table if not exists public.invites (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  code            text not null unique,             -- z. B. "K7TQ4M" (Großbuchstaben)
  person_id       uuid,
  planner         boolean not null default false,
  created_at      timestamptz not null default now(),
  redeemed_by     uuid references auth.users (id) on delete set null,
  redeemed_at     timestamptz,

  constraint invites_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (person_id)
);

create index if not exists invites_congregation_idx
  on public.invites (congregation_id);

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
-- (absences ohne user_id).
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
-- eigener Kurzname, sonst Vor- und Nachname. Gebraucht für Plätze, die nur
-- einen Namen tragen und keine Person-Id: Ein Import ordnet einen mehrdeutigen
-- Namen bewusst keiner Person zu, und von Hand eingetragener Text hat gar keine.
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
-- Die Zuteilung steht im JSONB der Woche; der `task_key` trägt den Weg dorthin
-- — Wochen-Kennung, Zusammenkunft, Platz. Nachgeschlagen wird die
-- Speicherform, nicht die Fachregel.
--
-- SCHLÜSSELFORMEN (src/data/planning.ts, src/data/fs.ts)
--   <woche>|<mid|we>|part|<iid>|<ni>          Programmpunkt, stabile Kennung
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
    -- `to_char` statt `start::text`: die Textform eines `date` hängt an der
    -- Einstellung `DateStyle`. Steht sie einmal nicht auf ISO, verglichen wir
    -- „07.09.2026" mit „2026-09-07" — und niemand dürfte mehr bestätigen.
    select e into slot
      from public.fs_weeks w, jsonb_array_elements(w.data) e
     where w.congregation_id = cong
       and to_char(w.start, 'YYYY-MM-DD') = teile[2]
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
   where w.congregation_id = cong and to_char(w.start, 'YYYY-MM-DD') = teile[1];
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

  else
    return true; -- keine der bekannten Formen
  end if;

  if slot is null then return false; end if;

  -- Ein Platz ist ein Objekt `{ name, pid? }` — in jeder der vier Platzsorten.
  -- Hier stand ein zweiter Zweig für Hilfsdienst-Plätze als reine Zeichenkette;
  -- diese Form gab es im Altbestand und schreibt der Client seit der
  -- Altlasten-Räumung (T104) nirgends mehr.
  return slot->>'pid' = meine::text
      or (slot->>'pid' is null and slot->>'name' = public.mein_anzeigename());
end $$;

-- ---------------------------------------------------------------------------
-- Row-Level-Security
-- ---------------------------------------------------------------------------

alter table public.congregations enable row level security;
alter table public.households    enable row level security;
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

-- Personen / Haushalte / Dienste / Wochen: Versammlung liest, Planer schreibt.
drop policy if exists persons_select on public.persons;
create policy persons_select on public.persons
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists persons_write on public.persons;
create policy persons_write on public.persons
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

-- Haushalte trägt niemand für sich ein: Sie entstehen und vergehen mit der
-- Zuordnung im Personen-Detail, und die macht ein Planer.
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists households_write on public.households;
create policy households_write on public.households
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
-- Entscheidend ist die **Person**, nicht der Ersteller: Wer nur
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
-- erzeugen — aber nur an Planer. Ohne diese Grenze ginge freier Text an
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
-- auch gehören. Ohne den zweiten Teil konnte ein Mitglied eine
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

-- Beim Neu-Zuteilen den Status eines Platzes abräumen (alle Nutzer-Zeilen):
-- Planer überall, Gruppenaufseher bei den Treffpunkten, die sie selbst
-- besetzen.
drop policy if exists confirmations_delete_planner on public.confirmations;
create policy confirmations_delete_planner on public.confirmations
  for delete using (
    congregation_id = public.my_congregation_id()
    and (
      public.is_planner()
      or (public.is_group_overseer() and task_key like 'fs|%')
    )
  );

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
-- 1. Versammlung anlegen (Zusammenkünfte: 0 = Sonntag … 6 = Samstag):
--    insert into public.congregations (name, hall, mid_wd, mid_time, we_wd, we_time)
--    values ('Musterstadt', 'Hauptstraße 12', 2, '19:00', 0, '10:00');
--
-- 2. Ersten Benutzer (Koordinator) in Supabase anlegen (Dashboard →
--    Authentication → Add user), dann mit der Versammlung verknüpfen:
--    insert into public.members (user_id, congregation_id, planner, email)
--    values ('<auth-user-uuid>', '<congregation-uuid>', true, '<email>');
--
-- Beides erledigt auch `scripts/versammlung-anlegen.mjs`.
--
-- Alle weiteren Mitglieder brauchen kein SQL: In der App registrieren und
-- einen Einladungscode einlösen (Einstellungen → Mitglieder → Einladungen).
-- =============================================================================
