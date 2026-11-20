-- =============================================================================
-- „Zugang erneuern" nimmt auch ein Kennwort weg (20. November 2026)
-- =============================================================================
-- Aus dem Sicherheits-Review vom 19. November. Ein Konto mit Sitzung kann sich
-- bei Supabase Auth selbst ein Kennwort geben, und die Anmeldung mit Adresse
-- und Kennwort ist im Projekt an. Wer eine Sitzung gestohlen hat, käme mit
-- einem so gesetzten Kennwort auch nach „Zugang erneuern" wieder hinein. Die
-- Function `anmelden` ruft `kennwort_entfernen` beim Sperren mit auf.
-- Begründung und Einzelheiten stehen am selben Block in `schema.sql`.
--
-- Aufrufen darf sie nur die Dienstrolle.
-- =============================================================================

create or replace function public.kennwort_entfernen(konto uuid)
returns void
language sql security definer
set search_path = public
as $$
  update auth.users set encrypted_password = '' where id = konto;
$$;

revoke all on function public.kennwort_entfernen(uuid) from public;
revoke all on function public.kennwort_entfernen(uuid) from anon, authenticated;
grant execute on function public.kennwort_entfernen(uuid) to service_role;
