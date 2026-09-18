/**
 * Was alle Wartungsskripte brauchen.
 *
 * Diese drei Helfer lagen in bis zu vier Abschriften nebeneinander:
 * `argumente` viermal, der Anzeigename dreimal, `ladeTabellen` dreimal. Keine
 * davon war anders gemeint — sie sind nur mitgewachsen, weil jedes Skript für
 * sich lauffähig sein sollte.
 *
 * Der Weg dahin war längst gebahnt: `treffpunkte-importieren.mjs` holt sich
 * seine Helfer seit jeher aus einem anderen Skript. Hier stehen sie nun ohne
 * Umweg über einen Importeur, der sie zufällig zuerst hatte.
 *
 * Die bisherigen Fundstellen bleiben gültig: Die Skripte reichen die Namen
 * weiter (`export { ... } from`), damit Aufrufer und Tests unverändert bleiben.
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

/**
 * Argumente der Form `--name Wert` einlesen; `--flagge` wird `true`.
 *
 * Alles, was nicht mit `--` beginnt und nicht Wert einer Option ist, wird
 * übergangen — Skripte werden von Hand aufgerufen, und ein vertippter
 * Stellungsparameter soll nicht stillschweigend zur Option werden.
 */
export function argumente(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const naechstes = argv[i + 1]
    if (naechstes === undefined || naechstes.startsWith('--')) out[a.slice(2)] = true
    else {
      out[a.slice(2)] = naechstes
      i++
    }
  }
  return out
}

/**
 * Anzeigename wie in der App (`_shared/planung.ts`, `src/data/helpers.ts`).
 *
 * Ein gesetzter Anzeigename gilt; sonst Vor- und Nachname, getrimmt — damit
 * ein fehlender Teil kein führendes oder doppeltes Leerzeichen hinterlässt.
 */
export function personDisplayName(fn, ln, dn) {
  return (dn && dn.trim()) || `${fn ?? ''} ${ln ?? ''}`.trim()
}

/**
 * Die NWS-Ausgabetabellen eines Verzeichnisses einlesen.
 *
 * `tabellen` bildet den Schlüssel auf den Dateinamen ab; welche gebraucht
 * werden, weiß jedes Skript für sich, das Einlesen ist überall dasselbe.
 */
export function ladeTabellen(dir, tabellen) {
  const t = {}
  for (const [key, datei] of Object.entries(tabellen)) {
    t[key] = JSON.parse(fs.readFileSync(path.join(dir, datei), 'utf8'))
  }
  return t
}

/**
 * Der Schlüssel, mit dem die Wartungsskripte schreiben.
 *
 * **Er heißt nicht mehr Service-Role.** Die Legacy-JWT-Schlüssel dieses
 * Projekts (`anon`, `service_role`) sind seit 14.8.2026 deaktiviert; gültig ist
 * der `sb_secret_…` aus dem Dashboard (Project Settings → API Keys → Secret
 * keys). Weil die Umgebungsvariable in allen Skripten und Notizen
 * `SUPABASE_SERVICE_ROLE_KEY` hieß, gilt der alte Name weiter — der neue
 * `SUPABASE_SECRET_KEY` hat Vorrang. So muss niemand seine Gewohnheit ändern,
 * und wer den treffenden Namen benutzt, wird nicht bestraft.
 *
 * **Die Umgebung ist nicht die einzige Quelle.** Eine gesetzte Variable lebt nur
 * in dem Fenster, in dem sie gesetzt wurde — und ein Aufruf ohne Terminal kann
 * nicht einmal nachfragen: `zugangsdaten()` bricht dort ab („kein Terminal zum
 * Fragen"). Das trifft jede Sitzung, die ihre Befehle in einer je frischen Shell
 * startet; gemessen am 18. September 2026: zwei Aufrufe hintereinander, zwei
 * verschiedene Shell-Kennungen, die Variable dazwischen weg.
 *
 * Deshalb zählt zusätzlich, was in `.env.local` steht — derselbe Ort, aus dem
 * die Projekt-URL ohnehin kommt, und gitignored wie sie. Hinterlegt wird der
 * Schlüssel einmal mit `scripts/schluessel-setzen.mjs`.
 *
 * **Reihenfolge: Umgebung schlägt Datei.** Wer für einen einzelnen Lauf einen
 * anderen Schlüssel setzt (ein zweites Projekt, ein fremder Mandant), soll ihn
 * nicht von der Datei überstimmt bekommen.
 */
export function secretKey(dateien = ENV_DATEIEN) {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    wertAusEnvDatei('SUPABASE_SECRET_KEY', dateien) ||
    wertAusEnvDatei('SUPABASE_SERVICE_ROLE_KEY', dateien)
  )
}

/** Die Dateien, aus denen Skripte Zugangsdaten lesen — in dieser Reihenfolge. */
export const ENV_DATEIEN = ['.env.local', '.env']

/**
 * Einen Wert aus dem Text einer `.env`-Datei lesen.
 *
 * Von Hand geteilt statt per Regex: `trim()` erledigt das CR unter Windows
 * gleich mit (und den BOM, den Editoren dort voranstellen — U+FEFF zählt als
 * Leerraum), und ein Wert darf selbst `=` enthalten.
 *
 * Das stand hier bis zum 18. September 2026 nur für `VITE_SUPABASE_URL`. Der
 * Schlüssel geht jetzt denselben Weg; ein zweites Leseverfahren daneben wäre
 * genau die Sorte Abschrift, gegen die `schluessel-einheitlich.test.ts` steht.
 */
export function wertAusEnvText(inhalt, name) {
  for (const roh of String(inhalt).split('\n')) {
    const zeile = roh.trim()
    if (!zeile || zeile.startsWith('#')) continue
    const gleich = zeile.indexOf('=')
    if (gleich < 0) continue
    if (zeile.slice(0, gleich).trim() !== name) continue
    const wert = zeile.slice(gleich + 1).trim()
    return wert.replace(/^["']|["']$/g, '')
  }
  return ''
}

/** Die Projekt-URL — der Name, den Aufrufer und Proben seit jeher kennen. */
export function urlAusEnvText(inhalt) {
  return wertAusEnvText(inhalt, 'VITE_SUPABASE_URL')
}

/**
 * Denselben Wert aus der ersten Datei holen, die ihn hat. Die Dateiliste ist ein
 * Parameter, damit Proben eine eigene vorlegen können, statt die des Projekts zu
 * lesen — oder gar zu beschreiben.
 */
export function wertAusEnvDatei(name, dateien = ENV_DATEIEN) {
  for (const datei of dateien) {
    try {
      const wert = wertAusEnvText(fs.readFileSync(datei, 'utf8'), name)
      if (wert) return wert
    } catch {
      continue // Datei gibt es nicht — die nächste versuchen.
    }
  }
  return ''
}

/**
 * Eine `name=wert`-Zeile im Text einer `.env`-Datei **setzen**: eine vorhandene
 * ersetzen, sonst anhängen. Alles andere bleibt Zeile für Zeile stehen — in der
 * Datei stehen Projekt-URL und Publishable-Key, und die soll das Hinterlegen
 * eines Schlüssels nicht anfassen.
 *
 * Rein, damit die Proben das Ergebnis lesen können, ohne eine Datei zu
 * schreiben. Die Zeilenenden folgen dem, was schon dasteht: Eine unter Windows
 * angelegte Datei bleibt CRLF, statt halb umgestellt zu werden.
 */
export function zeileGesetzt(inhalt, name, wert, kommentar = '') {
  const eol = /\r\n/.test(inhalt) ? '\r\n' : '\n'
  const neu = `${name}=${wert}`
  let ersetzt = false
  const raus = String(inhalt)
    .split(/\r?\n/)
    .map((roh) => {
      const zeile = roh.trim()
      if (!zeile || zeile.startsWith('#')) return roh
      const gleich = zeile.indexOf('=')
      if (gleich < 0 || zeile.slice(0, gleich).trim() !== name) return roh
      ersetzt = true
      return neu
    })
  const leerzeilenAmEndeWeg = () => {
    while (raus.length && raus[raus.length - 1].trim() === '') raus.pop()
  }
  if (!ersetzt) {
    leerzeilenAmEndeWeg()
    if (raus.length) raus.push('')
    for (const k of kommentar ? kommentar.split('\n') : []) raus.push(`# ${k}`)
    raus.push(neu)
  }
  // Genau ein Zeilenende am Schluss — nicht keines und nicht drei.
  leerzeilenAmEndeWeg()
  return raus.join(eol) + eol
}

/**
 * Steht dort ein unersetzter Platzhalter statt eines Schlüssels?
 *
 * Ohne diese Prüfung läuft ein Skript los und stirbt an einem nackten
 * „401: Invalid API key" samt Stapelabzug — eine Meldung, die die Ursache nicht
 * nennt. Ein aus einer Anleitung kopierter Aufruf trägt den Platzhalter aber
 * fast immer noch, und genau das ist zweimal passiert.
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
 * Eine Zeile lesen, **ohne sie anzuzeigen** — für den Schlüssel.
 *
 * Er landet damit weder in der PowerShell-History (anders als bei
 * `$env:… = "…"`) noch im Rückblick des Terminals, den jeder mitlesen kann,
 * der über die Schulter oder in einen Screenshot schaut.
 *
 * **Gelesen wird zeilenweise über `readline`, nicht Taste für Taste.** Hier
 * stand bis zum 18. September 2026 eine Schleife über einzelne Zeichen im
 * Rohmodus (`setRawMode(true)` + `data`-Ereignisse). Die verdeckt zuverlässig —
 * sie bekommt aber nur etwas zu sehen, wenn die Konsole **jede Taste einzeln**
 * durchreicht. Das eingebettete Terminal der Claude-Desktop-App tut das nicht:
 * Die Aufforderung stand da, ein eingefügter Schlüssel kam nie an, und der Lauf
 * hing, bis jemand den Prozess abschoss. Über `readline` ging genau dasselbe
 * Einfügen vorher anstandslos — eine eingefügte Zeile ist für die Konsole eine
 * Zeile.
 *
 * Verdeckt wird deshalb **so weit die Konsole es zulässt**: `readline` schreibt
 * jeden Tastendruck über `_writeToOutput` zurück, und das wird hier
 * verschluckt. Wo das nicht greift (eine Konsole, die selbst mitschreibt),
 * bleibt der Schlüssel sichtbar — dann ist er im Rückblick zu sehen, aber
 * eingegeben. Lieber sichtbar als gar nicht.
 *
 * `ein`/`aus` sind Parameter, damit die Probe ohne Terminal messen kann.
 */
export function verdecktLesen({ ein = process.stdin, aus = process.stderr } = {}) {
  return new Promise((fertig) => {
    const rl = readline.createInterface({ input: ein, output: aus, terminal: Boolean(ein.isTTY) })
    // Nichts zurückschreiben: weder die Zeichen noch die Steuerfolgen, mit
    // denen readline die Zeile neu zeichnet.
    rl._writeToOutput = () => {}
    rl.on('SIGINT', () => {
      rl.close()
      aus.write('\n')
      process.exit(130) // Strg+C
    })
    rl.question('', (eingabe) => {
      rl.close()
      aus.write('\n')
      fertig(String(eingabe).trim())
    })
  })
}

/**
 * **Projekt-URL und Schlüssel — fertig zum Losschreiben.**
 *
 * Bis zum 18. September 2026 holte sich jedes Skript beides selbst aus der
 * Umgebung und brach ab, wenn etwas fehlte („Fehlt: SUPABASE_SECRET_KEY").
 * Das hieß: vor jedem Lauf `$env:…` setzen, im **selben** Fenster, und wer den
 * Aufruf aus einer Anleitung kopierte, hatte den Platzhalter darin. Genau daran
 * sind nachweislich drei Läufe gescheitert — zuletzt ein ganzer Neuaufbau, bei
 * dem fünf Skripte nacheinander „Invalid API key" meldeten.
 *
 * Deshalb fragt das Skript jetzt selbst. Die Regel dahinter:
 *
 *  - **Die URL steht schon im Projekt** (`.env.local`, als
 *    `VITE_SUPABASE_URL`). Sie noch einmal von Hand zu setzen war eine Variable
 *    zu viel.
 *  - **Der Schlüssel wird erfragt**, wenn keiner dasteht — verdeckt, mit dem
 *    Link aufs Dashboard daneben. Gesetzte Umgebungsvariablen haben weiterhin
 *    Vorrang: Wer sie einmal setzt, wird nie gefragt.
 *  - **Ohne Terminal wird nicht gefragt** (Pipe, CI) — dort hinge der Lauf
 *    sonst, statt mit einer Meldung abzubrechen.
 *
 * `rollen-nachtragen.mjs` konnte das als einziges Skript schon; hier steht es
 * für alle. Dass es dabei bleibt, hält `schluessel-einheitlich.test.ts` fest.
 */
export async function zugangsdaten() {
  const url = process.env.SUPABASE_URL || wertAusEnvDatei('VITE_SUPABASE_URL')
  if (!url) {
    console.error('Keine Projekt-URL: weder SUPABASE_URL gesetzt noch VITE_SUPABASE_URL in .env.local.')
    process.exit(2)
  }

  let key = secretKey()
  if (istPlatzhalter(key)) {
    if (key.trim()) {
      console.error(`Der gesetzte Schlüssel taugt nicht ("${key.trim()}") — das sieht nach einem Platzhalter aus.\n`)
    }
    if (!process.stdin.isTTY) {
      console.error(
        'Kein Schlüssel und kein Terminal zum Fragen.\n' +
          'Einmal hinterlegen: node scripts/schluessel-setzen.mjs — fragt verdeckt und legt ihn in .env.local ab.',
      )
      process.exit(2)
    }
    console.error(`Secret-Schlüssel: https://supabase.com/dashboard/project/${refAusUrl(url)}/settings/api-keys`)
    console.error('(Project Settings → API Keys → Secret keys, nicht Publishable)')
    process.stderr.write('sb_secret_… (bleibt verdeckt): ')
    key = await verdecktLesen()
  }
  if (istPlatzhalter(key)) {
    console.error('Ohne Schlüssel geht es nicht. Abgebrochen.')
    process.exit(2)
  }
  return { url, key: key.trim() }
}

/**
 * Kopfzeilen zur Anmeldung — **die beiden Schlüsselarten wollen verschiedene.**
 *
 * Die Legacy-Schlüssel sind JWTs, und Supabase-Clients senden sie in `apikey`
 * **und** `Authorization: Bearer`. Die neuen (`sb_secret_…`,
 * `sb_publishable_…`) sind keine JWTs: Steht so einer in `Authorization`,
 * versucht die Plattform ihn als JWT zu lesen und weist die Anfrage mit
 * „Invalid JWT" ab. Die Doku sagt es ausdrücklich — „Send publishable and
 * secret keys on the `apikey` header only".
 *
 * Bis dahin schickte jedes Skript blind beide Kopfzeilen. Das ging gut, solange
 * PostgREST den Zusatz duldete — eine Duldung, auf die sich nichts stützen
 * sollte. Beide Arten müssen weiter gehen: Legacy-Schlüssel gelten allgemein
 * bis Ende 2026, und ein anderes Projekt kann noch welche haben.
 */
export function authKopf(key) {
  const k = String(key ?? '').trim()
  return k.startsWith('eyJ') ? { apikey: k, Authorization: `Bearer ${k}` } : { apikey: k }
}
