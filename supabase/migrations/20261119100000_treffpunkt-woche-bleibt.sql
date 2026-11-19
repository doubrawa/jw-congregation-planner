-- =============================================================================
-- Eine Treffpunkt-Woche bleibt, wo sie ist (19. November 2026)
-- =============================================================================
-- Aus dem Sicherheits-Review vom selben Tag. `fs_weeks_pruefen` verglich beim
-- Gruppenaufseher nur die Treffpunkte (`data`) alt gegen neu; den Montag der
-- Zeile prüfte niemand. Er konnte die Woche auf einen anderen Montag verschieben
-- und an ihre Stelle eine leere legen — die Treffpunkte der anderen Gruppen und
-- der Versammlung waren für diese Woche fort, an „nur-eigene-gruppe" vorbei.
-- Der Trigger weist jetzt ein Ändern ab, das Montag oder Versammlung der Zeile
-- wechselt. Begründung und Einzelheiten stehen am selben Block in `schema.sql`.
--
-- Der Trigger selbst (`fs_weeks_pruefen` an `fs_weeks`) bleibt, wie er ist.
-- =============================================================================

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
    if new.start <> old.start or new.congregation_id <> old.congregation_id then
      raise exception 'woche-bleibt' using errcode = '42501';
    end if;
    vorher := old.data;
  else
    select f.data into vorher
      from public.fs_weeks f
     where f.congregation_id = new.congregation_id and f.start = new.start;
  end if;
  eigene := public.eigene_gruppen();
  if public.fs_fremde(coalesce(vorher, '[]'::jsonb), eigene)
       is distinct from public.fs_fremde(new.data, eigene)
     or not public.fs_fremde_bindung_ok(coalesce(vorher, '[]'::jsonb), new.data, eigene, new.congregation_id) then
    raise exception 'nur-eigene-gruppe' using errcode = '42501';
  end if;
  return new;
end;
$$;
