-- =============================================================================
-- Das Versand-Tagebuch folgt einer Umbenennung (13. November 2026)
-- =============================================================================
-- `assignment_log` führt je Platz und NAME, wer schon Bescheid weiß. Wurde eine
-- Person umbenannt, galten ihre gemeldeten, noch unbestätigten Plätze wieder als
-- ungemeldet — „Plan senden" hätte ihr dieselbe Nachricht noch einmal geschickt,
-- und der Haken „persönlich Bescheid gesagt" fand seine Zeile nicht mehr.
--
-- Ein Trigger an `persons` zieht den Namen im Tagebuch nach; Begründung und
-- Einzelheiten stehen am selben Block in `schema.sql`. Bestand räumt er nicht
-- auf: Wer vor dieser Migration umbenannt wurde, steht weiter unter dem alten
-- Namen — im schlimmsten Fall kommt für diese Plätze noch einmal eine Meldung.
-- =============================================================================

create or replace function public.tagebuch_umbenennen()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  alt text := btrim(old.fn || ' ' || old.ln);
  neu text := btrim(new.fn || ' ' || new.ln);
begin
  if neu = alt or neu = '' or alt = '' then
    return new;
  end if;
  delete from public.assignment_log weg
   using public.assignment_log bleibt
   where weg.congregation_id = new.congregation_id
     and (weg.person_id = new.id or (weg.person_id is null and weg.name = alt))
     and bleibt.congregation_id = weg.congregation_id
     and bleibt.task_key = weg.task_key
     and (bleibt.person_id = new.id or (bleibt.person_id is null and bleibt.name = alt))
     and (bleibt.sent_at, bleibt.id) > (weg.sent_at, weg.id);
  delete from public.assignment_log weg
   using public.assignment_log eigene
   where weg.congregation_id = new.congregation_id
     and weg.name = neu
     and weg.person_id is distinct from new.id
     and eigene.congregation_id = weg.congregation_id
     and eigene.task_key = weg.task_key
     and (eigene.person_id = new.id or (eigene.person_id is null and eigene.name = alt));
  update public.assignment_log
     set name = neu, person_id = new.id
   where congregation_id = new.congregation_id
     and (person_id = new.id or (person_id is null and name = alt));
  return new;
end;
$$;

revoke all on function public.tagebuch_umbenennen() from public;
revoke all on function public.tagebuch_umbenennen() from anon, authenticated;

drop trigger if exists persons_tagebuch_umbenennen on public.persons;
create trigger persons_tagebuch_umbenennen
  after update of fn, ln on public.persons
  for each row execute function public.tagebuch_umbenennen();
