#!/usr/bin/env node
/**
 * **Sicherung der Datenbank** — jede Tabelle aus `supabase/schema.sql`, alle
 * Versammlungen, dazu die Konten. Eine JSON-Datei **außerhalb** des Repos.
 *
 * Supabase hält für dieses Projekt keine abrufbare Sicherung bereit (gemessen
 * am 7. November 2026: `supabase backups list` gibt `"backups": []` und
 * `"pitr_enabled": false`). Gesichert wurde bis dahin nur von Hand vor einem
 * Neuaufbau, mit einem Skript außerhalb des Repos und nur für **eine**
 * Versammlung. Das hier ist der Ersatz (T168).
 *
 * ------------------------------------------------------------- Der Weg ------
 *
 * **Warum JSON über die REST-Schnittstelle und nicht `supabase db dump`?** Der
 * Abzug mit `pg_dump` wäre der vollständigere Weg — er bräuchte aber Docker
 * oder die PostgreSQL-Clienttools auf dem Rechner, der die Sicherung fährt
 * (`supabase db dump` bricht ohne Docker mit `DockerRunError` ab, gemessen am
 * 7. November 2026). Dieses Skript läuft mit dem, was ohnehin dasteht: Node und
 * der Secret-Schlüssel aus `.env.local`.
 *
 * Vollständig ist es trotzdem, weil das Fehlende woanders steht:
 *
 *  - **Das Schema** liegt im Repo (`supabase/schema.sql`), die Zeitpläne
 *    daneben (`cron-reminders.sql`, `cron-aufraeumen.sql`). Wer zurückspielt,
 *    baut damit die leere Datenbank auf — `zurueckspielen.mjs` füllt sie.
 *  - **Die Konten** kommen über die Admin-Schnittstelle von Supabase Auth
 *    (`/auth/v1/admin/users`) mit hinein. Sie haben kein Kennwort, und ihre
 *    Kennung lässt sich beim Anlegen wieder setzen (`admin/users` nimmt `id` —
 *    genau so legt die App ein Konto an, siehe `_shared/konto-admin.ts`).
 *    Damit passt nach dem Zurückspielen jeder Anmelde-Link wieder.
 *  - **Nicht dabei sind die offenen Sitzungen** (`auth.sessions`). Wer gerade
 *    angemeldet ist, meldet sich nach einem Zurückspielen mit seinem Link neu
 *    an — die gelten ein Jahr.
 *
 * ------------------------------------------------------------ Der Inhalt ----
 *
 * Die Tabellen stehen hier **nicht aufgezählt**, sondern werden aus
 * `schema.sql` abgeleitet — samt ihrem Primärschlüssel, der die Ordnung für
 * das seitenweise Lesen gibt. Eine neue Tabelle ist damit von selbst dabei;
 * `sicherung.test.ts` hält das nach und macht die Probe rot, wenn eine fehlt.
 *
 * ------------------------------------------------------------- Die Datei ----
 *
 * In der Sicherung stehen **alle personenbezogenen Daten der Versammlungen**
 * und die Prüfsummen der Anmelde-Links. Sie gehört deshalb
 *
 *  - **nicht ins Repo** (es ist öffentlich) — das Skript weigert sich, in den
 *    Projektordner zu schreiben,
 *  - **nicht als Artefakt in die CI** (die Artefakte eines öffentlichen Repos
 *    kann jeder laden),
 *  - und nicht länger aufbewahrt, als die App ihre Daten selbst hält: Die
 *    Aufbewahrung (T125) räumt alles außer den Wochen nach acht Wochen ab.
 *    Deshalb bleiben hier acht Stände — bei einem Lauf die Woche sind das
 *    genau acht Wochen.
 *
 * ---------------------------------------------------------------- Aufruf ----
 *
 *   node scripts/sicherung.mjs [--ziel <ordner>] [--staende <n>] [--trocken]
 *
 * Ohne `--ziel`: `SICHERUNG_ZIEL` aus der Umgebung, sonst `ZIEL_VORGABE`
 * unten. Die Projekt-URL holt sich das Skript aus `.env.local`, den Schlüssel
 * aus der Umgebung oder `.env.local` (`SUPABASE_SECRET_KEY`) — für die
 * geplante Aufgabe muss er dort stehen, sonst gäbe es niemanden zu fragen.
 *
 * `--trocken` liest und zählt, schreibt aber keine Datei und löscht keine.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { alleZeilen, alsSkript, argumente, funktionsKopf, refAusUrl, restKlient, zugangsdaten } from './gemeinsam.mjs'

/** Der Projektordner — Grenze für `zielGeprueft`. */
export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Wohin, wenn weder `--ziel` noch `SICHERUNG_ZIEL` etwas sagt (Betreiber, 7.11.2026). */
export const ZIEL_VORGABE = 'C:/DATA/Claude/jw-sicherungen'

/** Wie viele Stände liegen bleiben — acht Wochenläufe, siehe Kopf. */
export const STAENDE_VORGABE = 8

/**
 * Tabellen aus `schema.sql`, die **nicht** in die Sicherung gehören — je mit
 * Grund. `sicherung.test.ts` verlangt für jede andere Tabelle eine Zeile in
 * der Sicherung und für jede hier einen Grund.
 */
export const AUSGENOMMEN = {
  anmelde_fehlversuche:
    'die Bremse gegen das Raten von Codes: IP-Adressen, die die Function selbst nach einer Stunde ' +
    'abräumt. In einer Sicherung lägen sie acht Wochen — länger, als die App sie hält.',
}

/**
 * **Welche Tabelle aus `schema.sql` fehlt in dieser Sicherung?** Leer heißt:
 * vollständig.
 *
 * Die Regel, gegen die `sicherung.test.ts` prüft — und der Grund, warum die
 * Tabellen oben abgeleitet und nicht aufgezählt werden. Eine neue Tabelle, die
 * niemand hier einträgt, fehlt sonst still in jeder Sicherung, und auffallen
 * würde es frühestens beim Zurückspielen.
 */
export function fehlendeTabellen(schema, sicherung) {
  const da = new Set(Object.keys(sicherung?.tabellen ?? {}))
  return tabellenAusSchema(schema)
    .map((t) => t.name)
    .filter((n) => !da.has(n) && !(n in AUSGENOMMEN))
}

/**
 * Name einer Sicherung: nach Zeit sortierbar, ohne Zeichen, die Windows nicht
 * mag. **Mit Sekunden** — zwei Läufe kurz hintereinander (die Probe, ein
 * Handgriff vor einem Umbau) überschrieben sich sonst gegenseitig, und der
 * zweite nähme dem ersten still seinen Stand.
 */
export function dateiName(jetzt = new Date()) {
  const z = (n) => String(n).padStart(2, '0')
  const tag = `${jetzt.getFullYear()}-${z(jetzt.getMonth() + 1)}-${z(jetzt.getDate())}`
  return `sicherung-${tag}_${z(jetzt.getHours())}${z(jetzt.getMinutes())}${z(jetzt.getSeconds())}.json`
}

/** Erkennt die eigenen Dateien wieder — und nur die. */
export const DATEI_MUSTER = /^sicherung-\d{4}-\d{2}-\d{2}_\d{6}\.json$/

/**
 * Welche Stände weg dürfen: die ältesten, bis nur noch `behalten` dastehen.
 *
 * Sortiert wird über den Namen — er trägt die Zeit in genau der Reihenfolge,
 * in der sie läuft. Nicht über `mtime`: Ein Kopiervorgang stellt die neu, und
 * dann löschte der nächste Lauf den falschen Stand.
 */
export function zuLoeschen(dateien, behalten = STAENDE_VORGABE) {
  const eigene = dateien.filter((d) => DATEI_MUSTER.test(d)).sort()
  return behalten > 0 ? eigene.slice(0, Math.max(0, eigene.length - behalten)) : []
}

/**
 * **Nicht ins Repo schreiben.** Das Repo ist öffentlich; eine Sicherung
 * darin wäre ein Commit davon entfernt, alle Namen und Adressen der
 * Versammlung zu veröffentlichen. Wirft, statt es zu tun.
 */
export function zielGeprueft(ziel, repo = REPO) {
  const abs = path.resolve(ziel)
  const rel = path.relative(repo, abs)
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error(
      `Das Ziel liegt im Projektordner (${abs}).\n` +
        'Das Repo ist öffentlich — eine Sicherung darin veröffentlichte alle Personendaten.\n' +
        `Einen Ordner daneben wählen, etwa --ziel ${ZIEL_VORGABE}`,
    )
  }
  return abs
}

/**
 * **Kommentare raus, bevor irgendetwas gelesen wird.**
 *
 * `schema.sql` ist zu zwei Dritteln Prosa, und die Prosa ist deutsch: Kommas,
 * Klammern und Wörter wie „references" kommen darin vor. Ein Muster, das über
 * sie hinwegliest, findet Fremdschlüssel, die es nicht gibt — gemessen am
 * 7. November 2026: `absences.und`, geboren aus „…sonst mit, und die Planung…"
 * zwei Zeilen über `user_id uuid references auth.users`. Und eine einzelne
 * Klammer in einem Kommentar brächte die Klammerzählung in `rumpfAb`
 * durcheinander.
 *
 * Zeilenumbrüche bleiben stehen, damit die Zeilenweise-Auswertung darüber
 * nicht verrutscht.
 */
export function ohneKommentare(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' ')).replace(/--[^\n]*/g, '')
}

/**
 * Tabellen aus `schema.sql` mit ihrem Primärschlüssel und den Spalten, die
 * die Datenbank selbst vergibt.
 *
 * Der Primärschlüssel ist die Ordnung fürs seitenweise Lesen: Ohne feste
 * Ordnung überschneiden sich die Seiten oder lassen Zeilen aus (siehe
 * `alleZeilen`). Er steht in `schema.sql` entweder an der Spalte
 * (`id uuid primary key`) oder als eigene Zeile (`primary key (a, b)`) —
 * beides wird hier gelesen, damit keine Liste von Hand mitwachsen muss.
 *
 * `nichtNull` braucht `zurueckspielen.mjs`: Nur eine Spalte, die `null` sein
 * darf, lässt sich aufschieben, wenn ihr Fremdschlüssel auf eine Tabelle
 * zeigt, die erst später kommt.
 *
 * @returns {{ name: string, pk: string[], generiert: string[], nichtNull: Set<string> }[]} in der Reihenfolge von schema.sql
 */
export function tabellenAusSchema(roh) {
  const sql = ohneKommentare(roh)
  const out = []
  const kopf = /create table if not exists (?:public\.)?([a-z_]+) \(/gi
  for (let m = kopf.exec(sql); m; m = kopf.exec(sql)) {
    const rumpf = rumpfAb(sql, kopf.lastIndex - 1)
    const pk = []
    const generiert = []
    const nichtNull = new Set()
    for (const zeile of rumpf.split('\n')) {
      const z = zeile.trim()
      const sammel = /^primary key \(([^)]+)\)/i.exec(z)
      if (sammel) {
        pk.push(...sammel[1].split(',').map((c) => c.trim()))
        continue
      }
      const spalte = /^([a-z_]+)\s+(.+)$/i.exec(z)
      if (!spalte || /^(constraint|primary|unique|check|foreign)\b/i.test(z)) continue
      if (/\bprimary key\b/i.test(spalte[2])) pk.push(spalte[1])
      if (/\bgenerated always as\b/i.test(spalte[2])) generiert.push(spalte[1])
      // Der Primärschlüssel ist immer `not null`, auch ohne das Wort dort.
      if (/\bnot null\b/i.test(spalte[2]) || /\bprimary key\b/i.test(spalte[2])) nichtNull.add(spalte[1])
    }
    for (const c of pk) nichtNull.add(c)
    out.push({ name: m[1], pk, generiert, nichtNull })
  }
  return out
}

/**
 * **Der Fingerabdruck des Schemas, zu dem eine Sicherung passt** — über den
 * Text **ohne Kommentare**.
 *
 * `zurueckspielen.mjs` warnt, wenn eine Sicherung von einem anderen Stand
 * stammt als die Datei daneben: „sonst fehlen Spalten". Genau das kann ein
 * Kommentar nicht bewirken — `schema.sql` ist aber zu zwei Dritteln Prosa, und
 * über den ganzen Text gerechnet hätte jede umformulierte Begründung alle
 * älteren Sicherungen als „anderer Stand" gemeldet. Eine Warnung, die bei
 * Textpflege anspringt, liest nach dem dritten Mal niemand mehr.
 */
export function schemaFingerabdruck(schema) {
  return crypto.createHash('sha256').update(ohneKommentare(schema)).digest('hex')
}

/**
 * Der Rumpf einer `create table (…)` ab der öffnenden Klammer — über
 * Klammerebenen hinweg, damit ein `check (…)` in einer Spalte nicht vorzeitig
 * schließt. Erwartet Text ohne Kommentare (`ohneKommentare`).
 */
export function rumpfAb(sql, start) {
  let tiefe = 0
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === '(') tiefe++
    else if (sql[i] === ')' && --tiefe === 0) return sql.slice(start + 1, i)
  }
  return sql.slice(start + 1)
}

/**
 * Alle Konten über die Admin-Schnittstelle — seitenweise, bis eine Seite
 * kürzer ist (wie `alleZeilen` für PostgREST).
 *
 * Gesichert wird nur, was zum Wiederanlegen taugt: Kennung, Adresse und wann
 * das Konto entstanden ist. Die Adresse ist bei Konten aus dem Anmelden per
 * Link erfunden (`<person-id>@konten.invalid`, siehe `_shared/anmeldung.ts`),
 * bei älteren kann eine echte dabei sein.
 */
export async function konten(url, key, holen = fetch, proSeite = 200) {
  // `funktionsKopf`, nicht `authKopf`: Die Konten-Schnittstelle liest den
  // Schlüssel aus `Authorization`, PostgREST wies ihn dort ab (siehe dort).
  const kopf = funktionsKopf(key)
  const out = []
  for (let seite = 1; ; seite++) {
    const res = await holen(`${url}/auth/v1/admin/users?page=${seite}&per_page=${proSeite}`, { headers: kopf })
    if (!res.ok) throw new Error(`admin/users ${res.status}: ${await res.text()}`)
    const { users = [] } = await res.json()
    out.push(...users.map((u) => ({ id: u.id, email: u.email ?? '', created_at: u.created_at })))
    if (users.length < proSeite) return out
  }
}

export async function main(argv = process.argv.slice(2)) {
  const arg = argumente(argv)
  const ziel = zielGeprueft(arg.ziel || process.env.SICHERUNG_ZIEL || ZIEL_VORGABE)
  const behalten = arg.staende === undefined ? STAENDE_VORGABE : Number(arg.staende)
  if (!Number.isInteger(behalten) || behalten < 1) {
    console.error(`--staende braucht eine ganze Zahl ab 1, nicht „${arg.staende}".`)
    process.exit(2)
  }

  const schema = fs.readFileSync(path.join(REPO, 'supabase', 'schema.sql'), 'utf8')
  const tabellen = tabellenAusSchema(schema).filter((t) => !(t.name in AUSGENOMMEN))
  const { url, key } = await zugangsdaten()
  const rest = restKlient(url, key)

  const daten = {}
  for (const t of tabellen) {
    daten[t.name] = await alleZeilen(rest, `${t.name}?select=*&order=${t.pk.join(',')}`)
  }
  const alleKonten = await konten(url, key)

  const inhalt = {
    erstellt: new Date().toISOString(),
    projekt: refAusUrl(url),
    // Die Sicherung passt zu **diesem** Schema. Wer zurückspielt, baut die
    // leere Datenbank aus derselben Datei auf — die Prüfsumme sagt, ob es
    // dieselbe ist (ohne Kommentare, siehe `schemaFingerabdruck`).
    schema_sha256: schemaFingerabdruck(schema),
    ausgenommen: AUSGENOMMEN,
    konten: alleKonten,
    tabellen: daten,
  }

  let summe = 0
  for (const t of tabellen) {
    console.log(`${t.name.padEnd(24)} ${String(daten[t.name].length).padStart(6)}`)
    summe += daten[t.name].length
  }
  console.log(`${'(Konten)'.padEnd(24)} ${String(alleKonten.length).padStart(6)}`)
  console.log(`${''.padEnd(24)} ${String(summe + alleKonten.length).padStart(6)} Zeilen in ${tabellen.length} Tabellen`)
  for (const [t, grund] of Object.entries(AUSGENOMMEN)) console.log(`ausgenommen: ${t} — ${grund}`)

  if (arg.trocken) {
    console.log(`\n--trocken: nichts geschrieben (Ziel wäre ${path.join(ziel, dateiName())}).`)
    return
  }

  fs.mkdirSync(ziel, { recursive: true })
  const datei = path.join(ziel, dateiName())
  fs.writeFileSync(datei, JSON.stringify(inhalt), 'utf8')
  console.log(`\nGeschrieben: ${datei} (${(fs.statSync(datei).size / 1024).toFixed(0)} KB)`)

  const weg = zuLoeschen(fs.readdirSync(ziel), behalten)
  for (const d of weg) fs.unlinkSync(path.join(ziel, d))
  const geblieben = fs.readdirSync(ziel).filter((d) => DATEI_MUSTER.test(d)).length
  console.log(`${geblieben} Stand/Stände im Ordner${weg.length ? `, ${weg.length} ältere gelöscht` : ''}.`)
}

alsSkript(import.meta.url, main)
