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
  created_at    timestamptz not null default now()
);

create table if not exists public.members (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  person_id       uuid,                             -- optionale Verknüpfung zu persons
  planner         boolean not null default false,   -- sieht Planen/Personen/Einstellungen
  created_at      timestamptz not null default now()
);

create table if not exists public.persons (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  fn              text not null default '',
  ln              text not null default '',
  role            text not null default 'verkuendiger'
                  check (role in ('aeltester', 'dienstamtgehilfe', 'verkuendiger')),
  female          boolean not null default false,   -- Anzeige "Verkündigerin"
  tel             text not null default '',
  mail            text not null default '',
  absent          integer[] not null default '{}',  -- Wochenindizes (wie App-Modell v1)
  priv            jsonb not null default '{}'::jsonb, -- Qualifications (9 Booleans)
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

create table if not exists public.weeks (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  position        integer not null,                 -- 0 = älteste geladene Woche
  data            jsonb not null,                   -- Week-Objekt aus src/data/types.ts
  unique (congregation_id, position)
);

create table if not exists public.absences (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade, -- Ersteller
  person_id       uuid references public.persons (id) on delete set null,
  from_date       date not null,
  to_date         date not null,
  reason          text not null default '',
  created_at      timestamptz not null default now()
);

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete cascade, -- null = an alle
  type            text not null default 'zuteilung'
                  check (type in ('zuteilung', 'erinnerung', 'gesendet', 'import')),
  title           text not null,
  body            text not null default '',
  read            boolean not null default false,
  created_at      timestamptz not null default now()
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

-- ---------------------------------------------------------------------------
-- Row-Level-Security
-- ---------------------------------------------------------------------------

alter table public.congregations enable row level security;
alter table public.members       enable row level security;
alter table public.persons       enable row level security;
alter table public.services      enable row level security;
alter table public.weeks         enable row level security;
alter table public.absences      enable row level security;
alter table public.notifications enable row level security;

-- Versammlung: Mitglieder lesen ihre eigene; ändern nur Planer.
drop policy if exists congregations_select on public.congregations;
create policy congregations_select on public.congregations
  for select using (id = public.my_congregation_id());

drop policy if exists congregations_update on public.congregations;
create policy congregations_update on public.congregations
  for update using (id = public.my_congregation_id() and public.is_planner());

-- Mitglieder: eigene Zeile lesen; Planer sehen alle ihrer Versammlung.
drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select using (
    user_id = auth.uid()
    or (congregation_id = public.my_congregation_id() and public.is_planner())
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

drop policy if exists weeks_select on public.weeks;
create policy weeks_select on public.weeks
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists weeks_write on public.weeks;
create policy weeks_write on public.weeks
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

-- Abwesenheiten: Versammlung liest; eigene Einträge oder Planer schreiben.
drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences
  for select using (congregation_id = public.my_congregation_id());

drop policy if exists absences_write on public.absences;
create policy absences_write on public.absences
  for all
  using (
    congregation_id = public.my_congregation_id()
    and (user_id = auth.uid() or public.is_planner())
  )
  with check (
    congregation_id = public.my_congregation_id()
    and (user_id = auth.uid() or public.is_planner())
  );

-- Mitteilungen: Empfänger (oder alle bei user_id null) lesen; Planer erzeugen;
-- Gelesen-Status darf jeder Empfänger selbst setzen.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (
    congregation_id = public.my_congregation_id()
    and (user_id is null or user_id = auth.uid())
  );

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert with check (
    congregation_id = public.my_congregation_id() and public.is_planner()
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (
    congregation_id = public.my_congregation_id()
    and (user_id is null or user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Erste Einrichtung (Beispiel — Werte anpassen und einmalig ausführen)
-- ---------------------------------------------------------------------------
-- 1. Versammlung anlegen:
--    insert into public.congregations (name, hall, meeting_times)
--    values ('Musterstadt', 'Hauptstraße 12', 'Di 19:00 · So 10:00');
--
-- 2. Benutzer in Supabase anlegen (Dashboard → Authentication → Add user),
--    dann mit der Versammlung verknüpfen (Planer-Rechte für Koordinator):
--    insert into public.members (user_id, congregation_id, planner)
--    values ('<auth-user-uuid>', '<congregation-uuid>', true);
-- =============================================================================
