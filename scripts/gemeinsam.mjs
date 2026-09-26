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
 * Umweg über einen Importeur, der sie zufällig zuerst hatte — und **nur**
 * hier: Bis zum 25. September 2026 reichten fünf Skripte die Namen noch
 * weiter (`export { … }`), damit Tests ihre alten Import-Wege behielten. Zwei
 * Wege zu einem Helfer sind zwei Gelegenheiten, ihn an einem davon zu
 * vergessen; Aufrufer und Tests holen ihn seither von hier.
 */

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

/** Wochentag-Namen für Berichte — Index wie `Date.getDay()` (0 = Sonntag). */
export const WOCHENTAG_NAMEN = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

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
 * Name einer Person wie in der App (`_shared/planung.ts`, `src/data/helpers.ts`):
 * Vor- und Nachname, getrimmt — damit ein fehlender Teil kein führendes oder
 * doppeltes Leerzeichen hinterlässt.
 *
 * Bis T110 konnte ein Feld `dn` ihn überschreiben; es ist entfallen, weil
 * Vor- und Nachname je Versammlung eindeutig sind.
 */
export function personDisplayName(fn, ln) {
  return `${fn ?? ''} ${ln ?? ''}`.trim()
}

/**
 * **Gleichnamige im einzuspielenden Bestand** — je Name die betroffenen
 * Personen, in der Reihenfolge ihres Auftretens.
 *
 * Verglichen wird wie in der App (`namensSchluessel`, `src/data/helpers.ts`)
 * und wie im Index `persons_name_eindeutig`: mehrfache Leerzeichen
 * zusammengezogen, ohne Rand, klein geschrieben; Akzente bleiben
 * unterschieden. Namenlose zählen nicht mit.
 *
 * Wer das übergeht, bekommt die Auskunft von PostgreSQL — einen abgelehnten
 * Sammel-`insert` ohne Namen darin, mitten im Zurücksetzen, wenn die alten
 * Personen bereits gelöscht sind (T110).
 */
export function gleichnamige(persons) {
  const nach = new Map()
  for (const p of persons) {
    const key = personDisplayName(p.fn, p.ln).replace(/\s+/g, ' ').toLowerCase()
    if (!key) continue
    const liste = nach.get(key)
    if (liste) liste.push(p)
    else nach.set(key, [p])
  }
  return [...nach.values()].filter((liste) => liste.length > 1)
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

/**
 * Kopfzeilen für den Aufruf einer **Edge Function** — dort gilt das Gegenteil.
 *
 * Das Function-Gateway prüft ein JWT (`verify_jwt` in `supabase/config.toml`)
 * und liest es aus `Authorization`; der Secret-Schlüssel gilt ihm als eines.
 * Ohne diese Kopfzeile antwortet es mit 401 — während PostgREST mit genau
 * dieser Kopfzeile „Invalid JWT" meldet (siehe `authKopf`).
 *
 * Zwei Ziele, zwei Regeln, zwei Funktionen: Ein Schalter an einer einzigen
 * Funktion würde an der Aufrufstelle entschieden, und das ist die Stelle, an
 * der es zuletzt schiefging.
 */
export function funktionsKopf(key) {
  const k = String(key ?? '').trim()
  return { ...authKopf(k), Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

/**
 * Reihenfolge der Treffpunkte einer Woche: Wochentag (ab Montag), dann
 * Uhrzeit, dann Gruppe — **dieselbe wie in der App** (`fsSort` in
 * `src/data/fs.ts`). Ohne Gruppe (der Versammlungstreffpunkt) steht vorn.
 *
 * Stand dreimal da, und die drei Abschriften behandelten eine fehlende Gruppe
 * verschieden: Eine von ihnen rief `a.grp.localeCompare(b.grp)` — bei einem
 * Versammlungstreffpunkt aus der Datenbank ist `grp` aber `null`, und dann
 * warf der Sortierlauf. Jede der drei behauptete im Kommentar, „wie in der
 * App" zu sortieren.
 */
export function fsSort(a, b) {
  return (
    ((a.wd + 6) % 7) - ((b.wd + 6) % 7) ||
    String(a.time).localeCompare(String(b.time)) ||
    String(a.grp ?? '').localeCompare(String(b.grp ?? ''))
  )
}

/**
 * **Welche Versammlung ist gemeint?** — einmal für alle Wartungsskripte.
 *
 * Sechs Skripte beantworteten das je selbst, in fünf Fassungen: `--cong` oder
 * die erste Zeile, dazu die Spalten, die das jeweilige Skript braucht, und
 * eine Fehlermeldung. Die Abschriften waren auseinandergelaufen, und zwar
 * nicht nur im Wortlaut: **Drei nahmen `--cong` auf Treu und Glauben** und
 * fragten die Datenbank gar nicht erst. Eine vertippte Id lief damit
 * anstandslos durch — jede folgende Abfrage traf null Zeilen, jedes Schreiben
 * ging ins Leere, und das Skript meldete am Ende zufrieden, was es alles
 * getan habe.
 *
 * Hier wird **immer** gefragt. `spalten` nennt, was der Aufrufer braucht;
 * `id` ist immer dabei. Geworfen statt `process.exit`: Jedes dieser Skripte
 * hat ein `main().catch`, das die Meldung ohnehin ausgibt — und geworfen
 * lässt sich die Regel prüfen.
 */
export async function versammlungHolen(rest, arg, spalten = 'id') {
  const felder = spalten.split(',').includes('id') ? spalten : `id,${spalten}`
  const filter = arg.cong ? `id=eq.${arg.cong}` : 'limit=1'
  const row = (await rest(`congregations?select=${felder}&${filter}`))[0]
  if (!row) {
    throw new Error(
      arg.cong
        ? `Keine Versammlung mit der Id ${arg.cong}.`
        : 'Keine Versammlung gefunden — erst scripts/versammlung-anlegen.mjs.',
    )
  }
  return row
}

/**
 * **Der Zugriff auf PostgREST — einmal für alle Wartungsskripte.**
 *
 * Elf Skripte trugen dafür je eine eigene Closure: derselbe `fetch` auf
 * `${url}/rest/v1/${pfad}`, dieselben Kopfzeilen, dieselbe Fehlerprüfung,
 * dasselbe „leerer Body ist kein Fehler". Normalisiert waren es **vier**
 * verschiedene Fassungen — die Abschriften waren also längst auseinandergelaufen:
 * Nur eine erklärte den 401, zwei nannten im Fehlertext nicht einmal die
 * Methode, und beim `Prefer`-Kopf war jede anders.
 *
 * Dasselbe hat die Edge-Seite längst gelöst (`_shared/rest.ts`, dort aus
 * demselben Grund). Hier ist es dieselbe Abstraktion für Node.
 *
 * `rest(pfad, init)` nimmt eine `fetch`-Init entgegen (`method`, `body`,
 * zusätzliche `headers`) und gibt den geparsten Körper zurück — oder `null`,
 * wenn keiner kam. **Fehler werfen**: Ein Wartungsskript, das weiterläuft,
 * nachdem eine Zeile nicht geschrieben wurde, hinterlässt einen halben Bestand.
 * (Die RLS-Proben messen dagegen Statuscodes und brauchen deshalb `pruefKlient`.)
 */
export function restKlient(url, key) {
  return async (pfad, init = {}) => {
    const res = await fetch(`${url}/rest/v1/${pfad}`, {
      ...init,
      headers: { ...authKopf(key), 'Content-Type': 'application/json', ...(init.headers || {}) },
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
    // Leerer Body bei **jedem** Erfolgsstatus, nicht nur 204: `Prefer:
    // return=minimal` liefert auch bei POST ein 201 ohne Inhalt, und
    // `res.json()` darauf wirft „Unexpected end of JSON input".
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
}

/**
 * **Ein Urteil der Richtlinien — oder nur eine kaputte Anfrage?** Für die
 * beiden RLS-Proben (`mandanten-nachweis`, `mitgliedsrechte-probe`).
 *
 * Beide zählen eine Abweisung als bestanden. Ein Urteil der Richtlinien sind
 * bei PostgREST aber nur 401 (keine gültige Anmeldung) und 403 (42501, ein
 * RLS-Verstoß). Ein 400 heißt, die Anfrage selbst war kaputt — eine Spalte, die
 * es nicht gibt, ein Wert, den die Spalte nicht nimmt —, ein 409 eine verletzte
 * Bedingung, ein 5xx ein Fehler des Servers. Bis zum 26.9.2026 zählte das alles
 * als „abgewiesen": Eine vertippte Spalte bestand damit jede Fremd-Probe, sie
 * hatte nur nichts gemessen.
 *
 * Eine Edge Function vergibt ihre Status selbst (`substitute` meldet mit 409
 * sowohl das Urteil „not-sought" als auch „slot-taken"); dort entscheidet der
 * Aufrufer am Fehlercode, was ein Urteil ist.
 */
export const RLS_URTEILE = [401, 403]

/** Ein Fehlerstatus, der **kein** Urteil der Richtlinien ist — die Probe hat nichts gemessen. */
export function anfrageKaputt(status) {
  return status >= 400 && !RLS_URTEILE.includes(status)
}

/**
 * **Der Zugriff aus der Sicht eines angemeldeten Mitglieds** — für die beiden
 * RLS-Proben (`mandanten-nachweis`, `mitgliedsrechte-probe`).
 *
 * Zwei Unterschiede zu `restKlient`, und beide sind der ganze Zweck:
 *
 *  - Es geht der **anon**-Schlüssel mit dem Nutzer-Token, nicht der
 *    Service-Role-Schlüssel. Nur so greifen die RLS-Richtlinien überhaupt.
 *  - Ein Fehler **wirft nicht**. Der Statuscode ist hier der Messwert: Eine
 *    abgewiesene Abfrage ist der Beweis, nicht der Abbruch.
 */
export function pruefKlient(url, anon, token) {
  return async (pfad, method = 'GET', body, prefer = 'return=representation') => {
    const antwort = await fetch(`${url}/rest/v1/${pfad}`, {
      method,
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: prefer,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await antwort.text()
    let daten = null
    try {
      daten = text ? JSON.parse(text) : null
    } catch {
      // Kein JSON — dann ist der rohe Text die Auskunft (PostgREST antwortet
      // bei manchen Fehlern in Klartext).
      daten = text
    }
    return { status: antwort.status, daten }
  }
}

/**
 * Läuft dieses Modul als Skript (`node scripts/x.mjs`) — oder wurde es
 * importiert, etwa von einem Test?
 *
 * Genau verglichen, nicht über das Ende des Dateinamens: Die lose Prüfung
 * (`import.meta.url.endsWith(basename)`) stand in elf Skripten und griff bei
 * `testversammlung-anlegen.mjs` daneben, das auf `versammlung-anlegen.mjs`
 * endet. Unter Windows kann sich der Laufwerksbuchstabe in der Schreibweise
 * unterscheiden, deshalb dort ohne Rücksicht auf Groß und Klein.
 */
export function direktAufgerufen(metaUrl) {
  const skript = process.argv[1]
  if (!skript) return false
  const a = path.resolve(skript)
  const b = fileURLToPath(metaUrl)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/**
 * `main()` laufen lassen, wenn das Modul direkt aufgerufen wurde — mit der
 * Fehlerbehandlung, die alle Wartungsskripte teilen.
 *
 * `exitCode` statt `exit()`: Nach einem gescheiterten `fetch` hält undici
 * seinen Verbindungspool noch kurz offen. `process.exit()` reißt ihn mitten
 * im Schließen weg — dann steht eine libuv-Assertion über der Meldung, die
 * sie erklären sollte. So läuft Node aus und liefert den Code trotzdem.
 */
export function alsSkript(metaUrl, main) {
  if (!direktAufgerufen(metaUrl)) return
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err))
    process.exitCode = 1
  })
}

/**
 * **Wo liegt der Befehl eines Pakets?** — so gesucht, wie Node und `npx` ihn
 * suchen: von `wurzel` aus durch jedes `node_modules` hinauf bis zum Paket,
 * dann dessen Eintrag unter `bin` in der `package.json`.
 *
 * Bis zum 26.9.2026 bauten `check-index-access.mjs` und `mutationsprobe.mjs`
 * den Pfad fest zusammen: `<wurzel>/node_modules/<paket>/…`. Ein Worktree der
 * Desktop-App (`.claude/worktrees/<name>`) hat aber kein eigenes
 * `node_modules` — `npx` findet die Pakete durch Hochwandern im
 * Hauptcheckout, der feste Pfad nicht. Node starb an „Cannot find module",
 * und beide Skripte hielten den Startfehler für ein Messergebnis: Die
 * Sperrklinke meldete alle 32 Dateien „aufgeräumt" (ein `--update` darauf
 * hätte die Grundlinie geleert), die Mutationsprobe jede Regel „bewacht
 * (unbekannt, 0s)".
 *
 * Wirft, wenn sich nichts findet. Was dann geschieht, entscheidet der
 * Aufrufer; die beiden Prüfungen brechen mit 2 ab.
 */
export function werkzeugPfad(wurzel, paket, befehl = paket) {
  const vonWurzel = createRequire(path.join(wurzel, 'package.json'))
  let manifest
  try {
    manifest = vonWurzel.resolve(`${paket}/package.json`)
  } catch (err) {
    // Anderes als „nicht da" (etwa ein Paket, das seine package.json nicht
    // mehr exportiert) sagt Nodes eigene Meldung genauer.
    if (err.code !== 'MODULE_NOT_FOUND') throw err
    throw new Error(
      `${paket} ist von ${wurzel} aus nicht zu finden — weder dort noch in einem Ordner ` +
        `darüber liegt node_modules/${paket}.\n` +
        'Einmal `npm ci` fahren; in einem Worktree genügt es im Hauptcheckout.',
    )
  }
  const ordner = path.dirname(manifest)
  const { bin } = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  // `bin` ist ein Objekt (Befehl → Datei) — oder eine bloße Zeichenkette, wenn
  // das Paket nur einen Befehl mitbringt, und der heißt dann wie das Paket.
  const datei = typeof bin === 'string' ? (befehl === paket ? bin : undefined) : bin?.[befehl]
  if (!datei) throw new Error(`${paket} (${ordner}) bringt keinen Befehl ${befehl} mit.`)
  const pfad = path.join(ordner, datei)
  if (!fs.existsSync(pfad)) {
    throw new Error(`${pfad} fehlt, obwohl ${paket} es als Befehl ${befehl} nennt — \`npm ci\` fahren.`)
  }
  return pfad
}

/**
 * Die ersten Zeilen einer Ausgabe, eingerückt — genug, um den Grund zu sehen.
 *
 * Der **Anfang**, nicht das Ende: Node wie vitest schreiben den Grund vor die
 * Aufrufkette. Gemessen am 26.9.2026 an vitest mit fehlender Config: 22
 * Zeilen, der Grund in den ersten vier, danach nur noch Stack.
 */
export function auszug(ausgabe) {
  const zeilen = ausgabe.split(/\r?\n/).filter((z) => z.trim() !== '')
  if (zeilen.length === 0) return '  (keine Ausgabe)'
  return zeilen.slice(0, 10).map((z) => `  ${z}`).join('\n')
}
