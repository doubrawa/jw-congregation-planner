-- =============================================================================
-- E4, Schritt 1 von 2: Das Admin-Recht heißt `admin` (8. November 2026)
-- =============================================================================
-- Das Admin-Recht hieß `planner` — und der Planer heißt `zuteiler`. Wer
-- `planner` las, dachte an den Planer; bei jeder Änderung an den Rechten war
-- das eine Falle (Gesamt-Review vom 2.11.2026, Entscheidung E4). Jetzt:
--
--   members.planner            → members.admin
--   persons.planner_vorgemerkt → persons.admin_vorgemerkt
--   is_planner()               → ist_admin()
--
-- `zuteiler` und `darf_zuteilen()` bleiben.
--
-- **Zwei Schritte**, weil ältere App-Stände auf den Geräten und die Functions bis
-- zu ihrem Ausrollen die alten Spalten lesen und schreiben. Dieser Schritt legt
-- die neuen Spalten daneben, übernimmt die Werte und hält beide per Trigger
-- gleich; die Richtlinien fragen ab hier `ist_admin()`. `is_planner()` geht
-- schon jetzt: Gefragt haben sie nur die 14 Richtlinien und
-- `abwesenheit_gruende()` — beide stehen unten neu, mit `ist_admin()`. Eine
-- Funktion, die sie noch riefe, hielte das Entfernen nicht auf (Postgres trägt
-- Funktionsrümpfe nicht als Abhängigkeit ein) und scheiterte erst beim Aufruf.
-- Schritt 2 entfernt die alten Spalten und die Trigger, sobald jedes Gerät die
-- neue Fassung geladen hat.
-- =============================================================================

-- Die neuen Spalten, mit den Werten der alten.
alter table public.members add column if not exists admin boolean not null default false;
update public.members set admin = planner where admin is distinct from planner;

alter table public.persons add column if not exists admin_vorgemerkt boolean not null default false;
update public.persons set admin_vorgemerkt = planner_vorgemerkt
 where admin_vorgemerkt is distinct from planner_vorgemerkt;

-- Beide gleich halten, bis Schritt 2 die alten Spalten entfernt.

create or replace function public.admin_recht_angleichen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.admin := new.admin or new.planner;
  elsif new.admin is not distinct from old.admin then
    new.admin := new.planner;
  end if;
  new.planner := new.admin;
  return new;
end;
$$;

drop trigger if exists members_admin_angleichen on public.members;
create trigger members_admin_angleichen
  before insert or update on public.members
  for each row execute function public.admin_recht_angleichen();

create or replace function public.admin_vormerkung_angleichen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.admin_vorgemerkt := new.admin_vorgemerkt or new.planner_vorgemerkt;
  elsif new.admin_vorgemerkt is not distinct from old.admin_vorgemerkt then
    new.admin_vorgemerkt := new.planner_vorgemerkt;
  end if;
  new.planner_vorgemerkt := new.admin_vorgemerkt;
  return new;
end;
$$;

drop trigger if exists persons_admin_angleichen on public.persons;
create trigger persons_admin_angleichen
  before insert or update on public.persons
  for each row execute function public.admin_vormerkung_angleichen();

-- Die Frage nach dem Admin unter neuem Namen; was sie stellt, liest die neue Spalte.

create or replace function public.ist_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select admin from public.members where user_id = auth.uid()),
    false
  )
$$;

create or replace function public.darf_zuteilen()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select admin or zuteiler from public.members where user_id = auth.uid()),
    false
  )
$$;

create or replace function public.abwesenheit_gruende()
returns table (id uuid, reason text)
language sql stable security definer
set search_path = public
as $$
  select a.id, a.reason
    from public.absences a
   where a.congregation_id = public.my_congregation_id()
     and a.reason <> ''
     and (
       public.ist_admin()
       or a.user_id = auth.uid()
       or (a.person_id is not null and a.person_id = public.my_person_id())
     )
$$;

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
     and (m.admin or m.zuteiler);
end;
$$;

-- Jede Richtlinie, die den Admin fragt (14).

drop policy if exists congregations_update on public.congregations;
create policy congregations_update on public.congregations
  for update using (id = public.my_congregation_id() and public.ist_admin());

drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select using (
    user_id = auth.uid()
    or (congregation_id = public.my_congregation_id() and public.ist_admin())
  );

drop policy if exists members_update on public.members;
create policy members_update on public.members
  for update
  using (congregation_id = public.my_congregation_id() and public.ist_admin())
  with check (congregation_id = public.my_congregation_id() and public.ist_admin());

drop policy if exists members_delete on public.members;
create policy members_delete on public.members
  for delete using (
    congregation_id = public.my_congregation_id()
    and public.ist_admin()
    and user_id <> auth.uid()
  );

drop policy if exists persons_write on public.persons;
create policy persons_write on public.persons
  for all
  using (congregation_id = public.my_congregation_id() and public.ist_admin())
  with check (congregation_id = public.my_congregation_id() and public.ist_admin());

drop policy if exists households_write on public.households;
create policy households_write on public.households
  for all
  using (congregation_id = public.my_congregation_id() and public.ist_admin())
  with check (congregation_id = public.my_congregation_id() and public.ist_admin());

drop policy if exists services_write on public.services;
create policy services_write on public.services
  for all
  using (congregation_id = public.my_congregation_id() and public.ist_admin())
  with check (congregation_id = public.my_congregation_id() and public.ist_admin());

drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups
  for all
  using (congregation_id = public.my_congregation_id() and public.ist_admin())
  with check (congregation_id = public.my_congregation_id() and public.ist_admin());

drop policy if exists absences_write on public.absences;
create policy absences_write on public.absences
  for all
  using (
    congregation_id = public.my_congregation_id()
    and (
      user_id = auth.uid()
      or (person_id is not null and person_id = public.my_person_id())
      or public.ist_admin()
    )
  )
  with check (
    congregation_id = public.my_congregation_id()
    and (
      (user_id = auth.uid() and (person_id is null or person_id = public.my_person_id()))
      or (person_id is not null and person_id = public.my_person_id())
      or public.ist_admin()
    )
  );

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert with check (
    congregation_id = public.my_congregation_id()
    and public.ist_admin()
  );

drop policy if exists trolleys_write on public.trolleys;
create policy trolleys_write on public.trolleys
  for all
  using (congregation_id = public.my_congregation_id() and public.ist_admin())
  with check (congregation_id = public.my_congregation_id() and public.ist_admin());

drop policy if exists anmelde_links_select on public.anmelde_links;
create policy anmelde_links_select on public.anmelde_links
  for select using (congregation_id = public.my_congregation_id() and public.ist_admin());

drop policy if exists anmelde_links_delete on public.anmelde_links;
create policy anmelde_links_delete on public.anmelde_links
  for delete using (congregation_id = public.my_congregation_id() and public.ist_admin());

drop policy if exists geraete_fehler_select on public.geraete_fehler;
create policy geraete_fehler_select on public.geraete_fehler
  for select using (congregation_id = public.my_congregation_id() and public.ist_admin());

-- Danach fragt niemand mehr `is_planner()`.
drop function if exists public.is_planner();
