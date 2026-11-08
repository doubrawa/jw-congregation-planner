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
 * bräuchte es ein zweites, echtes Supabase-Projekt neben dem Betrieb, und das
 * gibt es nicht. Die Probe deckt ab, was eine leere Datenbank zeigen kann:
 * dass jede Zeile hineingeht — so streng, wie PostgREST sie annähme — und
 * jede wieder dasteht.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/rueckspielprobe.mjs <sicherung.json>
 *
 * Die leere Postgres kommt aus `pglite-postgres.mjs` (PGlite, seit T169 eine
 * Entwicklungs-Abhängigkeit) — samt dem Vorspann für `auth` und die Rollen.
 */

import fs from 'node:fs'
import path from 'node:path'
import { alsSkript } from './gemeinsam.mjs'
import { leerePostgres } from './pglite-postgres.mjs'
import { REPO, tabellenAusSchema } from './sicherung.mjs'
import { alteNamenUebernehmen, aufgeschobene, fremdschluessel, spaltenAbgleich, zeileTeilen } from './zurueckspielen.mjs'

export async function main(argv = process.argv.slice(2)) {
  const datei = argv.find((a) => !a.startsWith('--'))
  if (!datei || !fs.existsSync(datei)) {
    console.error('Aufruf: node scripts/rueckspielprobe.mjs <sicherung.json>')
    process.exit(2)
  }

  const sicherung = alteNamenUebernehmen(JSON.parse(fs.readFileSync(datei, 'utf8')))
  const schema = fs.readFileSync(path.join(REPO, 'supabase', 'schema.sql'), 'utf8')

  const db = await leerePostgres([schema])
  console.log('schema.sql in eine leere Postgres eingespielt, ohne Fehler.')

  // Die Konten zuerst — `members.user_id` zeigt auf `auth.users`.
  await db.query('insert into auth.users (id, email) select * from json_populate_recordset(null::auth.users, $1::json)', [
    JSON.stringify((sicherung.konten ?? []).map((k) => ({ id: k.id, email: k.email }))),
  ])

  const tabellen = tabellenAusSchema(schema).filter((t) => t.name in (sicherung.tabellen ?? {}))
  const warten = aufgeschobene(tabellen, fremdschluessel(schema))
  const { auslassen, hinweise, gefuellt } = spaltenAbgleich(tabellen, sicherung)
  if (gefuellt.length) {
    console.error(`Spalten, die schema.sql nicht kennt, tragen in der Sicherung etwas: ${gefuellt.join(', ')}.`)
    console.error('zurueckspielen.mjs hielte hier an — die Probe auch.')
    process.exit(1)
  }
  for (const h of hinweise) console.log(h)

  /*
   * Geschrieben wird, wie PostgREST es tut: eine Anweisung je Tabelle, die
   * Zeilen als JSON. **Mit derselben Strenge:** `json_populate_recordset`
   * überginge eine Spalte, die die Tabelle nicht hat, still — PostgREST weist
   * die ganze Zeile ab. Deshalb wird jeder Schlüssel vorher gegen den Katalog
   * gehalten; sonst bestünde die Probe mit einer Sicherung, die das echte
   * Skript nicht zurückspielen kann (so geschehen mit `persons.dn`).
   */
  const { rows: katalog } = await db.query(
    "select table_name, column_name from information_schema.columns where table_schema = 'public'",
  )
  const spaltenIm = new Map()
  for (const r of katalog) spaltenIm.set(r.table_name, (spaltenIm.get(r.table_name) ?? new Set()).add(r.column_name))
  const nachtraege = []
  for (const t of tabellen) {
    const zeilen = sicherung.tabellen[t.name]
    if (!zeilen.length) continue
    const geteilt = zeilen.map((z) => zeileTeilen(z, warten[t.name] ?? [], auslassen[t.name]))
    const unbekannt = [...new Set(geteilt.flatMap((g) => Object.keys(g.jetzt)))].filter((k) => !spaltenIm.get(t.name)?.has(k))
    if (unbekannt.length) {
      throw new Error(`${t.name}: ${unbekannt.join(', ')} gibt es im Ziel nicht — PostgREST nähme diese Zeilen nicht an.`)
    }
    // Nur die Spalten der Sicherung, wie PostgREST: Eine, die eine Migration
    // seither angelegt hat, bekommt ihren Standardwert — mit `select *` käme sie
    // als NULL an (so am 8.11.2026 mit `persons.admin_vorgemerkt`, E4).
    const spalten = [...new Set(geteilt.flatMap((g) => Object.keys(g.jetzt)))].join(', ')
    await db.query(
      `insert into public.${t.name} (${spalten}) select ${spalten} from json_populate_recordset(null::public.${t.name}, $1::json)`,
      [JSON.stringify(geteilt.map((g) => g.jetzt))],
    )
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
