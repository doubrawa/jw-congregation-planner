-- Migration 016: Schreibkonflikte zwischen zwei Planern verhindern (T39)
--
-- `saveWeek` schrieb die **komplette Woche** als JSONB-Upsert — ohne Sperre und
-- ohne Versionskennzeichen. Planen zwei Koordinatoren gleichzeitig, gewinnt
-- schlicht der Letzte: seine Fassung überschreibt die des anderen vollständig,
-- und zwar lautlos. Der README behandelt genau dieses Risiko ausführlich für den
-- **Offline**-Fall; online bestand es unverändert weiter.
--
-- Das Gegenmittel ist ein Stand je Zeile. Wer schreibt, nennt den Stand, auf dem
-- seine Fassung beruht; trifft er nicht mehr zu, war jemand schneller und der
-- Schreibvorgang findet keine Zeile. Der Client lädt dann neu und sagt es dem
-- Nutzer, statt fremde Arbeit zu überschreiben.
--
-- **Der Stand wird vom Trigger gesetzt, nicht vom Client.** Sonst könnte ein
-- veralteter oder fehlerhafter Client ihn mitliefern und sich damit an der
-- Prüfung vorbeischreiben — die Sicherung säße auf der falschen Seite.
--
-- Der Client erfindet den Wert nie: er reicht genau die Zeichenkette zurück, die
-- er zuvor von PostgREST bekommen hat. Damit sind Genauigkeit und Zeitzone kein
-- Thema.
--
-- Idempotent, gefahrlos mehrfach ausführbar.
-- Neuinstallationen brauchen diese Datei nicht — schema.sql enthält alles.

alter table public.weeks
  add column if not exists updated_at timestamptz not null default now();

-- Allgemein gehalten: dieselbe Funktion kann später weitere Tabellen bedienen.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weeks_touch_updated_at on public.weeks;
create trigger weeks_touch_updated_at
  before update on public.weeks
  for each row execute function public.touch_updated_at();
