-- =============================================================================
-- Push-Abos nur von den bekannten Diensten (20. November 2026)
-- =============================================================================
-- Aus dem Sicherheits-Review vom 19. November (Nr. 3), entschieden vom
-- Betreiber am 20. November. Der Endpoint eines Abos war frei wählbar, und die
-- Functions riefen ihn ungeprüft auf. Erlaubt sind Google, Apple, Mozilla und
-- Microsoft. Begründung und Einzelheiten stehen am selben Block in `schema.sql`.
--
-- Ein Abo bei einem anderen Dienst bekäme danach ohnehin nichts mehr; es geht
-- vor der Regel heraus, sonst scheiterte die Migration daran. Gemessen am
-- 20. November: 3 Abos, alle bei Google oder Apple — es trifft keins.
-- =============================================================================

delete from public.push_subscriptions
 where endpoint !~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com)/';

alter table public.push_subscriptions
  add constraint push_subscriptions_dienst check (
    endpoint ~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com)/'
  );
