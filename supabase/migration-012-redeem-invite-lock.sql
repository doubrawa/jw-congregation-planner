-- =============================================================================
-- Migration 012: Einladung einlösen – Sperre gegen gleichzeitiges Einlösen
-- =============================================================================
-- Ausführen im Supabase SQL-Editor (idempotent, ersetzt die Funktion). Härtung
-- des Einlöse-Flows: bisher las redeem_invite die Einladungszeile ohne Sperre.
-- Lösen zwei Konten denselben Code im selben Moment ein, könnten beide die
-- Prüfung „redeemed_by is null" passieren und je ein Mitglied für dieselbe
-- Person anlegen. Mit FOR UPDATE wartet die zweite Transaktion, sieht danach
-- redeemed_by gesetzt und gibt 'invalid-code' zurück.
--
-- Rein defensiv — im normalen Betrieb (ein Code pro Person) tritt der Fall
-- praktisch nicht auf; die Sperre schließt ihn dennoch sicher aus.

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
