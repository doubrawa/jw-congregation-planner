-- =============================================================================
-- Zusammenkunftszeiten mit Stichtag (13. November 2026)
-- =============================================================================
-- Bis hierher führte die Versammlung je Zusammenkunft genau eine Zeit
-- (`mid_wd/mid_time/we_wd/we_time`), und die galt für jede Woche zugleich. Ein
-- Wechsel des Tages oder der Uhrzeit zum Jahresanfang ließ sich nicht
-- vorbereiten, und jede Änderung datierte auch die vergangenen Wochen um.
--
-- `zeiten_ab` nimmt die Wechsel auf: `[{ "ab": "<Montag>", "tab": "mid"|"we",
-- "wd": 0–6, "time": "HH:MM" }]`. Die vier Spalten bleiben die Grundzeit —
-- was vor dem ersten Wechsel gilt. Begründung und Einzelheiten stehen an der
-- Spalte in `schema.sql`.
--
-- Jede bestehende Versammlung bekommt die leere Liste: Für sie ändert sich
-- nichts, bis jemand einen Wechsel einträgt.
-- =============================================================================

alter table public.congregations
  add column if not exists zeiten_ab jsonb not null default '[]'::jsonb
    check (jsonb_typeof(zeiten_ab) = 'array');
