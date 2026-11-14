-- =============================================================================
-- Ob eine Absage gemeldet ist, steht an ihr selbst (14. November 2026)
-- =============================================================================
-- Die Function `substitute` (Aufruf 'absage') meldet eine Absage einmal. Ob
-- sie es schon getan hat, las sie bis hierher an den Zeilen „Verhinderung
-- gemeldet" in den Glocken ab — die kann jeder Planer löschen („Alle
-- löschen"), und nach acht Wochen räumt sie die Aufbewahrung. Danach ging
-- derselbe Push wieder hinaus. Jetzt vermerkt die Function es an der Absage:
-- `absagen.gemeldet_am`. Eine neue Absage beginnt ungemeldet (der Trigger
-- leert die Spalte, wo er `created_at` neu setzt). Begründung und
-- Einzelheiten stehen an der Spalte und am Trigger in `schema.sql`.
--
-- Bestehende Absagen bleiben ohne Vermerk: Für sie fragt die Function wie
-- bisher die Glocken.
-- =============================================================================

alter table public.absagen add column if not exists gemeldet_am timestamptz;

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
    on conflict (congregation_id, task_key, person_id) do update
      set created_at = now(), gemeldet_am = null
      where not (tg_op = 'UPDATE' and old.status = 'verhindert');
  elsif tg_op = 'UPDATE' and old.status = 'verhindert' then
    delete from public.absagen
     where congregation_id = new.congregation_id and task_key = new.task_key and person_id = person;
  end if;
  return new;
end;
$$;

revoke all on function public.absage_vermerken() from public;
revoke all on function public.absage_vermerken() from anon, authenticated;
