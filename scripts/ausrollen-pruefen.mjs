#!/usr/bin/env node
/**
 * **Steht die Produktion auf dem Stand des Commits?** — die Prüfungen nach dem
 * Ausrollen (T170). Lesend und ohne Nebenwirkung; sie laufen in
 * `ausrollen.yml` nach `db push` und `functions deploy`, gehen aber ebenso von
 * Hand:
 *
 *   node scripts/ausrollen-pruefen.mjs [--functions-seit <ms|ISO>]
 *
 *  1. **Verlauf:** Jede Migration aus `supabase/migrations/` ist eingespielt,
 *     und im Projekt steht keine, die das Repo nicht kennt.
 *  2. **Katalog:** Die Produktion gleicht der Folge der Migrationen in PGlite,
 *     über dieselben Abschnitte wie `supabase/migrationen.test.ts`
 *     (`katalog.mjs`). Das fängt, was am Verlauf vorbei hineinkam — so stand
 *     bis zum 7.11.2026 `persons.dn` nur in der Produktion.
 *  3. **Functions:** Jede aus `config.toml` ist aktiv, `verify_jwt` wie dort;
 *     mit `--functions-seit` ist jede jünger als der Beginn des Ausrollens.
 *  4. **Rauchtest:** `OPTIONS` beantwortet der Handler — das Modul kommt hoch —,
 *     und einen POST mit dem öffentlichen Schlüssel weist er ab. Das löst
 *     nichts aus: keine Anmeldung, keinen Versand, keinen Abruf.
 *
 * Projekt-URL und öffentlicher Schlüssel kommen aus der Umgebung
 * (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — in der CI die Secrets des
 * Frontends), sonst aus `.env.local`. Die CLI nimmt den Zugangstoken aus
 * `SUPABASE_ACCESS_TOKEN` oder vom `supabase login`; welche CLI, sagt
 * `SUPABASE_CLI` — sonst dieselbe feste Version wie in `ausrollen.yml`.
 */

import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { functionsDesRepos } from './ausrollen-plan.mjs'
import { alsSkript, argumente, refAusUrl, wertAusEnvDatei } from './gemeinsam.mjs'
import { katalog, katalogAbfrage, katalogVergleich } from './katalog.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONEN = path.join(REPO, 'supabase', 'migrations')

/** Die Migrationen des Repos, in der Ordnung der CLI: Version → Dateiname. */
function migrationenImRepo() {
  return fs
    .readdirSync(MIGRATIONEN)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/**
 * Der erste vollständige JSON-Wert in einem Text — was davor oder danach
 * steht, bleibt draußen.
 */
export function ersterJsonWert(text) {
  const start = text.search(/[[{]/)
  if (start < 0) throw new Error(`keine JSON-Ausgabe: ${text.slice(0, 200)}`)
  let tiefe = 0
  let inText = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inText) {
      if (c === '\\') i++
      else if (c === '"') inText = false
    } else if (c === '"') inText = true
    else if (c === '{' || c === '[') tiefe++
    else if ((c === '}' || c === ']') && --tiefe === 0) return JSON.parse(text.slice(start, i + 1))
  }
  throw new Error('JSON-Ausgabe bricht ab')
}

/**
 * Welche CLI: `SUPABASE_CLI` aus der Umgebung (in der CI gesetzt), sonst
 * dieselbe feste Version, die `ausrollen.yml` nennt — lokal liefe `npx
 * supabase` sonst mit der neuesten, die npm gerade hat.
 */
export function cliPaket(env = process.env) {
  if (env.SUPABASE_CLI) return env.SUPABASE_CLI
  const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'ausrollen.yml'), 'utf8')
  const fest = /^\s*SUPABASE_CLI:\s*(\S+)\s*$/m.exec(yml)?.[1]
  if (!fest) throw new Error('ausrollen.yml nennt kein SUPABASE_CLI.')
  return fest
}

/**
 * Die Supabase-CLI rufen und ihre JSON-Ausgabe lesen.
 *
 * **Immer mit `--agent no`:** Erkennt die CLI einen Agenten (etwa Claude Code),
 * gibt sie eine andere Form aus — `db query` ein Objekt mit `rows` und einer
 * Warnung statt eines bloßen Arrays. In der CI erkennt sie keinen; mit dem
 * Schalter ist die Form überall dieselbe (gemessen am 7.11.2026, nachdem die
 * Prüfung in der CI am Array scheiterte, das sie lokal nie gesehen hatte).
 *
 * Unter Windows ist `npx` eine `.cmd`-Datei, die Node nur über die Shell
 * startet — dort als eine Zeile mit gequoteten Teilen, denn Argumente neben
 * `shell: true` setzt Node bloß zusammen (DEP0190).
 */
function cli(args) {
  const teile = ['npx', '--yes', cliPaket(), ...args, '--output-format', 'json', '--agent', 'no']
  const optionen = { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
  const aus =
    process.platform === 'win32'
      ? execSync(teile.map((t) => (/[\s"&|<>^]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)).join(' '), optionen)
      : execFileSync(teile[0], teile.slice(1), optionen)
  return ersterJsonWert(aus)
}

/* ===================== 1. Verlauf ======================================== */

/**
 * Was am Verlauf nicht stimmt — leer heißt: jede Migration des Repos ist
 * eingespielt, und keine fremde steht im Projekt.
 *
 * @param {{ local?: string, remote?: string }[]} liste  `migration list`
 * @param {string[]} versionen  die Zeitstempel der Dateien im Repo
 */
export function verlaufBefunde(liste, versionen) {
  const befunde = []
  for (const v of versionen) {
    const eintrag = liste.find((e) => e.local === v)
    if (!eintrag || eintrag.remote !== v) befunde.push(`${v} ist nicht eingespielt`)
  }
  for (const e of liste) if (e.remote && !versionen.includes(e.remote)) befunde.push(`${e.remote} steht im Projekt, aber nicht im Repo`)
  return befunde
}

/* ===================== 2. Katalog ======================================== */

/** Die Befunde des Katalog-Vergleichs als Zeilen — „links" ist die Produktion. */
export function katalogBefunde(unterschiede) {
  const zeilen = []
  for (const u of unterschiede) {
    if (u.nurLinks.length) zeilen.push(`${u.abschnitt}: nur in der Produktion: ${u.nurLinks.join(', ')}`)
    if (u.nurRechts.length) zeilen.push(`${u.abschnitt}: nur in den Migrationen: ${u.nurRechts.join(', ')}`)
    for (const a of u.anders) {
      zeilen.push(`${u.abschnitt}: ${a.name}.${a.feld}: Produktion ${JSON.stringify(a.links)} ≠ Migrationen ${JSON.stringify(a.rechts)}`)
    }
  }
  return zeilen
}

async function katalogDerProduktion(ref) {
  const datei = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'katalog-')), 'abfrage.sql')
  fs.writeFileSync(datei, katalogAbfrage())
  try {
    // Ein Array mit einer Zeile (`--agent no`), die Spalte `katalog` als Text.
    const zeilen = cli(['db', 'query', `--remote=${ref}`, '--read-only', '-f', datei])
    return JSON.parse(zeilen[0].katalog)
  } finally {
    fs.rmSync(path.dirname(datei), { recursive: true, force: true })
  }
}

async function katalogDerMigrationen() {
  // PGlite erst hier: Wer nur den Rauchtest fährt, braucht es nicht.
  const { leerePostgres } = await import('./pglite-postgres.mjs')
  const db = await leerePostgres(migrationenImRepo().map((f) => fs.readFileSync(path.join(MIGRATIONEN, f), 'utf8')))
  try {
    return await katalog(db)
  } finally {
    await db.close()
  }
}

/* ===================== 3. Functions ====================================== */

/**
 * Was am Stand der Functions nicht stimmt.
 *
 * @param {{ slug: string, status: string, verify_jwt: boolean, updated_at: number|string }[]} liste  `functions list`
 * @param {{ name: string, verifyJwt: boolean }[]} soll  aus `config.toml`
 * @param {number|null} seit  Beginn des Ausrollens (ms) — oder `null`, wenn keine Function ausgerollt wurde
 */
export function functionsBefunde(liste, soll, seit = null) {
  const befunde = []
  for (const s of soll) {
    const f = liste.find((x) => x.slug === s.name)
    if (!f) {
      befunde.push(`${s.name} fehlt im Projekt`)
      continue
    }
    if (f.status !== 'ACTIVE') befunde.push(`${s.name}: Status ${f.status}`)
    if (f.verify_jwt !== s.verifyJwt) befunde.push(`${s.name}: verify_jwt ${f.verify_jwt}, config.toml sagt ${s.verifyJwt}`)
    if (seit !== null && new Date(f.updated_at).getTime() < seit) {
      befunde.push(`${s.name}: Stand vom ${new Date(f.updated_at).toISOString()} — älter als dieses Ausrollen`)
    }
  }
  for (const f of liste) if (!soll.some((s) => s.name === f.slug)) befunde.push(`${f.slug} läuft im Projekt, steht aber nicht in config.toml`)
  return befunde
}

/* ===================== 4. Rauchtest ====================================== */

/**
 * Functions, die **ohne Sitzung** arbeiten müssen: Wer sich anmeldet, hat noch
 * keine. Sie beantworten die unbekannte Aktion des Rauchtests mit 400, wo die
 * übrigen schon an der fehlenden Anmeldung mit 401 abbrechen.
 */
export const OHNE_SITZUNG = new Set(['anmelden'])

/** Der Rumpf des Rauchtests: eine Aktion, die keine Function kennt. */
export const RAUCHTEST_RUMPF = { action: 'rauchtest', aktion: 'rauchtest' }

/**
 * Was eine Function auf die beiden Anfragen antworten muss (gemessen am
 * 7.11.2026, alle acht).
 *
 *  - `verify_jwt = false` (`send-reminders`): Sie prüft ihr Geheimnis vor
 *    allem anderen, auch vor `OPTIONS` — beides `401 Unauthorized`.
 *  - sonst `OPTIONS` → 200 vom **Handler**: Nur dessen CORS nennt
 *    `content-type`; die Antworten der Plattform nennen es nicht. Der POST mit
 *    dem öffentlichen Schlüssel kommt am Tor vorbei und trifft auf die
 *    Prüfung der Function: `401 unauthorized`, ohne Sitzung `400 bad-request`.
 */
export function rauchtestErwartung({ name, verifyJwt }) {
  if (!verifyJwt) return { options: { status: 401, text: 'Unauthorized' }, post: { status: 401, text: 'Unauthorized' } }
  return {
    options: { status: 200, cors: true },
    post: OHNE_SITZUNG.has(name) ? { status: 400, text: '{"error":"bad-request"}' } : { status: 401, text: '{"error":"unauthorized"}' },
  }
}

/**
 * Was an den Antworten nicht der Erwartung entspricht.
 *
 * @param {{ name: string, verifyJwt: boolean }} f
 * @param {{ options: { status: number, text: string, cors: string|null }, post: { status: number, text: string } }} antwort
 */
export function rauchtestBefunde(f, antwort) {
  const soll = rauchtestErwartung(f)
  const befunde = []
  const kurz = (t) => JSON.stringify(String(t).slice(0, 80))
  if (antwort.options.status !== soll.options.status) befunde.push(`${f.name}: OPTIONS ${antwort.options.status} statt ${soll.options.status} ${kurz(antwort.options.text)}`)
  else if (soll.options.cors && !/content-type/i.test(antwort.options.cors ?? '')) {
    befunde.push(`${f.name}: OPTIONS ohne die CORS-Kopfzeile des Handlers — das Modul kam nicht hoch`)
  } else if (soll.options.text && antwort.options.text.trim() !== soll.options.text) befunde.push(`${f.name}: OPTIONS ${kurz(antwort.options.text)}`)
  if (antwort.post.status !== soll.post.status || antwort.post.text.trim() !== soll.post.text) {
    befunde.push(`${f.name}: POST ${antwort.post.status} ${kurz(antwort.post.text)} statt ${soll.post.status} ${soll.post.text}`)
  }
  return befunde
}

/** Beide Anfragen an jede Function — der Schlüssel geht nur in die Kopfzeilen, nie in eine Ausgabe. */
export async function rauchtest(url, key, functions, holen = fetch) {
  const befunde = []
  for (const f of functions) {
    const adresse = `${url.replace(/\/$/, '')}/functions/v1/${f.name}`
    const o = await holen(adresse, { method: 'OPTIONS', headers: { Origin: 'https://versammlung.app', 'Access-Control-Request-Method': 'POST' } })
    const p = await holen(adresse, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(RAUCHTEST_RUMPF),
    })
    const antwort = {
      options: { status: o.status, text: await o.text(), cors: o.headers.get('access-control-allow-headers') },
      post: { status: p.status, text: await p.text() },
    }
    befunde.push(...rauchtestBefunde(f, antwort))
  }
  return befunde
}

/* ===================== Ablauf ============================================ */

/**
 * `--functions-seit` als Millisekunden — oder `null` ohne Angabe. Was sich
 * nicht lesen lässt, bricht ab: Mit `NaN` verglichen wäre jede Function
 * „frisch", und die Prüfung meldete grün, ohne geprüft zu haben.
 */
export function zeitpunkt(roh) {
  if (roh === undefined) return null
  const text = String(roh)
  const ms = /^\d+$/.test(text) ? Number(text) : /^\d{4}-\d{2}-\d{2}/.test(text) ? Date.parse(text) : NaN
  if (Number.isNaN(ms)) {
    throw new Error(`--functions-seit erwartet Millisekunden oder ein ISO-Datum (2026-11-07T21:47:00Z), nicht ${JSON.stringify(roh)}.`)
  }
  return ms
}

export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const url = process.env.VITE_SUPABASE_URL || wertAusEnvDatei('VITE_SUPABASE_URL')
  const key = process.env.VITE_SUPABASE_ANON_KEY || wertAusEnvDatei('VITE_SUPABASE_ANON_KEY')
  if (!url || !key) throw new Error('VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY fehlen (Umgebung oder .env.local).')
  const ref = process.env.PROJEKT || refAusUrl(url)
  const seit = zeitpunkt(arg['functions-seit'])
  const soll = functionsDesRepos()
  const versionen = migrationenImRepo().map((f) => f.slice(0, 14))

  const pruefungen = [
    ['Verlauf', `alle ${versionen.length} Migrationen eingespielt`, async () => verlaufBefunde(cli(['migration', 'list', `--remote=${ref}`]).migrations ?? [], versionen)],
    [
      'Katalog',
      'die Produktion gleicht der Folge der Migrationen',
      async () => katalogBefunde(katalogVergleich(await katalogDerProduktion(ref), await katalogDerMigrationen())),
    ],
    [
      'Functions',
      `alle ${soll.length} aktiv, verify_jwt wie config.toml${seit === null ? '' : ', in diesem Lauf ausgerollt'}`,
      async () => functionsBefunde(cli(['functions', 'list', `--remote=${ref}`]).functions ?? [], soll, seit),
    ],
    ['Rauchtest', `alle ${soll.length} antworten, wie sie sollen`, () => rauchtest(url, key, soll)],
  ]

  // Jede Prüfung für sich: Scheitert eine schon am Fragen, sollen die übrigen
  // trotzdem sagen, was sie sehen.
  let rot = 0
  for (const [name, gut, pruefen] of pruefungen) {
    let befunde
    try {
      befunde = await pruefen()
    } catch (err) {
      befunde = [`nicht prüfbar: ${err instanceof Error ? err.message : err}`]
    }
    if (befunde.length === 0) {
      console.log(`✓ ${name}: ${gut}`)
      continue
    }
    rot++
    console.log(`✗ ${name}:`)
    for (const b of befunde) console.log(`    ${b}`)
  }
  if (rot) {
    console.log(`\n${rot} von ${pruefungen.length} Prüfungen rot — die Produktion steht nicht auf dem Stand des Commits.`)
    process.exitCode = 1
  } else console.log(`\nDie Produktion steht auf dem Stand des Commits.`)
}

alsSkript(import.meta.url, main)
