/**
 * **Schüler- und Partner-Beschriftung in bereits importierten Wochen nachtragen.**
 *
 * Seit „Der Schüler stand ohne Beschriftung neben seinem Gesprächspartner"
 * setzt der Import beide Rollen: der Zugeteilte eines Gesprächsteils trägt
 * `Schüler`, sein Gegenüber `Partner` (vorher `Gesprächspartner`). Der
 * **Bestand** kennt beides nicht — die Rolle entsteht beim Import, und den gibt
 * es je Woche nur einmal: `importNextWeek` holt immer die Woche **nach** der
 * letzten geladenen. Eine schon importierte Woche lässt sich über die App also
 * gar nicht auffrischen, nur löschen — und das nähme alle Zuteilungen mit.
 *
 * Deshalb dieses Skript: Es fasst ausschließlich die Beschriftung an. Namen,
 * Kennungen (`pid`), Bestätigungen und alles andere bleiben unberührt.
 *
 * Zwei Dinge werden je Gesprächsteil gesetzt:
 *   1. der Slot mit `bereichsKey: 'schulungPartner'` bekommt `rolle: 'Partner'`
 *      (der alte deutsche Schlüssel `Gesprächspartner` steht sonst in FRAG
 *      nicht mehr und fiele in jeder Fremdsprache auf Deutsch zurück),
 *   2. der Slot mit `bereichsKey: 'schulung'` **desselben Punktes** bekommt
 *      `rolle: 'Schüler'` — aber nur, wenn ihm ein Partner gegenübersteht.
 *      Eine Ansprache bleibt unbeschriftet, wie in `togglePartner`.
 *
 * Die Zusätzliche Klasse (`item.aux`) fährt mit; die Sprachvarianten
 * (`week.alt`) nicht — sie tragen keine Zuteilungen.
 *
 * Aufruf — ohne Vorbereitung, das Skript fragt nach dem Schlüssel:
 *
 *   node scripts/rollen-nachtragen.mjs --trocken
 *
 * Die Projekt-URL holt es sich aus `.env.local` (`VITE_SUPABASE_URL`).
 *
 * **Welcher Schlüssel:** der `sb_secret_…` aus dem Dashboard unter Project
 * Settings → API Keys → Secret keys. Die Legacy-JWT-Schlüssel (`anon`,
 * `service_role`) sind in diesem Projekt seit 14.8.2026 deaktiviert. Steht er
 * als `SUPABASE_SECRET_KEY` in der Umgebung (oder unter dem alten Namen
 * `SUPABASE_SERVICE_ROLE_KEY`, siehe `secretKey`), fragt das Skript nicht.
 *
 * Er darf **nicht** in `.env.local` landen: was dort als `VITE_*` liegt, geht
 * ins Bündel, und dieser Schlüssel umgeht jede Zeilen-Sicherheit. Dorthin
 * gehört der `sb_publishable_…`.
 *
 * `--trocken`   zeigt nur, was geschähe, und schreibt nichts.
 * `--cong <id>` beschränkt auf eine Versammlung (sonst: alle).
 */

import fs from 'node:fs'
import readline from 'node:readline'

import { argumente, authKopf, secretKey } from './gemeinsam.mjs'

// Damit der Test die Helfer über dieses Skript erreicht, wie es die anderen
// Wartungsskripte für ihre eigenen auch tun.
export { authKopf } from './gemeinsam.mjs'

export const SCHUELER = 'Schüler'
export const PARTNER = 'Partner'

/**
 * Beschriftung einer Slot-Reihe nachtragen. Gibt zurück, wie viele Slots sich
 * geändert haben — 0 heißt: hier war schon alles richtig.
 *
 * Arbeitet auf der Reihe **an Ort und Stelle**; der Aufrufer entscheidet, ob er
 * das Ergebnis schreibt.
 */
export function reiheNachtragen(slots) {
  if (!Array.isArray(slots)) return 0
  const partner = slots.filter((s) => s?.bereichsKey === 'schulungPartner')
  if (!partner.length) return 0
  let geaendert = 0
  for (const s of partner) {
    if (s.rolle === PARTNER) continue
    s.rolle = PARTNER
    geaendert++
  }
  // Der Schüler wird nur benannt, weil ihm jemand gegenübersteht.
  for (const s of slots) {
    if (s?.bereichsKey !== 'schulung') continue
    if (s.rolle === SCHUELER) continue
    s.rolle = SCHUELER
    geaendert++
  }
  return geaendert
}

/** Eine ganze Woche nachtragen (mid + we, Haupt- und Klassenplätze). */
export function wocheNachtragen(data) {
  let geaendert = 0
  for (const tab of ['mid', 'we']) {
    for (const sektion of data?.[tab]?.sections ?? []) {
      for (const item of sektion?.items ?? []) {
        geaendert += reiheNachtragen(item?.names)
        geaendert += reiheNachtragen(item?.aux)
      }
    }
  }
  return geaendert
}

/**
 * Projekt-URL aus `.env.local` (bzw. `.env`) lesen — dieselbe, mit der die App
 * arbeitet. Von Hand geteilt statt per Regex: `trim()` erledigt das CR unter
 * Windows gleich mit, und ein Wert darf selbst `=` enthalten.
 */
export function urlAusEnvText(inhalt) {
  for (const roh of String(inhalt).split('\n')) {
    const zeile = roh.trim()
    if (!zeile || zeile.startsWith('#')) continue
    const gleich = zeile.indexOf('=')
    if (gleich < 0) continue
    if (zeile.slice(0, gleich).trim() !== 'VITE_SUPABASE_URL') continue
    const wert = zeile.slice(gleich + 1).trim()
    return wert.replace(/^["']|["']$/g, '')
  }
  return ''
}

function urlAusEnvDatei() {
  for (const datei of ['.env.local', '.env']) {
    try {
      const url = urlAusEnvText(fs.readFileSync(datei, 'utf8'))
      if (url) return url
    } catch {
      continue // Datei gibt es nicht — die nächste versuchen.
    }
  }
  return ''
}

/**
 * Steht dort ein unersetzter Platzhalter statt eines Schlüssels?
 *
 * Ohne diese Prüfung lief das Skript los und starb an einem nackten
 * „401: Invalid API key" samt Stapelabzug — eine Meldung, die die Ursache nicht
 * nennt. Ein aus einer Anleitung kopierter Aufruf trägt den Platzhalter aber
 * fast immer noch, und genau das ist hier passiert.
 */
export function istPlatzhalter(key) {
  // Erst trimmen, dann auf leer prüfen: Ein Schlüssel aus Leerzeichen ist
  // genauso unbrauchbar wie keiner, kam aber als „gesetzt" durch (`'   '` ist
  // truthy). Der Test hat es aufgedeckt, nicht der Server.
  const k = String(key ?? '').trim()
  if (!k) return true
  if (k.startsWith('<') || k.startsWith('{')) return true
  if (/^(dein|your|hier|xxx)/i.test(k)) return true
  // **Ein Schlüssel ist ASCII.** Das fing „eyJ…" aus einer Anleitung nicht:
  // Es beginnt wie ein JWT, trägt aber ein echtes Auslassungszeichen
  // (U+2026). `fetch` scheiterte erst beim Header-Bauen mit „Cannot convert
  // argument to a ByteString" — eine Meldung, die niemand mit einem
  // vergessenen Platzhalter verbindet.
  if (/[^\x20-\x7e]/.test(k)) return true
  // Kein echter Schlüssel ist so kurz; ein abgeschnittenes Beispiel schon.
  return k.length < 20
}

/** Projekt-Kennung aus der URL — nur für den Hinweis aufs Dashboard. */
export function refAusUrl(url) {
  const ohneSchema = String(url).replace('https://', '').replace('http://', '')
  const wirt = ohneSchema.split('/')[0] ?? ''
  const ref = wirt.split('.')[0] ?? ''
  return ref || '<ref>'
}

/**
 * Schlüssel abfragen, wenn keiner in der Umgebung steht.
 *
 * **Das ist der eigentliche Fix.** Zwei Läufe scheiterten nicht am Server,
 * sondern an einem Platzhalter, der aus der Anleitung in die Kommandozeile
 * kopiert wurde — erst `<service-role-key>`, dann `eyJ…`. Solange der Aufruf
 * ein Muster zum Ersetzen enthält, wiederholt sich das. Fragt das Skript
 * selbst, gibt es nichts zu ersetzen.
 *
 * Nebenbei besser: Über die Eingabeaufforderung landet der Schlüssel **nicht**
 * in der PowerShell-History, anders als bei `$env:… = "…"`.
 *
 * Ohne Terminal (Pipe, CI) wird nicht gefragt — dort hinge der Lauf sonst.
 */
async function schluesselErfragen() {
  if (!process.stdin.isTTY) return ''
  // Aufforderung auf stderr: so bleibt stdout für das Ergebnis frei.
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  try {
    const eingabe = await new Promise((fertig) => rl.question('sb_secret_…: ', fertig))
    return eingabe.trim()
  } finally {
    rl.close()
  }
}

async function main() {
  const arg = argumente(process.argv.slice(2))
  // Die Projekt-URL steht schon im Projekt (`.env.local`, für die App als
  // `VITE_SUPABASE_URL`). Sie noch einmal von Hand zu setzen war eine Variable
  // zu viel — und je mehr ein Aufruf verlangt, desto größer die Chance, dass
  // ein kopierter Platzhalter unersetzt durchgeht.
  const url = process.env.SUPABASE_URL || urlAusEnvDatei()
  if (!url) {
    console.error('Keine Projekt-URL: weder SUPABASE_URL gesetzt noch VITE_SUPABASE_URL in .env.local.')
    process.exit(2)
  }

  const dashboard = `https://supabase.com/dashboard/project/${refAusUrl(url)}/settings/api-keys`
  let key = secretKey()
  if (istPlatzhalter(key)) {
    if (key.trim()) {
      console.error(`Der gesetzte Schlüssel taugt nicht ("${key.trim()}") — das sieht nach einem Platzhalter aus.\n`)
    }
    console.error(`Secret-Schlüssel (sb_secret_…): ${dashboard}`)
    console.error('(Project Settings → API Keys → Secret keys, nicht Publishable)\n')
    key = await schluesselErfragen()
  }
  if (istPlatzhalter(key)) {
    console.error('\nOhne Schlüssel geht es nicht. Abgebrochen.')
    process.exit(2)
  }

  const rest = async (pfad, init = {}) => {
    const res = await fetch(`${url}/rest/v1/${pfad}`, {
      ...init,
      headers: {
        ...authKopf(key),
        'Content-Type': 'application/json', ...(init.headers || {}),
      },
    })
    if (!res.ok) {
      const text = await res.text()
      // 401 heißt hier fast immer: der Publishable- statt des
      // Secret-Schlüssels. Das dazuzusagen erspart die Suche im Dashboard.
      // Zweite Möglichkeit (siehe `authKopf`): PostgREST nimmt den
      // Secret-Schlüssel im `Authorization`-Header nicht an — dann stünde dort
      // „Invalid JWT", und der Kopf müsste auf `apikey` allein zurückfallen.
      const hinweis =
        res.status === 401
          ? ' — ist das der sb_secret_…-Schlüssel? Der Publishable-Schlüssel darf die Wochen nicht ändern.'
          : ''
      throw new Error(`${init.method || 'GET'} ${pfad} ${res.status}: ${text}${hinweis}`)
    }
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  const filter = arg.cong ? `&congregation_id=eq.${arg.cong}` : ''
  const rows = await rest(`weeks?select=congregation_id,start,data&order=start.asc${filter}`)
  if (!rows?.length) { console.error('Keine Wochen gefunden.'); process.exit(1) }

  const zuSchreiben = []
  for (const row of rows) {
    const geaendert = wocheNachtragen(row.data)
    if (geaendert) zuSchreiben.push({ ...row, geaendert })
  }

  console.log(`${rows.length} Wochen gelesen, ${zuSchreiben.length} zu ändern:`)
  for (const w of zuSchreiben) console.log(`  ${w.start}  ${w.geaendert} Plätze`)
  if (!zuSchreiben.length) { console.log('Nichts zu tun — die Beschriftung sitzt schon.'); return }

  if (arg.trocken) {
    console.log(`\n--trocken: nichts geschrieben (${zuSchreiben.length} Wochen wären betroffen).`)
    return
  }

  for (const w of zuSchreiben) {
    await rest(`weeks?congregation_id=eq.${w.congregation_id}&start=eq.${w.start}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: w.data }),
    })
  }
  console.log(`\n${zuSchreiben.length} Wochen geschrieben.`)
}

// Nur beim direkten Aufruf laufen — der Test importiert die Helfer.
if (process.argv[1]?.endsWith('rollen-nachtragen.mjs')) {
  // `main().catch(…)` wie in den übrigen Wartungsskripten: ein unbehandelter
  // Fehlschlag riss Node mit einem `Assertion failed` aus libuv hinaus, und
  // daneben war die eigentliche Meldung nicht mehr zu finden.
  //
  // `exitCode` statt `exit()`: Nach einem gescheiterten `fetch` hält undici
  // seinen Verbindungspool noch kurz offen. `process.exit()` reißt ihn mitten
  // im Schließen weg — dann kam dieselbe libuv-Assertion zurück und stand
  // wieder über der Meldung, die sie erklären sollte. So läuft Node aus und
  // liefert den Code trotzdem.
  main().catch((err) => {
    console.error(`\nAbgebrochen: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
