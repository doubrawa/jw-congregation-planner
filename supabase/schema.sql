-- =============================================================================
-- Versammlung.app — Datenbankschema (v1)
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
--     und zwei Rechten: `planner` — der **Admin**, der alles darf, auch
--     Personen und Einstellungen (`is_planner()`) — und `zuteiler` — der
--     **Planer**, der seit dem 15.10.2026 alles plant wie der Admin, nur
--     Personen und Einstellungen nicht (`darf_zuteilen()`).
--   * Row-Level-Security überall: Mitglieder lesen nur ihre Versammlung,
--     schreiben dürfen (bis auf eigene Abwesenheiten, eigene Zusagen und
--     Gelesen-Status) nur Admin und Planer, Personen und Einstellungen nur der
--     Admin. Damit sind die personenbezogenen Daten versammlungsintern
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

  -- Zusätzliche Klasse eingerichtet (jw.org S-38, Absatz 27).
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
  -- Vor- und Nachname. Zusammen eindeutig je Versammlung — siehe den Index
  -- `persons_name_eindeutig` unter dieser Tabelle. Bis T110 stand daneben ein
  -- Feld `dn` für einen abweichenden Anzeigenamen; es ist entfallen, weil es
  -- nur nötig war, solange zwei Personen gleich heißen konnten.
  fn              text not null default '',
  ln              text not null default '',
  role            text not null default 'verkuendiger'
                  check (role in ('aeltester', 'dienstamtgehilfe', 'verkuendiger', 'keine')),
  female          boolean not null default false,   -- Schwester (Partner-Zuordnung, Brüder-Bereiche)
  mail            text not null default '',
  -- Qualifications: feste Programm-Bereiche (vorsitzMid/vorsitzWe/vortrag/gebet/
  -- bibellesung/leser/schulung/schulungPartner/studium/treffpunkt + wtLeiter/
  -- wtVertreter) plus je Hilfsdienst ein dynamischer Schlüssel `svc:<key>`.
  priv            jsonb not null default '{}'::jsonb,

  -- **Vormerkung** des Planer-Rechts, nicht das Recht selbst: Bei der ersten
  -- Anmeldung übernimmt die Function `anmelden` sie in `members.planner`
  -- (T121, Phase 8), damit jemand das Recht gleich hat. Wirksam ist allein
  -- `members.planner` — daran hängt `is_planner()`.
  --
  -- Die Spalte hieß bis zum 17. September 2026 ebenfalls `planner`, und dieser
  -- eine Name für zwei verschiedene Tatsachen war der ganze Fehler: Der
  -- Personen-Neuaufbau aus New World Scheduler schreibt sie nicht mit, also
  -- stand sie bei allen auf `false` — und der Personen-Bildschirm zeigte dem
  -- Betreiber „Admin: aus", während er Admin war (PlannerToggle).
  planner_vorgemerkt boolean not null default false,
  -- Dasselbe für das Planer-Recht (4.10.2026): bei der ersten Anmeldung in
  -- `members.zuteiler`.
  zuteiler_vorgemerkt boolean not null default false,

  -- Haushalt; null = keiner. Wird beim Löschen des Haushalts genullt.
  fam             uuid,
  created_at      timestamptz not null default now(),

  unique (id, congregation_id),                     -- Ziel der Verweise auf eine Person
  constraint persons_fam_fk foreign key (fam, congregation_id)
    references public.households (id, congregation_id) on delete set null (fam)
);

-- Nachträglich (4.10.2026), wie `members.zuteiler`.
alter table public.persons
  add column if not exists zuteiler_vorgemerkt boolean not null default false;

-- Entfernt (25.10.2026): die Telefonnummer. Angezeigt wurde sie nirgends,
-- New World Scheduler liefert keine, und gebraucht hat sie niemand. Ein
-- zweiter Lauf findet nichts mehr; die Zeile kann fort, sobald sie überall
-- eingespielt ist.
alter table public.persons drop column if exists tel;

create index if not exists persons_congregation_idx
  on public.persons (congregation_id);
create index if not exists persons_fam_idx
  on public.persons (fam) where fam is not null;

-- Vor- und Nachname sind je Versammlung EINDEUTIG (T110).
--
-- Warum in der Datenbank und nicht nur in der App: Der Name steht in jeder
-- Zuteilung neben der Person-Id, und an jedem Platz OHNE Id (Hilfsdienste,
-- Freitext, Import, `mein_anzeigename()` weiter unten) ordnet er allein zu.
-- Zwei Gleichnamige teilten sich dort still ihre Aufgaben. Die Prüfung in der
-- App ist die freundliche Auskunft am Feld; sie hält aber weder einen zweiten
-- Planer auf, der zeitgleich tippt, noch einen offenen alten Tab, noch die
-- Wartungsskripte. Der Index hält alle drei.
--
-- Verglichen wird der ANGEZEIGTE Name, wie ihn `namensSchluessel()` in der App
-- rechnet: Vor- und Nachname mit einem Leerzeichen verbunden, mehrfache
-- Leerzeichen zusammengezogen, ohne Rand, klein geschrieben. Akzente bleiben
-- unterschieden — Müller und Muller dürfen zwei Menschen sein.
--
-- Namenlose bleiben draußen: Eine frisch angelegte Person hat noch keinen
-- Namen, und zwei davon nebeneinander sind keine Dublette.
create unique index if not exists persons_name_eindeutig
  on public.persons (congregation_id, lower(btrim(regexp_replace(fn || ' ' || ln, '\s+', ' ', 'g'))))
  where btrim(fn || ' ' || ln) <> '';

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
  -- Aus der Reinigung genommen: Die Rotation überspringt die Gruppe
  -- (18.10.2026). Jede Gruppe reinigt, bis sie herausgenommen wird.
  ohne_reinigung  boolean not null default false,
  created_at      timestamptz not null default now(),

  unique (id, congregation_id),                     -- Ziel der Verweise auf eine Gruppe
  constraint groups_overseer_fk foreign key (overseer_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (overseer_id),
  constraint groups_assistant_fk foreign key (assistant_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (assistant_id)
);

-- Nachträglich (18.10.2026) — eine schon angelegte Tabelle bekommt die Spalte
-- hier; jede bestehende Gruppe reinigt damit weiter.
alter table public.groups
  add column if not exists ohne_reinigung boolean not null default false;

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
  planner         boolean not null default false,   -- „Admin": darf alles (`is_planner()`)
  -- „Planer" (4.10.2026): plant seit dem 15.10.2026 alles wie der Admin —
  -- Personen und Einstellungen nicht. Ein Admin hat das Recht ohnehin;
  -- gefragt wird es über `darf_zuteilen()`.
  zuteiler        boolean not null default false,
  email           text not null default '',         -- Anzeige im Mitglieder-Panel
  created_at      timestamptz not null default now(),

  constraint members_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (person_id)
);

-- Nachträglich (4.10.2026) — eine schon angelegte Tabelle bekommt die Spalte hier.
alter table public.members
  add column if not exists zuteiler boolean not null default false;

create index if not exists members_congregation_idx
  on public.members (congregation_id);

-- **Ohne Versammlung kein Konto** (21.10.2026): Geht die Mitgliedschaft, geht
-- das Konto mit. Ohne Versammlung ist die App nicht zu nutzen (Betreiber), und
-- ein Konto hat höchstens eine (`user_id` ist der Schlüssel). Damit enden seine
-- Sitzungen auf allen Geräten. Ein schon ausgestelltes Zugangstoken gilt bis zu
-- seinem Ablauf (höchstens eine Stunde) und sieht ohne Mitgliedschaft nichts —
-- es sei denn, die Person wird in dieser Stunde neu eingeladen: Das neue Konto
-- trägt wieder ihre Person-Id. Was nur dem Konto gehört — Zusagen, Glocke,
-- Push-Abos, Erinnerungs-Tagebuch — geht per Kaskade mit. Abwesenheiten und das
-- Zuteilungs-Tagebuch behalten ihre Zeile ohne Konto (`on delete set null`),
-- die Absagen hängen an der Person.
--
-- Bis dahin blieb das Konto stehen. Bekam die Person später einen neuen Link,
-- war es wieder dasselbe (Konto-Id = Person-Id, Function `anmelden`) — und mit
-- ihm jede alte Sitzung, auch die eines verlorenen Handys, samt Push-Abo. Ein
-- neuer Link legt jetzt ein frisches Konto an.
--
-- Eine Mitgliedschaft löschen der Admin in der App (ein Konto entfernen, seit
-- dem 21.10.2026 auch mit seiner Person) und das Löschen einer ganzen
-- Versammlung (Kaskade). Nicht betroffen: `neuaufbau.sql` (ein `drop table`
-- löst keinen Trigger aus) und das Zurücksetzen, das die Mitgliedschaften
-- behält. Löscht Supabase das Konto selbst, findet das Löschen hier keine Zeile
-- mehr. Security definer, weil nur der Eigentümer in `auth.users` löschen darf.
create or replace function public.konto_mit_mitgliedschaft_loeschen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = old.user_id;
  return old;
end;
$$;

revoke all on function public.konto_mit_mitgliedschaft_loeschen() from public;
revoke all on function public.konto_mit_mitgliedschaft_loeschen() from anon, authenticated;

drop trigger if exists members_konto_loeschen on public.members;
create trigger members_konto_loeschen
  after delete on public.members
  for each row execute function public.konto_mit_mitgliedschaft_loeschen();

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

-- Aufgaben-Bestätigungen: task_key = stabiler Schlüssel einer Zuteilung
-- (gebaut in supabase/functions/_shared/aufgaben-schluessel.ts). Jedes Mitglied
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

-- Absagen (T126, Betreiber 17.10.2026: „ja"): In `confirmations` steht eine
-- Absage nur, bis der Platz neu besetzt ist — dann räumt die App seine Zeilen
-- ab (`confirmations_delete_planner`). Für die Auswertung („Absagen je
-- Bereich") bleibt sie hier ein Jahr stehen, wie die Woche, zu der sie gehört.
-- Nur wer, welcher Platz, welche Woche — keine Nachricht, kein Konto.
-- Geschrieben allein vom Trigger an `confirmations` (`absage_vermerken`).
create table if not exists public.absagen (
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  person_id       uuid not null,
  task_key        text not null,
  woche           date not null,
  created_at      timestamptz not null default now(),
  primary key (congregation_id, task_key, person_id),
  -- Geht die Person, gehen ihre Absagen mit: Gezählt werden sie für sie.
  constraint absagen_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete cascade
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
-- Speichern mitgeschrieben und **nie gelesen**: Der Client leitete die Basis
-- aus den Wochen selbst ab, ausdrücklich „unabhängig von der gespeicherten
-- Basis". Sie ist weg — und seit dem 25.9.2026 auch die Basis im Client:
-- Jede Treffpunkt-Woche hängt an `weeks.start` der Woche daneben.
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
  -- Montage, in denen die Regel ausgesetzt ist: Der Planer hat ihren Treffpunkt
  -- dort entfernt. In `fs_weeks` allein hielt das nicht — die App baut die
  -- Wochen beim Laden aus den Regeln neu.
  aus             date[] not null default '{}',
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

-- Stand der Treffpunkt-Woche (15.10.2026) — derselbe Schutz wie
-- `weeks.updated_at` (T39): Wer schreibt, nennt den Stand, auf dem seine
-- Fassung beruht (`saveFsWeek`). Die Treffpunkte einer Woche sind **eine**
-- Liste; ohne Stand schrieb, wer mit einem älteren Stand schrieb, die
-- Änderung eines anderen an derselben Woche still zurück. Gesetzt vom
-- Trigger, nicht vom Client.
alter table public.fs_weeks
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists fs_weeks_touch_updated_at on public.fs_weeks;
create trigger fs_weeks_touch_updated_at
  before update on public.fs_weeks
  for each row execute function public.touch_updated_at();

-- Besuche des Dienstaufsehers bei den Predigtdienstgruppen (T120, Phase 2).
-- Gemessen am Buch „Organisiert, Jehovas Willen zu tun", Kap. 5 Abs. 36: je
-- Monat an einem Wochenende eine andere Gruppe; dabei leitet er die
-- Zusammenkünfte für den Predigtdienst. In der App wird der Besucher deshalb
-- Leiter der Treffpunkte der Gruppe (`fs_weeks`) — Zusage und Erinnerung laufen
-- darüber, nicht über diese Tabelle.
--
-- Eine Zeile je Besuch, kein Blob: So wie beim Grundplan (`fs_rules`) sind
-- Gruppe und Besucher Fremdschlüssel, und zwei Planer überschreiben sich nicht
-- gegenseitig. Die Woche ist ein Montag wie `weeks.start`, darf aber in der
-- Zukunft liegen, die noch nicht importiert ist — dann ist der Besuch
-- vorgemerkt und wird mit dem Import eingetragen.
create table if not exists public.gruppenbesuche (
  -- `text` wie bei `fs_rules`: Die Kennung vergibt der Client (`b<uuid>`).
  id              text primary key check (id <> ''),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  woche           date not null check (extract(isodow from woche) = 1),
  grp             uuid not null,
  -- Der Besucher; null, wenn seine Person gelöscht wurde. Der Besuch bleibt
  -- dann stehen, und der Planer setzt einen anderen ein.
  person_id       uuid,
  created_at      timestamptz not null default now(),

  -- Dieselbe Gruppe nur einmal je Woche — zugleich der Index fürs Laden.
  unique (congregation_id, woche, grp),
  constraint gruppenbesuche_grp_fk foreign key (grp, congregation_id)
    references public.groups (id, congregation_id) on delete cascade,
  constraint gruppenbesuche_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (person_id)
);

-- Vorgemerkte öffentliche Vorträge aus dem Vortragsplan (T122). Der
-- Vortragskoordinator plant in einem eigenen Programm Monate voraus; die Woche
-- gibt es in der App erst mit ihrem Programm von jw.org. Bis dahin steht der
-- Vortrag hier und wird beim Anlegen der Woche eingetragen
-- (`neueWocheEinordnen`) — danach gehört er der Woche, und der nächste Import
-- räumt die Zeile ab.
--
-- **Von auswärtigen Rednern nur Name und Versammlung** (Vorgabe des
-- Betreibers, 12.10.2026): keine Telefonnummer, keine E-Mail. Die bleiben im
-- Planungsprogramm; die App liest dessen Datei auf dem Gerät und schickt nur
-- diese Spalten.
create table if not exists public.vortraege (
  -- `text` wie bei `gruppenbesuche`: Die Kennung vergibt der Client (`v<uuid>`).
  id              text primary key check (id <> ''),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  woche           date not null check (extract(isodow from woche) = 1),
  redner          text not null check (redner <> ''),
  -- Heimatversammlung des Gastredners; leer beim eigenen Redner.
  versammlung     text not null default '',
  eigener         boolean not null default false,
  -- Der eigene Redner, wenn er über den Namen eindeutig zu finden war; null,
  -- wenn nicht oder wenn seine Person gelöscht wurde — dann zählt der Name.
  person_id       uuid,
  thema           text not null default '',
  lied            text not null default '' check (lied ~ '^[0-9]{0,3}$'),

  -- Ein Vortrag je Woche — zugleich der Index fürs Laden.
  unique (congregation_id, woche),
  constraint vortraege_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (person_id)
);

-- Trolleys (T121, Phase 7 — seit 14.10.2026; davor Stand und Schicht, siehe
-- „Entfernt" unten). „Man steht mit dem Trolley ja nur 15 Minuten an einem
-- Platz … was man eigentlich braucht, ist ein Terminplan, wo man sich
-- verabreden kann" (der Betreiber, 11.10.2026). Die Versammlung legt ihre
-- **Trolleys** an, mit dem Ort, an dem man sie abholt; wer das Trolley-Recht
-- hat (`persons.priv.zeugnis`), trägt sich ein — frei von 6 bis 22 Uhr in
-- halben Stunden, mit Partner oder allein mit „Partner gesucht". Niemand
-- plant, niemand sagt zu.
create table if not exists public.trolleys (
  -- `text` wie bei `fs_rules`: Die Kennung vergibt der Client (`t<uuid>`).
  id              text primary key check (id <> ''),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  name            text not null check (btrim(name) <> ''),
  -- Wo man ihn abholt („Depot", „Königreichssaal").
  ort             text not null default '',
  -- Freiwillig, etwa „Schlüssel im Fach neben der Bühne".
  hinweis         text not null default '',
  created_at      timestamptz not null default now(),

  unique (id, congregation_id)                      -- Ziel der Verweise der Termine
);

create index if not exists trolleys_congregation_idx
  on public.trolleys (congregation_id);

-- Ein **Termin**: ein Trolley, ein Tag, eine Zeit — und eine oder zwei
-- Personen. Geschrieben wird er nur von der Edge Function `trolley`
-- (Eintragen, Dazukommen, Austragen): Sie prüft das Recht und sagt dem
-- Partner Bescheid. Ein Mitglied liest nur (Richtlinien unten).
create table if not exists public.trolley_termine (
  -- Die Kennung vergibt der Client (`r<uuid>`).
  id              text primary key check (id <> ''),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  trolley_id      text not null,
  datum           date not null,
  -- Frei von 6 bis 22 Uhr in halben Stunden (`TROLLEY_ZEITEN` in
  -- `_shared/trolley.ts`), das Ende nach dem Anfang.
  von             time not null,
  bis             time not null,
  -- Wer eingetragen hat — oder geblieben ist, als der andere ging.
  person_id       uuid not null,
  -- Der Partner; leer heißt „Partner gesucht".
  partner_id      uuid,
  -- Die Person hat beide eingetragen („Jonas hat euch beide eingetragen") —
  -- nicht, wenn der Partner von selbst dazukam. Gilt nur mit Partner.
  gemeinsam       boolean not null default false,
  created_at      timestamptz not null default now(),

  constraint trolley_termine_zeit check (
    von >= time '06:00' and bis <= time '22:00' and von < bis
    and extract(minute from von) in (0, 30) and extract(minute from bis) in (0, 30)
    and extract(second from von) = 0 and extract(second from bis) = 0
  ),
  constraint trolley_termine_zwei check (partner_id is distinct from person_id),
  constraint trolley_termine_trolley_fk foreign key (trolley_id, congregation_id)
    references public.trolleys (id, congregation_id) on delete cascade,
  -- Geht die Person, geht ihr Termin mit.
  constraint trolley_termine_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete cascade,
  -- Geht der Partner, sucht der andere wieder einen.
  constraint trolley_termine_partner_fk foreign key (partner_id, congregation_id)
    references public.persons (id, congregation_id) on delete set null (partner_id)
);

create index if not exists trolley_termine_congregation_idx
  on public.trolley_termine (congregation_id, datum);

-- Weitere Pläne (T120, Phase 5): Ankündigungen ohne Zuteilung — niemand
-- bestätigt etwas, niemand wird erinnert. Ein Plan ist ein Königreichssaal-
-- Plan: je Woche (oder je Monat, `takt`) eine Predigtdienstgruppe. Gemessen am Buch „Organisiert,
-- Jehovas Willen zu tun", Kap. 11 Abs. 10: „Im Allgemeinen wechseln sich die
-- Predigtdienstgruppen mit der Saalreinigung ab"; ein Ältester oder
-- Dienstamtgehilfe stellt dafür einen Plan auf.
-- Ein Plan beginnt als Entwurf; erst veröffentlicht sieht ihn die Versammlung.
create table if not exists public.plaene (
  -- `text` wie bei `fs_rules`: Die Kennung vergibt der Client (`p<uuid>`).
  id              text primary key check (id <> ''),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  name            text not null default '',        -- die Worte des Planers, unübersetzt
  von             date not null,
  bis             date not null,
  entwurf         boolean not null default true,
  -- Wie oft die Gruppe wechselt: je Woche oder je Kalendermonat (4.10.2026).
  takt            text not null default 'woche' check (takt in ('woche', 'monat')),
  created_at      timestamptz not null default now(),

  check (bis >= von),
  unique (id, congregation_id)                     -- Ziel des Verweises aus plan_eintraege
);

-- Nachträglich (4.10.2026) — eine schon angelegte Tabelle bekommt ihn hier;
-- jeder bestehende Plan wechselt damit weiter wöchentlich.
alter table public.plaene
  add column if not exists takt text not null default 'woche' check (takt in ('woche', 'monat'));

create index if not exists plaene_congregation_idx
  on public.plaene (congregation_id, bis);

-- Ein Eintrag je Woche oder je Monat, nach dem Takt des Plans: die Gruppe,
-- `datum` ist der Montag bzw. der Monatserste.
create table if not exists public.plan_eintraege (
  id              text primary key check (id <> ''),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  plan_id         text not null,
  datum           date not null,
  grp             uuid,
  created_at      timestamptz not null default now(),

  constraint plan_eintraege_plan_fk foreign key (plan_id, congregation_id)
    references public.plaene (id, congregation_id) on delete cascade,
  constraint plan_eintraege_grp_fk foreign key (grp, congregation_id)
    references public.groups (id, congregation_id) on delete set null (grp)
);

-- Entfernt: die Vorlage „Familien reihum" (vom 3. bis 4.10.2026; je Tag und
-- Mahlzeit ein Gastgeber). Ihre Pläne gehen samt Einträgen (Kaskade); danach
-- braucht niemand mehr `plaene.vorlage` und die Gastgeber-Spalten. **Vor** dem
-- Index darunter: Mit Mittag und Abend am selben Tag gäbe es je Plan und Tag
-- zwei Einträge, und der eindeutige Index ließe sich nicht anlegen. Ein
-- zweiter Lauf findet nichts mehr; der Block kann fort, sobald er überall
-- eingespielt ist.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'plaene' and column_name = 'vorlage') then
    delete from public.plaene where vorlage = 'familien';
  end if;
end
$$;
alter table public.plaene drop column if exists vorlage;
drop index if exists public.plan_eintraege_platz;
alter table public.plan_eintraege drop column if exists person_id;   -- nimmt plan_eintraege_person_fk mit
alter table public.plan_eintraege drop column if exists mahlzeit;

-- Ein Platz je Woche — zugleich der Index fürs Laden.
create unique index if not exists plan_eintraege_woche
  on public.plan_eintraege (plan_id, datum);

-- Versand-Tagebuch der Erinnerungen: send-reminders trägt ein, wem es an
-- welchem Tag welche Art geschickt hat, und überspringt beim zweiten Lauf am
-- selben Tag die schon Erledigten — sonst käme dieselbe Push doppelt an.
--   kind: 'self'    persönliche Erinnerung an die eingeteilte Person
--         'planner' Sammelmeldung „nicht erreichbar" an die Planer
create table if not exists public.reminder_log (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('self', 'planner', 'trolley')),
  sent_on         date not null default current_date,
  created_at      timestamptz not null default now(),
  unique (user_id, kind, sent_on)
);

-- Seit T121 (14.10.2026) auch die Erinnerung am Vortag eines Trolley-Termins
-- (`trolley`) — eine schon angelegte Tabelle bekommt die erweiterte Prüfung hier.
alter table public.reminder_log drop constraint if exists reminder_log_kind_check;
alter table public.reminder_log
  add constraint reminder_log_kind_check check (kind in ('self', 'planner', 'trolley'));

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

-- Wer kein Konto hat, steht ohne `user_id` im Tagebuch: Erreicht hat ihn keine
-- Nachricht. Der Planer sagt es ihm selbst und hakt es in den Zusagen der
-- Woche ab (T121, Phase 5g) — wann, steht hier (`persoenlich_bescheid` unten).
alter table public.assignment_log
  add column if not exists persoenlich_at timestamptz;

-- Anmelde-Links (T121, Phase 8): Ein Kennwort gibt es nicht mehr. Wer in die
-- App soll, bekommt vom Admin einen Link — per E-Mail oder auf einem Zettel mit
-- QR-Code und einem Code zum Eintippen (`send-invite` stellt aus, `anmelden`
-- löst ein). **Eine Zeile je Person**: Ein neuer Link ersetzt den alten sofort.
-- Er gilt mehrfach (Handy und Tablet), bis `gueltig_bis` (30 Tage).
--
-- Token und Code stehen nur als SHA-256 da (`_shared/anmeldung.ts`), und auch
-- die sieht kein Client: Die Spalten sind für die App gesperrt (unten). Die
-- 40 Bit des Codes hielten einem Angriff auf die Prüfsumme nicht lange stand.
--
-- Das Konto selbst entsteht erst bei der ersten Anmeldung — „angemeldet" heißt
-- weiter: Es gibt eine `members`-Zeile.
create table if not exists public.anmelde_links (
  person_id       uuid primary key,
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  token_hash      text not null unique,
  code_hash       text not null unique,
  gueltig_bis     timestamptz not null,
  erstellt_at     timestamptz not null default now(),
  -- Zuletzt per E-Mail verschickt — bremst die Selbstbedienung auf der
  -- Anmeldeseite (eine Mail je Person in zehn Minuten).
  gesendet_at     timestamptz,
  -- Zuletzt zum Anmelden benutzt.
  benutzt_at      timestamptz,

  constraint anmelde_links_person_fk foreign key (person_id, congregation_id)
    references public.persons (id, congregation_id) on delete cascade
);

create index if not exists anmelde_links_congregation_idx
  on public.anmelde_links (congregation_id);

-- Fehlgeschlagene Anmeldeversuche mit einem Code — die Bremse gegen Raten
-- (`anmelden`): je Absender und insgesamt eine Grenze je Stunde. Nur die
-- Function liest und schreibt; ältere Zeilen räumt sie selbst ab.
create table if not exists public.anmelde_fehlversuche (
  id  bigint generated always as identity primary key,
  ip  text not null,
  at  timestamptz not null default now()
);

create index if not exists anmelde_fehlversuche_at_idx
  on public.anmelde_fehlversuche (at);

-- ---------------------------------------------------------------------------
-- Entfernt: Redner auswärts (T120, Phase 4 — vom 3. bis 4.10.2026)
-- ---------------------------------------------------------------------------
-- Der Plan ist wieder aus der App genommen. Mit der Tabelle gehen ihre
-- Richtlinien und ihr Index. Ihre Aufgaben-Schlüssel (`va|<montag>|<id>`)
-- gehören danach zu nichts mehr: Zusagen, Glocken-Mitteilungen und
-- Tagebucheinträge dazu gehen mit. Ein zweiter Lauf findet nichts mehr; der
-- Block kann fort, sobald er überall eingespielt ist.
drop table if exists public.vortraege_auswaerts cascade;
delete from public.confirmations where task_key like 'va|%';
delete from public.notifications where task_key like 'va|%';
delete from public.assignment_log where task_key like 'va|%';

-- ---------------------------------------------------------------------------
-- Entfernt: Stand und Schicht (T120, Phase 3 — vom 3. bis 14.10.2026)
-- ---------------------------------------------------------------------------
-- Statt fester Termine, deren Schichten ein Planer besetzt, verabredet man
-- sich seit T121 selbst für einen Trolley (oben). Mit den Tabellen gehen ihre
-- Trigger und Richtlinien; die Funktionen dazu fallen eigens. Ihre
-- Aufgaben-Schlüssel (`oz|<montag>|<id>`) gehören danach zu nichts mehr:
-- Zusagen, Glocken-Mitteilungen und Tagebucheinträge dazu gehen mit. Ein
-- zweiter Lauf findet nichts mehr; der Block kann fort, sobald er überall
-- eingespielt ist.
drop table if exists public.oz_eintraege cascade;
drop table if exists public.oz_termine cascade;
drop function if exists public.oz_platz_pruefen();
drop function if exists public.oz_ausfall_raeumen();
drop function if exists public.oz_tagwechsel_raeumen();
drop function if exists public.darf_zeugnis();
delete from public.confirmations where task_key like 'oz|%';
delete from public.notifications where task_key like 'oz|%';
delete from public.assignment_log where task_key like 'oz|%';

-- ---------------------------------------------------------------------------
-- Entfernt: Einladungscodes (bis 15.10.2026)
-- ---------------------------------------------------------------------------
-- Seit dem Anmelden per Link (T121, Phase 8) registriert sich niemand mehr und
-- löst keinen Code ein: Den Zugang gibt der Admin als Link (`anmelde_links`),
-- das Konto entsteht bei der ersten Anmeldung (Function `anmelden`). Mit der
-- Tabelle gehen ihre Richtlinie und ihr Index; die Funktion zum Einlösen fällt
-- eigens. Ein zweiter Lauf findet nichts mehr; der Block kann fort, sobald er
-- überall eingespielt ist.
drop function if exists public.redeem_invite(text);
drop table if exists public.invites cascade;

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

-- Darf der aktuelle Nutzer planen — als Admin (`members.planner`) oder als
-- Planer (`members.zuteiler`, 4.10.2026)? Seit dem 15.10.2026 plant der Planer
-- alles wie der Admin: Wochen, Treffpunkte samt Grundplan, Gruppenbesuche,
-- Weitere Pläne („ein planer plant ja schließlich die woche"). Personen und
-- Einstellungen bleiben beim Admin (`is_planner()`). Bis dahin teilte er nur zu
-- und schrieb Wochen über die Edge Function `zuteilen`.
create or replace function public.darf_zuteilen()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select planner or zuteiler from public.members where user_id = auth.uid()),
    false
  )
$$;

-- Die Gruppen, die der aktuelle Nutzer als Aufseher oder Gehilfe leitet —
-- leer, wenn keine. Damit beschränkt die Datenbank selbst auf die eigene
-- Gruppe; bis zum 4.10.2026 tat das nur die App.
create or replace function public.eigene_gruppen()
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(g.id), '{}')
  from public.groups g
  join public.members m on m.congregation_id = g.congregation_id
  where m.user_id = auth.uid()
    and m.person_id is not null
    and (g.overseer_id = m.person_id or g.assistant_id = m.person_id)
$$;

-- Ist der aktuelle Nutzer Aufseher oder Gehilfe irgendeiner Predigtdienstgruppe?
-- Sie dürfen die Treffpunkte ihrer Gruppe pflegen, ohne Admin zu sein; welche
-- Gruppe, sagt `eigene_gruppen()`.
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

-- Sieht die eigene Person diesen Plan (Weitere Pläne, T120 Phase 5)? Admin und
-- Planer alles — auch den Entwurf, denn sie planen ihn —, sonst die ganze
-- Versammlung, was veröffentlicht ist. Bis zum 4.10.2026 stand hier dazu „Familien reihum": nur,
-- wer selbst oder mit seinem Haushalt als Gastgeber darin stand.
--
-- `security definer`, weil die Prüfung `plaene` liest — dieselbe Tabelle,
-- deren Richtlinie sie ist (`plaene_select`). Eine Richtlinie, die ihre eigene
-- Tabelle abfragt, liefe in die Rekursion.
create or replace function public.plan_sichtbar(plan text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.darf_zuteilen() or exists (
    select 1
      from public.plaene p
     where p.id = plan
       and p.congregation_id = public.my_congregation_id()
       and not p.entwurf
  )
$$;

-- ---------------------------------------------------------------------------
-- Treffpunkte: wer was an einer Woche ändern darf (4.10.2026, 15.10.2026)
-- ---------------------------------------------------------------------------
-- Die Treffpunkte einer Woche liegen als **eine** Liste in `fs_weeks.data`.
-- Schreiben dürfen Admin, Planer und Gruppenaufseher (Richtlinie unten) — aber
-- nicht dasselbe:
--
--  - Admin und Planer alles (der Planer seit dem 15.10.2026; bis dahin nur den
--    Leiter);
--  - der Gruppenaufseher (oder Gehilfe) die Treffpunkte **seiner** Gruppe
--    ganz: Zeit, Ort, hinzufügen, entfernen, Leiter.
--
-- Eine Richtlinie sieht nur „Zeile geändert"; deshalb vergleicht dieser
-- Trigger alt und neu. Bis zum 4.10.2026 beschränkte allein die App den
-- Gruppenaufseher auf seine Gruppe — die Datenbank ließ jede zu.

-- Die Treffpunkte, die nicht zu den eigenen Gruppen gehören (Versammlungs-
-- treffpunkte eingeschlossen), nach Kennung geordnet.
--
-- Die Person-Id des Leiters (`lpid`) zählt nicht: Die App bindet beim Laden
-- Leiternamen an ihre Person (`fsLeiterBinden`) und schreibt diese Bindung mit,
-- sobald sie eine Woche speichert. Verglichen wird deshalb der Name — sonst
-- scheiterte jede Änderung eines Aufsehers an einer Woche, in der irgendwo ein
-- Leiter noch ohne Id steht.
--
-- Bis zum 15.10.2026 nahm die Funktion einen dritten Wert (`ohne_leiter`, beim
-- Planer ohne Leiterfelder); den alten Aufruf gibt es nicht mehr.
drop function if exists public.fs_fremde(jsonb, uuid[], boolean);
create or replace function public.fs_fremde(insts jsonb, eigene uuid[])
returns jsonb
language sql immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(e.i - 'lpid' order by e.i ->> 'id'), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(insts) = 'array' then insts else '[]'::jsonb end) as e(i)
  where e.i ->> 'grp' is null or not ((e.i ->> 'grp') = any (eigene::text[]))
$$;

-- Ohne angemeldeten Nutzer schreibt die Service-Role (Edge Function,
-- Wartungsskript) — die prüft selbst. Admin und Planer dürfen alles. Ein
-- Upsert kommt als INSERT an, auch wenn die Woche schon besteht; verglichen
-- wird dann mit der bestehenden.
create or replace function public.fs_weeks_pruefen()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  vorher jsonb;
  eigene uuid[];
begin
  if auth.uid() is null or public.darf_zuteilen() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    vorher := old.data;
  else
    select f.data into vorher
      from public.fs_weeks f
     where f.congregation_id = new.congregation_id and f.start = new.start;
  end if;
  eigene := public.eigene_gruppen();
  if public.fs_fremde(coalesce(vorher, '[]'::jsonb), eigene)
     is distinct from public.fs_fremde(new.data, eigene) then
    raise exception 'nur-eigene-gruppe' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists fs_weeks_pruefen on public.fs_weeks;
create trigger fs_weeks_pruefen
  before insert or update on public.fs_weeks
  for each row execute function public.fs_weeks_pruefen();

-- Gruppenbesuche plant der Planer seit dem 15.10.2026 ganz, wie der Admin
-- (`gruppenbesuche_write`). Bis dahin wechselte er nur den Besucher, und ein
-- Trigger wies jede andere Änderung ab — beide sind fort.
drop trigger if exists gruppenbesuche_pruefen on public.gruppenbesuche;
drop function if exists public.gruppenbesuche_pruefen();

-- **Ein Trolley-Termin hält, was die App verspricht** (T121, Phase 7): Der
-- Trolley ist zu der Zeit frei, niemand steht zur selben Zeit zweimal
-- irgendwo, und mit dem Trolley geht nur, wer das Recht dazu hat. Die Function
-- `trolley` prüft dasselbe vorher (`_shared/trolley.ts`) und nennt den Grund;
-- hier steht es ein zweites Mal, weil zwei, die gleichzeitig dieselbe Zeit
-- wollen, beide an ihrer Prüfung vorbeikämen.
--
-- Die Sperre ist der Kern — eine je Versammlung und Tag, nicht je Trolley:
-- Mit ihr wartet der Zweite, sieht danach den Ersten und wird abgewiesen, ob
-- er denselben Trolley will oder dieselbe Person an einem anderen einträgt.
-- Eine Sperre auf der Zeile des Trolleys ordnete nur das Erste; zwei, die
-- Simon zugleich an zwei Trolleys eintragen, kämen beide durch.
--
-- **Geändert wird nur, wer dabei ist.** Austragen lässt den anderen stehen,
-- Dazukommen setzt den Partner, und ein gelöschter Partner wird leer
-- (Fremdschlüssel). Trolley, Tag und Zeit bleiben; wer anders will, trägt
-- sich aus und neu ein. Geprüft wird beim Ändern deshalb nur, wer neu
-- dazukommt — ein Austragen darf nie daran scheitern, dass dem Bleibenden
-- inzwischen das Recht fehlt.
create or replace function public.trolley_termin_pruefen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  neu uuid[];
begin
  if tg_op = 'INSERT' then
    neu := array_remove(array[new.person_id, new.partner_id], null);
  else
    if new.trolley_id <> old.trolley_id or new.datum <> old.datum
       or new.von <> old.von or new.bis <> old.bis then
      raise exception 'trolley_unveraenderlich' using errcode = 'check_violation';
    end if;
    -- Neu ist, wer vorher nicht dabei war — beim Dazukommen der Partner.
    neu := array_remove(array[
      case when new.person_id in (old.person_id, old.partner_id) then null else new.person_id end,
      case when new.partner_id in (old.person_id, old.partner_id) then null else new.partner_id end
    ], null);
    if cardinality(neu) = 0 then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('trolley|' || new.congregation_id || '|' || new.datum, 0));

  if tg_op = 'INSERT' and exists (
    select 1 from public.trolley_termine t
     where t.trolley_id = new.trolley_id and t.congregation_id = new.congregation_id
       and t.datum = new.datum and t.von < new.bis and new.von < t.bis
  ) then
    raise exception 'trolley_belegt' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.trolley_termine t
     where t.congregation_id = new.congregation_id and t.id <> new.id
       and t.datum = new.datum and t.von < new.bis and new.von < t.bis
       and (t.person_id = any (neu) or t.partner_id = any (neu))
  ) then
    raise exception 'trolley_doppelt' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(neu) as wer
     where not exists (
       select 1 from public.persons p
        where p.id = wer and p.congregation_id = new.congregation_id
          and coalesce((p.priv ->> 'zeugnis')::boolean, false)
     )
  ) then
    raise exception 'trolley_ohne_recht' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists trolley_termine_pruefen on public.trolley_termine;
create trigger trolley_termine_pruefen
  before insert or update on public.trolley_termine
  for each row execute function public.trolley_termin_pruefen();

-- Name der eigenen Person — wie `displayName()` in der App: Vor- und Nachname.
-- Gebraucht für Plätze, die nur einen Namen tragen und keine Person-Id: Ein
-- Import ordnet einen mehrdeutigen Namen bewusst keiner Person zu, und von
-- Hand eingetragener Text hat gar keine.
--
-- **Seit T110 ist dieser Rückfall eindeutig.** Solange zwei Personen gleich
-- heißen konnten, war genau er die Lücke in der Bestätigungs-Richtlinie: Wer
-- „Paul Beispiel" hieß, durfte die namenlosen Plätze des anderen Paul Beispiel
-- bestätigen. `persons_name_eindeutig` schließt sie.
create or replace function public.mein_anzeigename()
returns text
language sql stable security definer
set search_path = public
as $$
  select btrim(p.fn || ' ' || p.ln)
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
-- `va|<montag>|<vortragId>` (Vortrag auswärts) gab es vom 3. bis 4.10.2026; die
-- Form ist mit dem Plan gegangen und seither eine unbekannte. Ebenso
-- `oz|<montag>|<eintragId>` (Stand und Schicht, vom 3. bis 14.10.2026): Mit den
-- Trolleys (T121) gibt es keine Zusage mehr, die ihm gehören könnte.
--
-- **Unbekannte Formen bleiben erlaubt.** Eine zu strenge Richtlinie bricht das
-- Bestätigen fast lautlos (der Client schreibt fire-and-forget); eine erfundene
-- Form trifft dagegen keinen Platz und bleibt wirkungslos.
--
-- **Eine bekannte Art in fremder Schreibweise nicht.** „…|helper|mik|0.0" ist
-- keine erfundene Form, sondern Platz 0 in Verkleidung: Durchgelassen, stand
-- damit eine Absage für einen fremden Platz in `confirmations`, und die Edge
-- Functions lasen die Nummer früher mit `Number()` als 0. Die Platznummer ist
-- deshalb hier wie in `schluesselTeile` eine reine Ziffernfolge.
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

  elsif art = 'helper' and n = 5 and teile[5] ~ '^[0-9]+$' then
    slot := zk -> 'helpers' -> teile[4] -> teile[5]::integer;

  elsif art in ('part', 'aux') and n = 5 and teile[5] ~ '^[0-9]+$' then
    -- Stabile Kennung: der Punkt wird gesucht, nicht seine Position.
    select e -> feld -> teile[5]::integer into slot
      from jsonb_array_elements(zk -> 'sections') s,
           jsonb_array_elements(s -> 'items') e
     where e->>'iid' = teile[4];

  elsif art in ('ratgeber', 'helper', 'part', 'aux') then
    return false; -- bekannte Art, fremde Schreibweise — siehe Kopf

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

-- Versammlung: Mitglieder lesen ihre eigene; ändern nur der Admin
-- (`is_planner()` — der Name stammt aus der Zeit vor dem Planer-Recht).
drop policy if exists congregations_select on public.congregations;
create policy congregations_select on public.congregations
  for select using (id = public.my_congregation_id());

drop policy if exists congregations_update on public.congregations;
create policy congregations_update on public.congregations
  for update using (id = public.my_congregation_id() and public.is_planner());

-- Mitglieder: eigene Zeile lesen; der Admin sieht und verwaltet alle seiner
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

-- Personen / Haushalte / Dienste / Gruppen: Versammlung liest, der Admin
-- schreibt. Die Wochen schreiben Admin und Planer (`weeks_write` unten).
drop policy if exists persons_select on public.persons;
create policy persons_select on public.persons
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists persons_write on public.persons;
create policy persons_write on public.persons
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

-- Haushalte trägt niemand für sich ein: Sie entstehen und vergehen mit der
-- Zuordnung im Personen-Detail, und die macht der Admin.
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

-- Wochen schreiben Admin und Planer — holen, einrichten, zuteilen (seit dem
-- 15.10.2026; bis dahin schrieb der Planer über die Edge Function `zuteilen`,
-- die nur Zuteilungen durchließ).
drop policy if exists weeks_write on public.weeks;
create policy weeks_write on public.weeks
  for all
  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())
  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());

-- Abwesenheiten: Die Versammlung liest, was ansteht und was höchstens acht
-- Wochen vorbei ist (`SONST_WOCHEN`, gezählt vom Montag der laufenden Woche wie
-- in `alte_daten_loeschen`). Weiter zurück — bis zu einem Jahr, für die
-- Auswertung (T126) — lesen nur Admin und Planer, und jeder seine eigenen
-- (Betreiber nach dem Review am 17.10.2026: „Nur Admin und Planer"; bis dahin
-- lud jedes Konto das ganze Jahr). Schreiben: der Betroffene (auch bei
-- importierten Einträgen ohne Ersteller) oder der Admin.
--
-- Entscheidend ist die **Person**, nicht der Ersteller: Wer nur
-- die eigene `user_id` einträgt, kann damit keine fremde `person_id` daneben
-- setzen. Der Zweig über die eigene Zeile bleibt für Konten ohne verknüpfte
-- Person — deren Einträge tragen gar keine. Das `using` ist bewusst breiter als
-- das `with check`, damit Altbestand mit fremder Person noch löschbar ist.
drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select using (
    congregation_id = public.my_congregation_id()
    and (
      to_date >= date_trunc('week', current_date)::date - 7 * 8
      or public.darf_zuteilen()
      or user_id = auth.uid()
      or (person_id is not null and person_id = public.my_person_id())
    )
  );

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
-- löscht nur die eigenen. Unmittelbar schreibt nur der Admin — und die App
-- nie: Was sie meldet (eine Verhinderung, ein geholtes Programm), geht über
-- `notify_planners` weiter unten an alle, die planen. Ein Verkündiger sieht
-- sie nicht (members_select) und könnte sie nicht adressieren. Der
-- frühere Zweig „jedes Mitglied darf 'verhindert' an Planer schreiben" war
-- deshalb nie erreichbar: Die App fand keinen Empfänger und schrieb nichts.
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
    and public.is_planner()
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
-- Admin und Planer überall, Gruppenaufseher bei den Treffpunkten — bei
-- **allen**, nicht nur denen seiner Gruppe (Stand 15.10.2026). Welche Gruppe
-- ein Schlüssel `fs|<Montag>|<Treffpunkt>` meint, steht nur in `fs_weeks`;
-- eine Regel, die dort nachsieht und zu streng greift, ließe beim Umbesetzen
-- die Zusage des alten Leiters stehen — der neue gälte still als bestätigt.
-- Die App löscht nur Zusagen der Treffpunkte, die der Aufseher selbst ändert.
drop policy if exists confirmations_delete_planner on public.confirmations;
create policy confirmations_delete_planner on public.confirmations
  for delete using (
    congregation_id = public.my_congregation_id()
    and (
      public.darf_zuteilen()
      or (public.is_group_overseer() and task_key like 'fs|%')
    )
  );

-- Push-Abos: jedes Mitglied verwaltet nur seine eigenen Geräte.
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and congregation_id = public.my_congregation_id());

-- Treffpunkte: Versammlung liest. Den Grundplan pflegen Admin und Planer ganz
-- und der Gruppenaufseher für **seine** Gruppe; die Versammlungstreffpunkte
-- (`grp` null) nur Admin und Planer.
alter table public.fs_rules enable row level security;
alter table public.fs_weeks enable row level security;

drop policy if exists fs_rules_select on public.fs_rules;
create policy fs_rules_select on public.fs_rules
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists fs_rules_write on public.fs_rules;
create policy fs_rules_write on public.fs_rules
  for all
  using (congregation_id = public.my_congregation_id() and (public.darf_zuteilen() or grp = any (public.eigene_gruppen())))
  with check (congregation_id = public.my_congregation_id() and (public.darf_zuteilen() or grp = any (public.eigene_gruppen())));

drop policy if exists fs_weeks_select on public.fs_weeks;
create policy fs_weeks_select on public.fs_weeks
  for select using (congregation_id = public.my_congregation_id());

-- Die Wochen schreiben Admin, Planer und Gruppenaufseher — was jeder darin
-- ändern darf, prüft `fs_weeks_pruefen`. Eine ganze Woche löschen Admin und
-- Planer.
drop policy if exists fs_weeks_write on public.fs_weeks;
create policy fs_weeks_write on public.fs_weeks
  for all
  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())
  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());

drop policy if exists fs_weeks_einfuegen on public.fs_weeks;
create policy fs_weeks_einfuegen on public.fs_weeks
  for insert
  with check (congregation_id = public.my_congregation_id() and (public.darf_zuteilen() or public.is_group_overseer()));

drop policy if exists fs_weeks_aendern on public.fs_weeks;
create policy fs_weeks_aendern on public.fs_weeks
  for update
  using (congregation_id = public.my_congregation_id() and (public.darf_zuteilen() or public.is_group_overseer()))
  with check (congregation_id = public.my_congregation_id() and (public.darf_zuteilen() or public.is_group_overseer()));

-- Gruppenbesuche: Die ganze Versammlung liest (die Gruppe soll wissen, wann
-- der Dienstaufseher kommt — der Gruppenaufseher kündigt es an, od Kap. 5
-- Abs. 41). Schreiben Admin und Planer: Anders als die Treffpunkte plant der
-- Gruppenaufseher die Besuche nicht. Bis zum 15.10.2026 wechselte der Planer
-- nur den Besucher (Richtlinien `gruppenbesuche_besucher…`, fort).
alter table public.gruppenbesuche enable row level security;

drop policy if exists gruppenbesuche_select on public.gruppenbesuche;
create policy gruppenbesuche_select on public.gruppenbesuche
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists gruppenbesuche_write on public.gruppenbesuche;
create policy gruppenbesuche_write on public.gruppenbesuche
  for all
  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())
  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());

drop policy if exists gruppenbesuche_besucher on public.gruppenbesuche;
drop policy if exists gruppenbesuche_besucher_upsert on public.gruppenbesuche;

-- Vorgemerkte Vorträge (T122): Lesen und schreiben darf, wer zuteilt — Admin
-- und Planer; den Vortragsplan übernimmt der Planer (Entscheidung des
-- Betreibers, 12.10.2026). Die Versammlung sieht einen Vortrag, sobald er in
-- seiner Woche steht; vorher braucht ihn niemand, und von auswärtigen Rednern
-- liegt so wenig wie möglich offen.
alter table public.vortraege enable row level security;

drop policy if exists vortraege_zuteilen on public.vortraege;
create policy vortraege_zuteilen on public.vortraege
  for all
  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())
  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());

-- Trolleys (T121, Phase 7): Die Trolleys pflegt der Admin; Trolleys und
-- Termine sieht die ganze Versammlung — so sehen alle, wann einer unterwegs
-- ist. **Termine schreibt kein Mitglied selbst**: Eintragen, Dazukommen und
-- Austragen gehen über die Edge Function `trolley`, die das Recht prüft und
-- dem Partner Bescheid sagt. Eine Richtlinie zum Schreiben gibt es deshalb
-- nicht; die Function arbeitet mit der Dienstrolle.
alter table public.trolleys enable row level security;
alter table public.trolley_termine enable row level security;

drop policy if exists trolleys_select on public.trolleys;
create policy trolleys_select on public.trolleys
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists trolleys_write on public.trolleys;
create policy trolleys_write on public.trolleys
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

drop policy if exists trolley_termine_select on public.trolley_termine;
create policy trolley_termine_select on public.trolley_termine
  for select using (congregation_id = public.my_congregation_id());

-- Anmelde-Links (T121, Phase 8): Der Admin sieht, wer einen hat und bis wann er
-- gilt, und zieht ihn zurück (ein Konto entfernen nimmt den Link mit).
-- Ausgestellt wird nur über `send-invite`, eingelöst über `anmelden` — beide mit
-- der Dienstrolle. **Die Prüfsummen bleiben unsichtbar**: Spaltenrechte statt
-- einer Ansicht, damit `select=*` scheitert, statt sie doch zu zeigen.
alter table public.anmelde_links enable row level security;
alter table public.anmelde_fehlversuche enable row level security;

revoke all on public.anmelde_links from anon, authenticated;
revoke all on public.anmelde_fehlversuche from anon, authenticated;
grant select (person_id, congregation_id, gueltig_bis, erstellt_at, gesendet_at, benutzt_at)
  on public.anmelde_links to authenticated;
grant delete on public.anmelde_links to authenticated;

drop policy if exists anmelde_links_select on public.anmelde_links;
create policy anmelde_links_select on public.anmelde_links
  for select using (congregation_id = public.my_congregation_id() and public.is_planner());

drop policy if exists anmelde_links_delete on public.anmelde_links;
create policy anmelde_links_delete on public.anmelde_links
  for delete using (congregation_id = public.my_congregation_id() and public.is_planner());

-- Weitere Pläne: Plan und Gruppen darin pflegen Admin und Planer (der Planer
-- den Plan selbst seit dem 15.10.2026; bis dahin verteilte er nur die Gruppen).
-- Sehen darf ein Mitglied, was `plan_sichtbar` freigibt — einen Entwurf nie.
alter table public.plaene enable row level security;
alter table public.plan_eintraege enable row level security;

drop policy if exists plaene_select on public.plaene;
create policy plaene_select on public.plaene
  for select using (congregation_id = public.my_congregation_id() and public.plan_sichtbar(id));

drop policy if exists plaene_write on public.plaene;
create policy plaene_write on public.plaene
  for all
  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())
  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());

drop policy if exists plan_eintraege_select on public.plan_eintraege;
create policy plan_eintraege_select on public.plan_eintraege
  for select using (congregation_id = public.my_congregation_id() and public.plan_sichtbar(plan_id));

drop policy if exists plan_eintraege_write on public.plan_eintraege;
create policy plan_eintraege_write on public.plan_eintraege
  for all
  using (congregation_id = public.my_congregation_id() and public.darf_zuteilen())
  with check (congregation_id = public.my_congregation_id() and public.darf_zuteilen());

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

-- Absagen (T126): lesen nur Admin und Planer — für die Auswertung, die nur
-- sie sehen. Geschrieben wird allein vom Trigger an `confirmations`; ohne
-- Richtlinie zum Schreiben kann kein Konto eine Absage anlegen, ändern oder
-- löschen.
alter table public.absagen enable row level security;

drop policy if exists absagen_select on public.absagen;
create policy absagen_select on public.absagen
  for select using (congregation_id = public.my_congregation_id() and public.darf_zuteilen());

-- ---------------------------------------------------------------------------
-- Mitteilung an die Planer der eigenen Versammlung — je Planer eine Zeile mit
-- eigenem Gelesen-/Lösch-Status.
--
-- Security definer, weil die **Empfänger** nur die Datenbank kennt: Ein
-- Verkündiger sieht in `members` allein die eigene Zeile (members_select). Bis
-- zum 24.9.2026 suchte die App die Planer im Client — für jede Verhinderung
-- eine leere Empfängerliste, und der Schreiber brach still ab. Kein Planer hat
-- je eine Verhinderung erhalten, obwohl der Toast es versprach.
--
-- Melden darf jedes Mitglied nur eine Verhinderung; Import und „Plan gesendet"
-- bleiben Admins und Planern vorbehalten (S3/T89). Die Art prüft zusätzlich die
-- check-Bedingung der Tabelle.
--
-- Empfänger sind seit dem 4.10.2026 Admins **und** Planer: Wer zuteilt, sucht
-- auch den Ersatz, wenn jemand absagt.
--
-- `task` (seit 4.10.2026): der Schlüssel der abgesagten Aufgabe. Ein Tipp auf
-- die Zeile führt den Planer in ihre Woche. Er ist nur ein Wegweiser — er
-- gibt kein Recht, und eine Bestätigung bietet die Glocke an einer Absage
-- nicht an —, darum genügt es, ihn zu kürzen. Mit Vorgabe, damit Aufrufe ohne
-- ihn (Import, ältere App-Stände) weiter passen; die alte Fassung mit drei
-- Parametern muss dafür weg, sonst wäre ein solcher Aufruf mehrdeutig.
-- ---------------------------------------------------------------------------

drop function if exists public.notify_planners(text, text, text);

create or replace function public.notify_planners(kind text, subject text, message text, task text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if kind <> 'verhindert' and not public.darf_zuteilen() then
    raise exception 'nur eine Verhinderung darf jedes Mitglied melden';
  end if;
  insert into public.notifications (congregation_id, user_id, type, title, body, task_key)
  select m.congregation_id, m.user_id, kind, subject, message, nullif(left(task, 300), '')
    from public.members m
   where m.congregation_id = public.my_congregation_id()
     and (m.planner or m.zuteiler);
end;
$$;

revoke all on function public.notify_planners(text, text, text, text) from public;
revoke all on function public.notify_planners(text, text, text, text) from anon;
grant execute on function public.notify_planners(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Persönlich Bescheid gegeben (T121, Phase 5g): In den Zusagen der Woche hakt
-- ab, wer zuteilt, dass er jemandem ohne Konto selbst Bescheid gesagt hat — und
-- nimmt den Haken auch wieder weg. Nur an Zeilen ohne Konto und nur in der
-- eigenen Versammlung. Eine Zeile entsteht hier nicht: Das Tagebuch schreibt
-- weiter nur `send-plan` (siehe `assignment_log_select`), sonst könnte sich ein
-- Client selbst als „informiert" eintragen und Nachrichten unterdrücken.
-- ---------------------------------------------------------------------------

create or replace function public.persoenlich_bescheid(p_task_key text, p_name text, p_ja boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.darf_zuteilen() then
    raise exception 'nur-wer-zuteilt' using errcode = '42501';
  end if;
  update public.assignment_log
     set persoenlich_at = case when p_ja then now() else null end
   where congregation_id = public.my_congregation_id()
     and task_key = p_task_key
     and name = p_name
     and user_id is null;
end;
$$;

revoke all on function public.persoenlich_bescheid(text, text, boolean) from public;
revoke all on function public.persoenlich_bescheid(text, text, boolean) from anon;
grant execute on function public.persoenlich_bescheid(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Aufräumen (T125, 16.10.2026): „wir wollen ja keine daten sammeln, die wir
-- nicht brauchen" (Betreiber). Was älter ist als seine Frist, wird gelöscht —
-- einmal die Woche, montags, per pg_cron (`supabase/cron-aufraeumen.sql`), für
-- alle Versammlungen.
--
-- Zwei Fristen, beide ab dem Montag der laufenden Woche, wie beim Laden in der
-- App (`src/data/aufbewahrung.ts`; `tests/aufbewahrung.test.ts` hält beide
-- Seiten gleich und verlangt für jede Tabelle eine Regel oder einen Grund):
--   - ein Jahr (52 Wochen) für die Wochen und was zu ihnen gehört — die
--     gerechte Verteilung fragt, wer am längsten wartet, und manche haben nur
--     alle paar Monate eine Zuteilung —, dazu seit dem 17.10.2026 die Absagen
--     und die Abwesenheiten (ab ihrem Ende): Mit beiden rechnet die Auswertung
--     über das ganze Jahr (T126). Der Grund einer Abwesenheit geht nach acht
--     Wochen, der Zeitraum bleibt;
--   - acht Wochen für alles andere.
-- Die Fehlversuche beim Anmelden (IP-Adressen) gehen nach einem Tag: Sie
-- bremsen nur das Raten der letzten Stunde. `anmelden` räumt sie bei jedem
-- neuen Fehlversuch selbst ab, der Lauf hier nimmt den Rest. Das Protokoll von
-- Supabase Auth (`auth.audit_log_entries`, je Anmeldung E-Mail und IP-Adresse)
-- geht nach acht Wochen — die einzige Regel für eine Tabelle, die nicht hier
-- steht (Betreiber, 16.10.2026).
--
-- Zusagen und Versand-Tagebuch tragen ihre Woche im Schlüssel
-- (`<montag>|…` oder `fs|<montag>|…`, `_shared/aufgaben-schluessel.ts`); eine
-- unbekannte Form fällt auf das Datum ihrer Zeile zurück. Verglichen wird als
-- Text (ISO-Datum), damit ein verbogener Schlüssel den Lauf nicht abbricht.
--
-- `alte_daten_loeschen(true)` zählt nur, was ginge, und löscht nichts. Aufrufen
-- darf sie nur der Zeitplan: kein Recht für anon oder authenticated, auch nicht
-- über die REST-Schnittstelle.
-- ---------------------------------------------------------------------------

create or replace function public.woche_im_schluessel(task_key text)
returns text
language sql immutable
as $$
  select substring(task_key from '^(?:fs\|)?(\d{4}-\d{2}-\d{2})\|')
$$;

revoke all on function public.woche_im_schluessel(text) from public;
revoke all on function public.woche_im_schluessel(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Absagen vermerken (T126, 17.10.2026)
-- ---------------------------------------------------------------------------
-- Wird ein Platz als „verhindert" gemeldet, steht die Absage in `absagen` —
-- und bleibt dort, auch wenn der Platz danach neu besetzt wird und seine Zeile
-- in `confirmations` verschwindet (auf ein Löschen reagiert der Trigger
-- nicht). Nimmt jemand die Absage zurück („doch bestätigen"), ist es keine:
-- Sie geht wieder. Ohne Person am Konto gibt es niemanden, für den sie zählt.
--
-- Hier, nicht in der App: Jeder Weg, der eine Absage schreibt — der Client,
-- eine Function —, vermerkt sie damit. Security definer, weil kein Konto in
-- `absagen` schreiben darf.
create or replace function public.absage_vermerken()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  person uuid;
  woche  text := public.woche_im_schluessel(new.task_key);
begin
  select m.person_id into person
    from public.members m
   where m.user_id = new.user_id and m.congregation_id = new.congregation_id;
  if person is null or woche is null then
    return new;
  end if;
  if new.status = 'verhindert' then
    insert into public.absagen (congregation_id, person_id, task_key, woche)
    values (new.congregation_id, person, new.task_key, woche::date)
    on conflict do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'verhindert' then
    delete from public.absagen
     where congregation_id = new.congregation_id and task_key = new.task_key and person_id = person;
  end if;
  return new;
end;
$$;

revoke all on function public.absage_vermerken() from public;
revoke all on function public.absage_vermerken() from anon, authenticated;

drop trigger if exists confirmations_absage on public.confirmations;
create trigger confirmations_absage
  after insert or update of status on public.confirmations
  for each row execute function public.absage_vermerken();

-- Was beim Einführen schon abgesagt war, gleich mitnehmen — wiederholbar.
insert into public.absagen (congregation_id, person_id, task_key, woche)
select c.congregation_id, m.person_id, c.task_key, public.woche_im_schluessel(c.task_key)::date
  from public.confirmations c
  join public.members m on m.user_id = c.user_id and m.congregation_id = c.congregation_id
 where c.status = 'verhindert'
   and m.person_id is not null
   and public.woche_im_schluessel(c.task_key) is not null
on conflict do nothing;

create or replace function public.alte_daten_loeschen(trocken boolean default false)
returns table (tabelle text, zeilen bigint)
language plpgsql security definer
set search_path = public
as $$
declare
  montag constant date := date_trunc('week', current_date)::date;
  ein_jahr constant timestamptz := (montag - 7 * 52)::timestamptz;
  acht_wochen constant timestamptz := (montag - 7 * 8)::timestamptz;
  regel record;
  n bigint;
begin
  for regel in
    select r.name, r.bedingung, r.grenze
      from (values
        -- Die Wochen und was zu ihnen gehört: ein Jahr.
        ('weeks', 'start < $1', ein_jahr),
        ('fs_weeks', 'start < $1', ein_jahr),
        ('confirmations', 'coalesce(woche_im_schluessel(task_key), to_char(created_at, ''YYYY-MM-DD'')) < to_char($1, ''YYYY-MM-DD'')', ein_jahr),
        ('assignment_log', 'coalesce(woche_im_schluessel(task_key), to_char(sent_at, ''YYYY-MM-DD'')) < to_char($1, ''YYYY-MM-DD'')', ein_jahr),
        ('gruppenbesuche', 'woche < $1', ein_jahr),
        ('vortraege', 'woche < $1', ein_jahr),
        ('plaene', 'bis < $1', ein_jahr),
        ('plan_eintraege', 'datum < $1', ein_jahr),
        ('absagen', 'woche < $1', ein_jahr),
        -- Abwesenheiten ein Jahr ab ihrem Ende — die Auswertung rechnet mit ihnen
        -- (T126, 17.10.2026). Ihr Grund geht nach acht Wochen (unten).
        ('absences', 'to_date < $1', ein_jahr),
        -- Alles andere: acht Wochen.
        ('notifications', 'created_at < $1', acht_wochen),
        ('reminder_log', 'sent_on < $1', acht_wochen),
        ('trolley_termine', 'datum < $1', acht_wochen),
        ('anmelde_links', 'gueltig_bis < $1', acht_wochen),
        -- Die Bremse gegen Raten: ein Tag.
        ('anmelde_fehlversuche', 'at < $1', now() - interval '1 day'),
        -- Das Protokoll von Supabase Auth: acht Wochen.
        ('auth.audit_log_entries', 'created_at < $1', acht_wochen),
        -- Die Anmeldung eines Geräts mit IP-Adresse und Browserkennung: ein
        -- Jahr ohne Nutzung (19.10.2026). Ohne Höchstdauer räumt Supabase sie
        -- nie ab; `updated_at` rückt bei jeder Erneuerung des Tokens nach
        -- (gemessen). Das Gerät braucht danach einen neuen Link.
        ('auth.sessions', 'updated_at < $1', ein_jahr)
      ) as r(name, bedingung, grenze)
  loop
    -- Ohne Schema heißt `public` (search_path); `regclass` schreibt den Namen
    -- so, dass er genau diese Tabelle trifft.
    begin
      if trocken then
        execute format('select count(*) from %s where %s', regel.name::regclass, regel.bedingung) into n using regel.grenze;
      else
        execute format('delete from %s where %s', regel.name::regclass, regel.bedingung) using regel.grenze;
        get diagnostics n = row_count;
      end if;
    exception when insufficient_privilege then
      -- Die Tabellen von Supabase gehören nicht uns. Entzieht Supabase das
      -- Recht daran, räumen die übrigen Regeln trotzdem; `zeilen` bleibt leer.
      raise warning 'alte_daten_loeschen: kein Recht an %', regel.name;
      n := null;
    end;
    tabelle := regel.name;
    zeilen := n;
    return next;
  end loop;

  -- Der Grund einer Abwesenheit: acht Wochen ab ihrem Ende. Den Zeitraum
  -- braucht die Auswertung ein Jahr, den Grund niemand so lange (17.10.2026).
  if trocken then
    select count(*) into n from public.absences where to_date < acht_wochen and reason <> '';
  else
    update public.absences set reason = '' where to_date < acht_wochen and reason <> '';
    get diagnostics n = row_count;
  end if;
  tabelle := 'absences.reason';
  zeilen := n;
  return next;
end;
$$;

revoke all on function public.alte_daten_loeschen(boolean) from public;
revoke all on function public.alte_daten_loeschen(boolean) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Erste Einrichtung
-- ---------------------------------------------------------------------------
-- Eine neue Versammlung legt `scripts/versammlung-anlegen.mjs` an: die
-- Versammlung, ihre Standard-Dienste, die Person ihres ersten Admins (mit
-- vorgemerktem Admin-Recht) und dessen Anmelde-Link. SQL braucht es dafür
-- nicht.
--
-- Ein Kennwort und ein Registrieren gibt es nicht (seit 15.10.2026). Jedes
-- weitere Mitglied bekommt seinen Link vom Admin in der App — per E-Mail oder
-- auf einem Zettel (`send-invite`); das Konto entsteht bei der ersten Anmeldung
-- (`anmelden`), die Rechte kommen aus der Vormerkung an der Person. Bis zum
-- 16.10.2026 stand hier noch der Weg über Dashboard-Konto und Einladungscode.
-- =============================================================================
