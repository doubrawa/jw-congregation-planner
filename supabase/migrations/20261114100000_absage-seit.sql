-- =============================================================================
-- Eine Absage wird einmal gemeldet (14. November 2026)
-- =============================================================================
-- Die Function `substitute` (Aufruf 'absage') meldete jeden Aufruf: Rief ein
-- Mitglied sie für denselben Platz noch einmal, bekamen alle, die planen,
-- dieselbe Zeile und denselben Push noch einmal. Sie erkennt eine schon
-- gemeldete Absage jetzt daran, seit wann die Absage gilt — `absagen.created_at`.
--
-- Dafür setzt eine **neue** Absage die Zeit neu, auch wenn die Zeile noch von
-- einer früheren derselben Person steht (der Platz war dazwischen bei einem
-- anderen). Bisher blieb sie beim ersten Mal stehen. Begründung und
-- Einzelheiten stehen am selben Block in `schema.sql`; gelesen wurde
-- `created_at` bis hierher von niemandem.
-- =============================================================================

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
      set created_at = now()
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
