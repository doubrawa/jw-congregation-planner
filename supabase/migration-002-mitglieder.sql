-- =============================================================================
-- Migration 002 — Mitglieder-Verwaltung & Einladungscodes
-- =============================================================================
-- Für Datenbanken, die vor dieser Migration eingerichtet wurden. Einmalig im
-- Supabase SQL-Editor ausführen (idempotent formuliert). Neuinstallationen
-- brauchen diese Datei nicht — schema.sql enthält alles.
--
-- Inhalt:
--   1. members.email (Anzeige im Mitglieder-Panel) + Backfill aus auth.users
--   2. Planer dürfen Mitglieder ihrer Versammlung verwalten (update/delete;
--      sich selbst entfernen ist gesperrt)
--   3. Tabelle invites + Funktion redeem_invite(): Registrierte Nutzer treten
--      mit einem Einladungscode der Versammlung bei — ganz ohne SQL
-- =============================================================================

-- 1. E-Mail am Mitglied (nur versammlungsintern sichtbar, RLS wie gehabt)
alter table public.members
  add column if not exists email text not null default '';

update public.members m
set email = u.email
from auth.users u
where u.id = m.user_id and m.email = '';

-- 2. Mitglieder-Verwaltung durch Planer
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
    and user_id <> auth.uid()          -- sich selbst nicht entfernen
  );

-- 3. Einladungscodes: Planer erstellen/verwalten; eingelöst wird über die
--    security-definer-Funktion (der Beitretende hat ja noch keine Mitgliedschaft
--    und kann die Tabelle selbst nicht lesen).
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

alter table public.invites enable row level security;

drop policy if exists invites_all on public.invites;
create policy invites_all on public.invites
  for all
  using (congregation_id = public.my_congregation_id() and public.is_planner())
  with check (congregation_id = public.my_congregation_id() and public.is_planner());

-- Beitritt per Code. Rückgabe: null = Erfolg, sonst Fehlercode für die App
-- ('already-member' | 'invalid-code').
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
  select * into inv
  from public.invites
  where code = upper(trim(invite_code)) and redeemed_by is null;
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
