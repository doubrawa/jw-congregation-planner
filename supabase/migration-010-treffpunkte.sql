-- Migration 010 — Zusammenkünfte für den Predigtdienst ("Treffpunkte")
--
-- Persistiert den Grundplan (fs_rules) und die pro Woche materialisierten
-- Treffpunkte samt Leitern (fs_weeks). Schreibrecht haben Planer sowie
-- Gruppenaufseher (Aufseher/Gehilfe einer Gruppe) — Letztere für ihre eigene
-- Gruppe (die Einschränkung auf die eigene Gruppe erfolgt in der App).
--
-- Idempotent — mehrfaches Ausführen ist unschädlich.

-- Ist der aktuelle Nutzer Aufseher oder Gehilfe irgendeiner Predigtdienstgruppe?
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
      and (g.ov = m.person_id or g."as" = m.person_id)
  )
$$;

-- Grundplan-Regeln: eine Zeile je Versammlung (rules = FsRule[] als JSONB).
-- base = Montag der Woche 0 (Bezug für Wochentag/Datum der Treffpunkte).
create table if not exists public.fs_rules (
  congregation_id uuid primary key references public.congregations (id) on delete cascade,
  base            date,
  rules           jsonb not null default '[]'::jsonb
);

-- Materialisierte Treffpunkte je Woche (data = FsInstance[] als JSONB).
create table if not exists public.fs_weeks (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  position        integer not null,                 -- 0 = älteste geladene Woche
  data            jsonb not null,
  unique (congregation_id, position)
);

create index if not exists fs_weeks_congregation_idx
  on public.fs_weeks (congregation_id);

alter table public.fs_rules enable row level security;
alter table public.fs_weeks enable row level security;

-- Lesen: alle Mitglieder der Versammlung. Schreiben: Planer + Gruppenaufseher.
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
