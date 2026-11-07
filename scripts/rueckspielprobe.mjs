#!/usr/bin/env node
/**
 * **Die Rückspielprobe, lokal** (T168): eine echte Sicherung in eine leere
 * Postgres zurückspielen und Zeilen je Tabelle gegen die Quelle zählen.
 *
 * Eine Sicherung, die nie zurückgespielt wurde, ist eine Datei, von der man
 * hofft. Diese Probe nimmt die Hoffnung heraus: Die leere Datenbank ist ein
 * echtes Postgres 16 (PGlite, als WASM im Prozess), es gelten also alle
 * Fremdschlüssel, Bedingungen und Trigger aus `supabase/schema.sql` — eine
 * Reihenfolge, die nicht aufgeht, fällt hier auf und nicht erst im Ernstfall.
 *
 * **Geordnet wird mit dem Code des echten Skripts** (`aufgeschobene`,
 * `zeileTeilen` aus `zurueckspielen.mjs`), nicht mit einer Abschrift. Sonst
 * prüfte die Probe eine zweite Umsetzung, die niemand benutzt. Was hier an
 * eigenem Code steht, ist der Vorspann für `auth` und das Zählen.
 *
 * **Was sie nicht kann:** anmelden und die Mitgliedsrechte-Probe fahren. Dafür
 * braucht es ein echtes Supabase-Projekt — das Staging-Projekt aus T170. Bis
 * dahin deckt diese Probe das ab, was eine leere Datenbank zeigen kann: dass
 * jede Zeile hineingeht und jede wieder dasteht.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   npm install --no-save @electric-sql/pglite@0.2.17
 *   node scripts/rueckspielprobe.mjs <sicherung.json>
 *
 * PGlite ist **keine** Abhängigkeit des Projekts: Die App braucht es nicht,
 * und ein Paket, das nur eine Probe benutzt, gehört nicht in jede
 * Installation. Fehlt es, sagt das Skript, wie man es holt.
 */

import fs from 'node:fs'
import path from 'node:path'
import { alsSkript } from './gemeinsam.mjs'
import { REPO, tabellenAusSchema } from './sicherung.mjs'
import { aufgeschobene, fremdschluessel, zeileTeilen } from './zurueckspielen.mjs'

/**
 * Was Supabase mitbringt und `schema.sql` voraussetzt: die drei Rollen und ein
 * Schema `auth` mit genau so viel, wie die Fremdschlüssel und Richtlinien
 * brauchen. `service_role` umgeht RLS (`bypassrls`) wie dort; die Grenze zieht
 * in diesem Projekt RLS, nicht der Grant — deshalb bekommen alle drei Rollen
 * die Standardrechte, genau wie bei Supabase.
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

export async function main(argv = process.argv.slice(2)) {
  const datei = argv.find((a) => !a.startsWith('--'))
  if (!datei || !fs.existsSync(datei)) {
    console.error('Aufruf: node scripts/rueckspielprobe.mjs <sicherung.json>')
    process.exit(2)
  }

  let PGlite
  try {
    ;({ PGlite } = await import('@electric-sql/pglite'))
  } catch {
    console.error('PGlite fehlt. Einmal holen:\n  npm install --no-save @electric-sql/pglite@0.2.17')
    process.exit(2)
  }

  const sicherung = JSON.parse(fs.readFileSync(datei, 'utf8'))
  const schema = fs.readFileSync(path.join(REPO, 'supabase', 'schema.sql'), 'utf8')

  const db = new PGlite()
  await db.exec(AUTH_VORSPANN)
  await db.exec(schema)
  console.log('schema.sql in eine leere Postgres eingespielt, ohne Fehler.')

  // Die Konten zuerst — `members.user_id` zeigt auf `auth.users`.
  await db.query('insert into auth.users (id, email) select * from json_populate_recordset(null::auth.users, $1::json)', [
    JSON.stringify((sicherung.konten ?? []).map((k) => ({ id: k.id, email: k.email }))),
  ])

  const tabellen = tabellenAusSchema(schema).filter((t) => t.name in (sicherung.tabellen ?? {}))
  const warten = aufgeschobene(tabellen, fremdschluessel(schema))

  // Geschrieben wird, wie PostgREST es tut: eine Anweisung je Tabelle, die
  // Zeilen als JSON. So prüft die Probe denselben Weg wie das echte Skript.
  const nachtraege = []
  for (const t of tabellen) {
    const zeilen = sicherung.tabellen[t.name]
    if (!zeilen.length) continue
    const geteilt = zeilen.map((z) => zeileTeilen(z, warten[t.name] ?? [], t.generiert))
    await db.query(`insert into public.${t.name} select * from json_populate_recordset(null::public.${t.name}, $1::json)`, [
      JSON.stringify(geteilt.map((g) => g.jetzt)),
    ])
    for (const [i, g] of geteilt.entries()) if (Object.keys(g.nach).length) nachtraege.push({ t, zeile: zeilen[i], werte: g.nach })
  }
  for (const n of nachtraege) {
    const werte = Object.values(n.werte)
    const setzen = Object.keys(n.werte).map((c, i) => `${c} = $${i + 1}`)
    const wo = n.t.pk.map((c, i) => `${c} = $${werte.length + i + 1}`)
    await db.query(`update public.${n.t.name} set ${setzen.join(', ')} where ${wo.join(' and ')}`, [
      ...werte,
      ...n.t.pk.map((c) => n.zeile[c]),
    ])
  }
  console.log(`${nachtraege.length} nachgetragene Verweise (${Object.keys(warten).join(', ') || 'keine'}).`)

  let abweichungen = 0
  console.log('\nTabelle                   Sicherung  →  zurückgespielt')
  for (const t of tabellen) {
    const soll = sicherung.tabellen[t.name].length
    const { rows } = await db.query(`select count(*)::int as n from public.${t.name}`)
    const ist = rows[0].n
    if (soll !== ist) abweichungen++
    console.log(`${t.name.padEnd(24)} ${String(soll).padStart(6)}  →  ${String(ist).padStart(6)}${soll === ist ? '' : '   ABWEICHUNG'}`)
  }
  const { rows: konten } = await db.query('select count(*)::int as n from auth.users')
  const sollKonten = (sicherung.konten ?? []).length
  if (konten[0].n !== sollKonten) abweichungen++
  console.log(`${'(Konten)'.padEnd(24)} ${String(sollKonten).padStart(6)}  →  ${String(konten[0].n).padStart(6)}`)

  /*
   * **Zählt die Zählung?** Ohne diese Gegenprobe bestünde der Lauf auch dann,
   * wenn `count(*)` immer dieselbe Zahl läse wie die Sicherung — etwa weil
   * beide Seiten aus derselben Quelle kämen.
   */
  await db.query("insert into public.congregations (name) values ('Gegenprobe')")
  const { rows: nachher } = await db.query('select count(*)::int as n from public.congregations')
  const misst = nachher[0].n === sicherung.tabellen.congregations.length + 1
  console.log(`\nGegenprobe: eine Zeile mehr in congregations → ${nachher[0].n} (${misst ? 'die Zählung misst' : 'DIE ZÄHLUNG MISST NICHT'})`)

  console.log(abweichungen || !misst ? `\n${abweichungen} Tabelle(n) weichen ab.` : '\nAlle Tabellen gleich.')
  if (abweichungen || !misst) process.exitCode = 1
}

alsSkript(import.meta.url, main)
