-- Migration 014: Sprache am Push-Abo
--
-- Push-Erinnerungen sind fertiger Text, sobald sie das Gerät erreichen — anders
-- als die Glocke in der App, die beim Anzeigen übersetzt wird. Bis hierher
-- gingen sie deshalb immer auf Deutsch heraus, unabhängig von der gewählten
-- App-Sprache.
--
-- Die Sprache gehört ans Abo und nicht an den Nutzer: sie wird pro Gerät
-- gewählt (wie Farbschema und Schriftgröße), und genau das Gerät bekommt die
-- Nachricht. Bestehende Abos bleiben null → send-reminders nimmt Deutsch, also
-- das bisherige Verhalten.
--
-- Idempotent, gefahrlos mehrfach ausführbar.

alter table public.push_subscriptions
  add column if not exists lang text;

comment on column public.push_subscriptions.lang is
  'App-Sprache dieses Geräts (de, en, …) — Sprache der Push-Erinnerungen; null = Deutsch.';
