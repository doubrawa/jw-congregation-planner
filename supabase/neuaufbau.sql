-- =============================================================================
-- Neuaufbau: alle Tabellen dieser App abräumen
-- =============================================================================
-- **Löscht sämtliche Daten der Datenbank.** Danach `schema.sql` ausführen; die
-- Reihenfolge und die weiteren Schritte stehen im README unter „Neuaufbau".
--
-- Wozu das nötig ist: `schema.sql` ist mit `create table if not exists`
-- formuliert und lässt eine bestehende Tabelle deshalb unangetastet. Eine
-- geänderte Spaltendefinition erreicht eine laufende Datenbank also nicht — und
-- eine Migrationskette daneben soll es nicht wieder geben (siehe Kopf von
-- `schema.sql`). Solange die App nicht ausgerollt ist, ist der Neuaufbau der
-- ehrlichere Weg: eine Quelle, ein Zustand.
--
-- **Ohne eigene Tabellenliste.** Eine Liste hier müsste jede neue Tabelle von
-- Hand nachtragen und wäre beim ersten Vergessen still unvollständig — genau
-- die Fehlerart, die dieses Projekt schon zweimal getroffen hat. Die Schleife
-- fragt stattdessen den Katalog.
--
-- Was **nicht** gelöscht wird: `auth.users`. Die Konten samt Passwörtern
-- bleiben; ihre Mitgliedschaft (`public.members`) ist danach allerdings weg und
-- muss neu angelegt werden — `scripts/versammlung-anlegen.mjs` tut genau das.
-- =============================================================================

do $$
declare
  t record;
begin
  for t in
    select tablename
      from pg_tables
     where schemaname = 'public'
  loop
    execute format('drop table if exists public.%I cascade', t.tablename);
  end loop;
end $$;

-- Die Funktionen ersetzt `schema.sql` per `create or replace` ohnehin; sie
-- fallen hier trotzdem weg, damit eine umbenannte oder gestrichene Funktion
-- nicht als Rest stehen bleibt und weiter von einer Richtlinie gerufen wird.
-- Auch hier ohne Namensliste — und ausdrücklich ohne das, was zu einer
-- Erweiterung gehört (pgcrypto & Co. legen ihre Funktionen je nach Projekt
-- ebenfalls in `public` ab; `gen_random_uuid()` ist eine davon).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signatur
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (
         select 1
           from pg_depend d
          where d.objid = p.oid
            and d.deptype = 'e'        -- gehört zu einer Erweiterung
       )
  loop
    execute format('drop function if exists %s cascade', f.signatur);
  end loop;
end $$;
