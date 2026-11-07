#!/usr/bin/env node
/**
 * **Eine Sicherung in eine leere Datenbank zurückspielen** (T168) — der zweite
 * Teil von `sicherung.mjs`. Eine Sicherung, die nie zurückgespielt wurde, ist
 * keine Sicherung, sondern eine Datei.
 *
 * -------------------------------------------------------------- Der Ablauf --
 *
 * 1. Die leere Datenbank aufbauen: `supabase/schema.sql` einspielen (und die
 *    Zeitpläne daneben, wenn sie gebraucht werden). Die Prüfsumme in der
 *    Sicherung sagt, ob es dasselbe Schema ist.
 * 2. Dieses Skript: erst die **Konten** über die Admin-Schnittstelle (mit
 *    ihrer alten Kennung — `admin/users` nimmt `id`, genau wie die App in
 *    `_shared/konto-admin.ts`), dann die Tabellen in der Reihenfolge von
 *    `schema.sql`.
 * 3. Danach zählen: Zeilen je Tabelle gegen die Sicherung (`--pruefen`).
 *
 * --------------------------------------------------- Der Ring im Schema -----
 *
 * `persons.grp` zeigt auf `groups`, und `groups.overseer_id`/`assistant_id`
 * zeigen zurück auf `persons`. Welche der beiden Tabellen man auch zuerst
 * schreibt — ein Fremdschlüssel zeigt ins Leere. Deshalb schreibt dieses
 * Skript jede Spalte, deren Ziel **später** kommt, zunächst als `null` und
 * trägt sie am Ende nach. Welche das sind, leitet es aus `schema.sql` ab
 * (`aufgeschobene`), statt es aufzuzählen: Ein neuer Fremdschlüssel ist damit
 * von selbst bedacht, und einer, der sich nicht aufschieben lässt (weil die
 * Spalte `not null` ist), bricht den Lauf ab, statt still etwas zu verlieren.
 *
 * ------------------------------------------------------------ Die Grenzen ---
 *
 *  - **Nur in eine leere Datenbank.** Steht in der Zieldatenbank schon eine
 *    Versammlung, bricht das Skript ab. Ein Zurückspielen „obendrauf" gäbe
 *    doppelte Zeilen und eine halb alte, halb neue Planung.
 *  - **Nie versehentlich nach Produktion.** Das Ziel muss mit `--ziel-url`
 *    dastehen; die Projekt-URL aus `.env.local` nimmt das Skript nur mit
 *    `--hierher`.
 *  - **Offene Sitzungen kommen nicht zurück** (`auth.sessions` steht in keiner
 *    Sicherung). Wer angemeldet war, meldet sich mit seinem Link neu an.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/zurueckspielen.mjs <sicherung.json> --ziel-url <url> [--trocken]
 *   node scripts/zurueckspielen.mjs <sicherung.json> --hierher          [--trocken]
 *
 * Der Schlüssel des Ziels kommt aus `--ziel-key`, sonst aus `SUPABASE_SECRET_KEY`
 * (mit `--hierher` aus `.env.local` wie bei allen Skripten). **Immer zuerst mit
 * `--trocken`.**
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { alleZeilen, alsSkript, argumente, funktionsKopf, restKlient, secretKey, zugangsdaten } from './gemeinsam.mjs'
import { ohneKommentare, REPO, rumpfAb, tabellenAusSchema } from './sicherung.mjs'

/* ===================== Fremdschlüssel aus dem Schema ===================== */

/**
 * Alle Fremdschlüssel aus `schema.sql`: Tabelle, Spalten, Zieltabelle.
 *
 * Drei Schreibweisen kommen vor — an der Spalte (`references public.x (id)`),
 * als Bedingung im Tabellenrumpf (`constraint … foreign key (a, b) references
 * …`, oft über zwei Zeilen) und nachgereicht (`alter table … add constraint
 * …`). Alle drei werden gelesen; eine, die durchfiele, ließe eine Abhängigkeit
 * unbemerkt.
 *
 * @returns {{ tabelle: string, spalten: string[], ziel: string, schema: string }[]}
 */
export function fremdschluessel(roh) {
  const sql = ohneKommentare(roh)
  const out = []
  const bedingung = /constraint\s+[a-z_]+\s+foreign key\s*\(([^)]+)\)\s*references\s+(public|auth)\.([a-z_]+)\s*\(/gi
  const inZeile = /(?:^|,)\s*([a-z_]+)\s+[a-z]+[^,]*?\breferences\s+(public|auth)\.([a-z_]+)\s*\(/gi

  const kopf = /create table if not exists (?:public\.)?([a-z_]+) \(/gi
  for (let m = kopf.exec(sql); m; m = kopf.exec(sql)) {
    const rumpf = rumpfAb(sql, kopf.lastIndex - 1)
    for (const f of rumpf.matchAll(inZeile)) out.push({ tabelle: m[1], spalten: [f[1]], ziel: f[3], schema: f[2] })
    for (const f of rumpf.matchAll(bedingung)) {
      out.push({ tabelle: m[1], spalten: f[1].split(',').map((c) => c.trim()), ziel: f[3], schema: f[2] })
    }
  }
  // Nachgereicht: `alter table public.persons add constraint … foreign key …;`
  for (const a of sql.matchAll(/alter table\s+(?:only\s+)?(?:public\.)?([a-z_]+)([\s\S]*?);/gi)) {
    for (const f of a[2].matchAll(bedingung)) {
      out.push({ tabelle: a[1], spalten: f[1].split(',').map((c) => c.trim()), ziel: f[3], schema: f[2] })
    }
  }
  return out
}

/**
 * **Welche Spalte muss warten?** Je Tabelle die Spalten, deren Fremdschlüssel
 * auf eine Tabelle zeigt, die erst später geschrieben wird.
 *
 * Aufgeschoben wird nur, was `null` sein darf — eine Pflichtspalte lässt sich
 * nicht leer schreiben. Gibt es keine solche Spalte im Fremdschlüssel, ist die
 * Reihenfolge unmöglich: Dann wirft die Funktion, statt den Lauf später an
 * einer Fehlermeldung von PostgREST scheitern zu lassen, die niemand mit
 * dieser Stelle verbindet.
 *
 * @returns {Record<string, string[]>} Tabelle → Spalten, die nachgetragen werden
 */
export function aufgeschobene(tabellen, fks) {
  const platz = new Map(tabellen.map((t, i) => [t.name, i]))
  const spaltenNichtNull = new Map(tabellen.map((t) => [t.name, t.nichtNull]))
  const out = {}
  for (const fk of fks) {
    if (fk.schema !== 'public') continue // auth.users entsteht vor allem anderen
    const hier = platz.get(fk.tabelle)
    const dort = platz.get(fk.ziel)
    if (hier === undefined || dort === undefined || dort <= hier) continue
    const nichtNull = spaltenNichtNull.get(fk.tabelle) ?? new Set()
    const warten = fk.spalten.filter((c) => !nichtNull.has(c))
    if (warten.length === 0) {
      throw new Error(
        `${fk.tabelle}.(${fk.spalten.join(', ')}) zeigt auf ${fk.ziel}, das erst später kommt — ` +
          'und keine der Spalten darf null sein. Die Reihenfolge aus schema.sql trägt diesen ' +
          'Fremdschlüssel nicht; zurückspielen geht so nicht.',
      )
    }
    out[fk.tabelle] = [...new Set([...(out[fk.tabelle] ?? []), ...warten])]
  }
  return out
}

/**
 * Eine Zeile in zwei Teile: was sofort geschrieben wird, und was nachkommt.
 * Die Spalten, die die Datenbank selbst vergibt (`generated always as
 * identity`), fallen ganz heraus — ein eigener Wert wäre dort ein Fehler.
 */
export function zeileTeilen(zeile, warten, generiert = []) {
  const jetzt = {}
  const nach = {}
  for (const [k, v] of Object.entries(zeile)) {
    if (generiert.includes(k)) continue
    if (warten.includes(k) && v !== null && v !== undefined) {
      nach[k] = v
      jetzt[k] = null
    } else jetzt[k] = v
  }
  return { jetzt, nach }
}

/** Der PostgREST-Filter auf genau eine Zeile — über ihren Primärschlüssel. */
export function pkFilter(zeile, pk) {
  const teile = pk.map((c) => `${c}.eq.${encodeURIComponent(String(zeile[c]))}`)
  return teile.length === 1 ? teile[0].replace('.eq.', '=eq.') : `and=(${teile.join(',')})`
}

/* ===================== Ausführung ======================================== */

/** Konten anlegen — mit ihrer alten Kennung, ohne Kennwort, Adresse bestätigt. */
export async function kontenAnlegen(url, key, liste, holen = fetch) {
  const kopf = funktionsKopf(key) // die Konten-Schnittstelle liest aus `Authorization`
  let angelegt = 0
  const schon = []
  for (const k of liste) {
    const res = await holen(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: kopf,
      body: JSON.stringify({ id: k.id, email: k.email, email_confirm: true }),
    })
    if (res.ok) {
      angelegt++
      continue
    }
    const text = await res.text()
    if (res.status === 422 || /already/i.test(text)) schon.push(k.id)
    else throw new Error(`admin/users ${res.status}: ${text}`)
  }
  return { angelegt, schon }
}

export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const datei = argv.find((a) => !a.startsWith('--') && a.endsWith('.json'))
  if (!datei || !fs.existsSync(datei)) {
    console.error('Aufruf: node scripts/zurueckspielen.mjs <sicherung.json> (--ziel-url <url> | --hierher) [--trocken]')
    process.exit(2)
  }
  const sicherung = JSON.parse(fs.readFileSync(datei, 'utf8'))

  /*
   * **Das Ziel muss gesagt werden.** Ein Lauf ohne Ziel nähme das Projekt aus
   * `.env.local` — und das ist der Betrieb. Dieses Skript schreibt einen
   * ganzen Bestand; dort hinein gehört es nur, wenn jemand es so meint.
   */
  let url
  let key
  if (arg['ziel-url']) {
    url = String(arg['ziel-url']).replace(/\/$/, '')
    key = arg['ziel-key'] ? String(arg['ziel-key']) : secretKey()
    if (!key) {
      console.error('Kein Schlüssel fürs Ziel: --ziel-key setzen oder SUPABASE_SECRET_KEY in der Umgebung.')
      process.exit(2)
    }
  } else if (arg.hierher) {
    ;({ url, key } = await zugangsdaten())
  } else {
    console.error('Kein Ziel: --ziel-url <url> (mit --ziel-key) oder --hierher für das Projekt aus .env.local.')
    process.exit(2)
  }

  const schema = fs.readFileSync(path.join(REPO, 'supabase', 'schema.sql'), 'utf8')
  const sha = crypto.createHash('sha256').update(schema).digest('hex')
  if (sicherung.schema_sha256 && sicherung.schema_sha256 !== sha) {
    console.log('! Die Sicherung stammt von einem anderen Stand von schema.sql als dem hier.')
    console.log(`  Sicherung: ${String(sicherung.schema_sha256).slice(0, 12)}…   jetzt: ${sha.slice(0, 12)}…`)
    console.log('  Die leere Datenbank muss mit demselben Schema aufgebaut sein, sonst fehlen Spalten.\n')
  }

  const tabellen = tabellenAusSchema(schema).filter((t) => t.name in (sicherung.tabellen ?? {}))
  const warten = aufgeschobene(tabellen, fremdschluessel(schema))
  const rest = restKlient(url, key)

  /*
   * **Leer heißt leer.** Geprüft wird jede Tabelle, nicht nur
   * `congregations`: Ein halb zurückgespielter Lauf hinterlässt Zeilen in den
   * ersten Tabellen, und ein zweiter Versuch obendrauf gäbe doppelte.
   */
  const belegt = []
  for (const t of tabellen) {
    const da = await rest(`${t.name}?select=${t.pk[0]}&limit=1`)
    if (Array.isArray(da) && da.length) belegt.push(t.name)
  }
  if (belegt.length) {
    console.error(`Die Zieldatenbank ist nicht leer — Zeilen in: ${belegt.join(', ')}.`)
    console.error('Zurückgespielt wird nur in eine frisch aufgebaute Datenbank (schema.sql, sonst nichts).')
    process.exit(1)
  }

  console.log(`Sicherung:  ${datei}`)
  console.log(`erstellt:   ${sicherung.erstellt} (Projekt ${sicherung.projekt})`)
  console.log(`Ziel:       ${url}`)
  console.log(`Konten:     ${(sicherung.konten ?? []).length}`)
  for (const t of tabellen) {
    const n = sicherung.tabellen[t.name].length
    const w = warten[t.name]?.length ? `  (${warten[t.name].join(', ')} wird nachgetragen)` : ''
    console.log(`${t.name.padEnd(24)} ${String(n).padStart(6)}${w}`)
  }

  if (arg.trocken) {
    console.log('\n--trocken: nichts geschrieben.')
    return
  }

  const { angelegt, schon } = await kontenAnlegen(url, key, sicherung.konten ?? [])
  console.log(`\nKonten: ${angelegt} angelegt${schon.length ? `, ${schon.length} waren schon da` : ''}.`)

  const nachtraege = []
  for (const t of tabellen) {
    const zeilen = sicherung.tabellen[t.name]
    if (!zeilen.length) continue
    const geteilt = zeilen.map((z) => zeileTeilen(z, warten[t.name] ?? [], t.generiert))
    await rest(t.name, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(geteilt.map((g) => g.jetzt)),
    })
    for (const [i, g] of geteilt.entries()) {
      if (Object.keys(g.nach).length) nachtraege.push({ tabelle: t.name, filter: pkFilter(zeilen[i], t.pk), werte: g.nach })
    }
    console.log(`${t.name.padEnd(24)} ${String(zeilen.length).padStart(6)} geschrieben`)
  }

  for (const n of nachtraege) {
    await rest(`${n.tabelle}?${n.filter}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(n.werte),
    })
  }
  if (nachtraege.length) console.log(`${nachtraege.length} nachgetragene Verweise (siehe „Der Ring im Schema").`)

  // Gezählt wird am Ende, nicht geglaubt: Was PostgREST angenommen hat, muss
  // auch dastehen. `alleZeilen` holt über die 1000-Zeilen-Grenze hinweg.
  console.log('\nGegenzählung (Sicherung → Ziel):')
  let abweichungen = 0
  for (const t of tabellen) {
    const soll = sicherung.tabellen[t.name].length
    const ist = (await alleZeilen(rest, `${t.name}?select=${t.pk[0]}&order=${t.pk.join(',')}`)).length
    if (soll !== ist) abweichungen++
    console.log(`${t.name.padEnd(24)} ${String(soll).padStart(6)} → ${String(ist).padStart(6)}${soll === ist ? '' : '   ABWEICHUNG'}`)
  }
  console.log(abweichungen ? `\n${abweichungen} Tabelle(n) weichen ab.` : '\nAlle Tabellen gleich.')
  if (abweichungen) process.exitCode = 1
}

alsSkript(import.meta.url, main)
