-- =============================================================================
-- Ein Ersatzgesuch endet mit seiner Absage (14. November 2026)
-- =============================================================================
-- „Ersatz gesucht" blieb in den Glocken stehen, wenn der Planer einen
-- abgesagten Hilfsdienst neu besetzte oder freigab — aufgeräumt hatten nur das
-- Einspringen und „Doch bestätigen" in der Function. Ein Trigger an
-- `confirmations` räumt die Zeilen jetzt, sobald die Absage geht, auf jedem
-- Weg. Begründung und Einzelheiten stehen am selben Block in `schema.sql`.
--
-- Was schon verwaist in den Glocken steht, räumt sie nicht auf: Es geht mit
-- der Aufbewahrung nach acht Wochen.
-- =============================================================================

create or replace function public.ersatzgesuch_beenden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.confirmations c
     where c.congregation_id = old.congregation_id
       and c.task_key = old.task_key
       and c.status = 'verhindert'
  ) then
    delete from public.notifications n
     where n.congregation_id = old.congregation_id
       and n.task_key = old.task_key
       and n.title = 'Ersatz gesucht';
  end if;
  return null;
end;
$$;

revoke all on function public.ersatzgesuch_beenden() from public;
revoke all on function public.ersatzgesuch_beenden() from anon, authenticated;

drop trigger if exists confirmations_gesuch on public.confirmations;
create trigger confirmations_gesuch
  after delete or update of status on public.confirmations
  for each row execute function public.ersatzgesuch_beenden();
