/**
 * **Eine leere Postgres im Prozess** — für Proben, die fragen „was tut Postgres
 * hier?" (Rechte, RLS, Trigger, `on conflict`) und für die, die ein ganzes
 * Schema einspielen wollen.
 *
 * PGlite ist Postgres 16 als WebAssembly: kein Server, kein Docker, keine
 * Projekt-Abhängigkeit zur Laufzeit der App — eine Entwicklungs-Abhängigkeit,
 * damit `supabase/migrationen.test.ts` in der CI mitlaufen kann (T169).
 *
 * Hier steht der **Vorspann**, nicht in den Aufrufern: Was Supabase mitbringt
 * und `schema.sql` voraussetzt, ist dieselbe Entscheidung für jede Probe, und
 * zwei Abschriften davon liefen auseinander, sobald eine Richtlinie eine
 * weitere Rolle oder Tabelle anspricht.
 */

import { PGlite } from '@electric-sql/pglite'

/**
 * Die drei Rollen und ein Schema `auth` mit genau so viel, wie die
 * Fremdschlüssel, Richtlinien und Aufräumregeln brauchen.
 *
 * `service_role` umgeht RLS (`bypassrls`) wie bei Supabase; die
 * Standardrechte bekommen alle drei Rollen, ebenfalls wie dort — die Grenze
 * zieht in diesem Projekt RLS, nicht der Grant. Ohne `set role` läuft jede
 * Abfrage als Superuser, und dann greift gar kein Recht.
 */
export const AUTH_VORSPANN = `
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create table auth.sessions (id uuid primary key default gen_random_uuid(), updated_at timestamptz default now());
create table auth.audit_log_entries (id uuid primary key default gen_random_uuid(), created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

/**
 * Eine frische Postgres mit dem Vorspann — und, wenn angegeben, mit diesen
 * SQL-Dateien nacheinander darin.
 *
 * `stuecke` sind SQL-Texte, nicht Pfade: Der Aufrufer entscheidet, was er
 * einspielt (ein ganzes `schema.sql` oder eine Folge von Migrationen), und die
 * Probe kann ihm dabei etwas unterschieben.
 */
export async function leerePostgres(stuecke = []) {
  const db = new PGlite()
  await db.exec(AUTH_VORSPANN)
  for (const sql of stuecke) await db.exec(sql)
  return db
}
