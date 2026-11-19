-- =============================================================================
-- An alle, die planen, meldet nur, wer selbst plant (19. November 2026)
-- =============================================================================
-- Aus dem Sicherheits-Review vom selben Tag. `notify_planners` nahm von jedem
-- Mitglied eine „Verhinderung" an und schrieb Titel, Rumpf und
-- Aufgaben-Schlüssel ungeprüft in die Glocken von Admin und Planern — eine
-- Absage im Namen eines anderen, ohne Absender. Die App meldet Absagen seit dem
-- 13. November über die Function `substitute`, die den Platz prüft; der Zweig
-- stand nur noch für App-Stände von davor offen. Die Funktion verlangt jetzt für
-- jede Art `darf_zuteilen()` und weist sonst mit 42501 ab (bei PostgREST ein
-- 403). Begründung und Einzelheiten stehen am selben Block in `schema.sql`.
--
-- Die Rechte an der Funktion bleiben, wie sie sind (`authenticated`).
-- =============================================================================

create or replace function public.notify_planners(kind text, subject text, message text, task text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.darf_zuteilen() then
    raise exception 'nur-wer-zuteilt' using errcode = '42501';
  end if;
  insert into public.notifications (congregation_id, user_id, type, title, body, task_key)
  select m.congregation_id, m.user_id, kind, subject, message, nullif(left(task, 300), '')
    from public.members m
   where m.congregation_id = public.my_congregation_id()
     and (m.admin or m.zuteiler);
end;
$$;
