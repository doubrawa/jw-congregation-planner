-- =============================================================================
-- Kommentar am Vornamen (T170, 7. November 2026)
-- =============================================================================
-- Eine harmlose Änderung, an der die Ausroll-Strecke abgenommen wurde: Sie
-- ging über die CI in die Produktion. Der Kommentar steht ebenso in
-- `schema.sql`; `migrationen.test.ts` vergleicht seit T170 auch Kommentare.
-- =============================================================================

comment on column public.persons.fn is
  'Vorname. Vor- und Nachname sind je Versammlung eindeutig (persons_name_eindeutig); bei gleichem Namen unterscheidet ein Zusatz am Vornamen.';
