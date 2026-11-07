-- =============================================================================
-- Fehlermeldungen von den Geräten (T171, 7. November 2026)
-- =============================================================================
-- Eine neue Tabelle `geraete_fehler` samt Bremse, Rechten und Frist. Die
-- Blöcke stehen wörtlich so in `supabase/schema.sql`; dass beide Wege
-- dieselbe Datenbank ergeben, hält `supabase/migrationen.test.ts` fest.
--
-- `alte_daten_loeschen` kommt ganz mit: Eine Funktion lässt sich nicht
-- teilweise ändern, und die neue Regel steht in ihrem Rumpf.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fehlermeldungen von den Geräten (T171)
-- ---------------------------------------------------------------------------
-- Fehler bei den Nutzern sah bis zum 7.11.2026 niemand: `ErrorBoundary` und
-- `NachladeGrenze` schrieben in die Konsole des Geräts, ein `error` oder
-- `unhandledrejection` außerhalb davon verpuffte. Bekannt wurde nur, was der
-- Betreiber selbst bemerkte.
--
-- **Was hier NICHT steht:** keine Konto-Id, keine Person-Id, keine Eingaben.
-- Eine Meldung ist bloß eine Zeichenkette — und auch die kann tragen, was
-- jemand getippt hat, deshalb ist sie gekürzt und die Länge in der Datenbank
-- begrenzt. Die Versammlung steht dabei, weil Rechte und Aufbewahrung an ihr
-- hängen; wer gemeldet hat, bleibt offen. Für die Suche genügt der Stand der
-- App und der Bildschirm.
create table if not exists public.geraete_fehler (
  id              uuid primary key default gen_random_uuid(),
  congregation_id uuid not null references public.congregations (id) on delete cascade,
  at              timestamptz not null default now(),
  -- `__BUILD_ID__` — ohne den Stand ist eine Meldung nicht zuzuordnen.
  stand           text not null default '' check (length(stand) <= 40),
  -- Der Screen (`state.screen`), nicht die Adresse: Die trägt Kennungen.
  bildschirm      text not null default '' check (length(bildschirm) <= 40),
  art             text not null check (art in ('fehler', 'versprechen', 'grenze', 'nachladen')),
  meldung         text not null check (length(meldung) <= 300),
  -- Gekürzt und ohne Adressparameter: In einem `#go=…` stünde eine Aufgaben-Id.
  stapel          text not null default '' check (length(stapel) <= 1200),
  -- Familie und Hauptversion, nicht die ganze Browserkennung — die ist ein
  -- Fingerabdruck und sagt über den Fehler nichts mehr aus.
  browser         text not null default '' check (length(browser) <= 60)
);

create index if not exists geraete_fehler_at_idx
  on public.geraete_fehler (congregation_id, at desc);

-- **Die Bremse, die einen Neuladen-Kreis übersteht.**
--
-- Die App meldet Gleiches nur einmal je Sitzung und höchstens einige Male je
-- Stunde (`src/lib/fehler-melden.ts`). Beides steht im Speicher des Tabs —
-- und genau der ist weg, wenn ein Fehler zum Neuladen führt und die Seite
-- danach wieder scheitert. Ein solcher Kreis schriebe ohne diese Bremse
-- endlos.
--
-- `security definer`, und das ist hier nicht Bequemlichkeit: Ein Verkündiger
-- darf diese Tabelle nicht lesen (Richtlinie unten). Zählte der Trigger mit
-- seinen Rechten, käme immer 0 heraus und die Bremse griffe nie.
--
-- Abgewiesen wird **still** (`return null` überspringt die Zeile): Das Melden
-- eines Fehlers darf nie selbst einen Fehler auslösen — die App stünde sonst
-- im Kreis, den sie gerade melden wollte.
create or replace function public.geraete_fehler_bremse()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  select count(*) into n
    from public.geraete_fehler
   where congregation_id = new.congregation_id
     and at >= now() - interval '1 hour';
  if n >= 30 then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists geraete_fehler_bremsen on public.geraete_fehler;
create trigger geraete_fehler_bremsen
  before insert on public.geraete_fehler
  for each row execute function public.geraete_fehler_bremse();

-- Fehlermeldungen von den Geräten (T171): **schreiben darf jedes angemeldete
-- Mitglied** in die eigene Versammlung — gemeldet wird ja gerade dann, wenn es
-- bei ihm klemmt. Vor der Anmeldung geht nichts: `my_congregation_id()` ist
-- dann null, und `congregation_id = null` ist NULL, was `with check` abweist.
-- Stünde die Tabelle auch ohne Anmeldung offen, könnte sie jeder füllen.
--
-- **Lesen nur der Admin** — und der Betreiber per Skript
-- (`scripts/geraete-fehler.mjs`, mit dem Dienstschlüssel an jeder Richtlinie
-- vorbei). Ein Verkündiger hat hier nichts zu suchen: In einer Meldung kann
-- stehen, woran ein anderer gerade gearbeitet hat.
--
-- **Kein Ändern, kein Löschen** — ohne Richtlinie dafür kann kein Konto eine
-- Meldung verstellen oder verschwinden lassen. Abgeräumt wird allein von
-- `alte_daten_loeschen` (acht Wochen, `security definer`).
alter table public.geraete_fehler enable row level security;

drop policy if exists geraete_fehler_insert on public.geraete_fehler;
create policy geraete_fehler_insert on public.geraete_fehler
  for insert with check (congregation_id = public.my_congregation_id());

drop policy if exists geraete_fehler_select on public.geraete_fehler;
create policy geraete_fehler_select on public.geraete_fehler
  for select using (congregation_id = public.my_congregation_id() and public.is_planner());

create or replace function public.alte_daten_loeschen(trocken boolean default false)
returns table (tabelle text, zeilen bigint)
language plpgsql security definer
set search_path = public
as $$
declare
  montag constant date := date_trunc('week', current_date)::date;
  ein_jahr constant timestamptz := (montag - 7 * 52)::timestamptz;
  acht_wochen constant timestamptz := (montag - 7 * 8)::timestamptz;
  regel record;
  n bigint;
begin
  for regel in
    select r.name, r.bedingung, r.grenze
      from (values
        -- Die Wochen und was zu ihnen gehört: ein Jahr.
        ('weeks', 'start < $1', ein_jahr),
        ('fs_weeks', 'start < $1', ein_jahr),
        ('confirmations', 'coalesce(woche_im_schluessel(task_key), to_char(created_at, ''YYYY-MM-DD'')) < to_char($1, ''YYYY-MM-DD'')', ein_jahr),
        ('assignment_log', 'coalesce(woche_im_schluessel(task_key), to_char(sent_at, ''YYYY-MM-DD'')) < to_char($1, ''YYYY-MM-DD'')', ein_jahr),
        ('gruppenbesuche', 'woche < $1', ein_jahr),
        ('vortraege', 'woche < $1', ein_jahr),
        ('anwesenheit', 'woche < $1', ein_jahr),
        -- Eine Tausch-Anfrage, deren früherer Tag vorbei ist, beantwortet
        -- niemand mehr (T153). Die App zeigt sie ab dem Tag danach nicht mehr.
        ('tausch_anfragen', 'bis < $1', montag::timestamptz),
        -- Ein „Nein, danke" auf ein Gesuch, dessen Woche vorbei ist, fragt
        -- niemand mehr ab — die App legt Vergangenes ohnehin nicht vor.
        ('abgelehnte_gesuche', 'coalesce(woche_im_schluessel(task_key), to_char(created_at, ''YYYY-MM-DD'')) < to_char($1, ''YYYY-MM-DD'')', montag::timestamptz),
        ('plaene', 'bis < $1', ein_jahr),
        ('plan_eintraege', 'datum < $1', ein_jahr),
        ('absagen', 'woche < $1', ein_jahr),
        -- Abwesenheiten ein Jahr ab ihrem Ende — die Auswertung rechnet mit ihnen
        -- (T126, 17.10.2026). Ihr Grund geht nach acht Wochen (unten).
        ('absences', 'to_date < $1', ein_jahr),
        -- Alles andere: acht Wochen.
        ('notifications', 'created_at < $1', acht_wochen),
        -- Fehlermeldungen von den Geräten (T171): Ein Fehler, den acht Wochen
        -- niemand angesehen hat, wird nicht mehr gesucht.
        ('geraete_fehler', 'at < $1', acht_wochen),
        ('reminder_log', 'sent_on < $1', acht_wochen),
        ('trolley_termine', 'datum < $1', acht_wochen),
        ('anmelde_links', 'gueltig_bis < $1', acht_wochen),
        -- Ein Einmal-Code, der nicht eingelöst wurde: sobald er abgelaufen ist.
        ('anmelde_einmalcodes', 'gueltig_bis < $1', now()),
        -- Die Bremse gegen Raten: ein Tag.
        ('anmelde_fehlversuche', 'at < $1', now() - interval '1 day'),
        -- Das Protokoll von Supabase Auth: acht Wochen.
        ('auth.audit_log_entries', 'created_at < $1', acht_wochen),
        -- Die Anmeldung eines Geräts mit IP-Adresse und Browserkennung: ein
        -- Jahr ohne Nutzung (19.10.2026). Ohne Höchstdauer räumt Supabase sie
        -- nie ab; `updated_at` rückt bei jeder Erneuerung des Tokens nach
        -- (gemessen). Das Gerät braucht danach einen neuen Link.
        ('auth.sessions', 'updated_at < $1', ein_jahr)
      ) as r(name, bedingung, grenze)
  loop
    -- Ohne Schema heißt `public` (search_path); `regclass` schreibt den Namen
    -- so, dass er genau diese Tabelle trifft.
    begin
      if trocken then
        execute format('select count(*) from %s where %s', regel.name::regclass, regel.bedingung) into n using regel.grenze;
      else
        execute format('delete from %s where %s', regel.name::regclass, regel.bedingung) using regel.grenze;
        get diagnostics n = row_count;
      end if;
    exception when insufficient_privilege then
      -- Die Tabellen von Supabase gehören nicht uns. Entzieht Supabase das
      -- Recht daran, räumen die übrigen Regeln trotzdem; `zeilen` bleibt leer.
      raise warning 'alte_daten_loeschen: kein Recht an %', regel.name;
      n := null;
    end;
    tabelle := regel.name;
    zeilen := n;
    return next;
  end loop;

  -- Der Grund einer Abwesenheit: acht Wochen ab ihrem Ende. Den Zeitraum
  -- braucht die Auswertung ein Jahr, den Grund niemand so lange (17.10.2026).
  if trocken then
    select count(*) into n from public.absences where to_date < acht_wochen and reason <> '';
  else
    update public.absences set reason = '' where to_date < acht_wochen and reason <> '';
    get diagnostics n = row_count;
  end if;
  tabelle := 'absences.reason';
  zeilen := n;
  return next;
end;
$$;

revoke all on function public.alte_daten_loeschen(boolean) from public;
revoke all on function public.alte_daten_loeschen(boolean) from anon, authenticated;
