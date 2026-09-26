#!/usr/bin/env node
/**
 * Sperrklinke für `noUncheckedIndexedAccess` (T42).
 *
 * Die Regel besagt: `arr[i]` kann `undefined` sein. Sie passt zu diesem
 * Datenmodell wie keine zweite — Wochen über ihre Position, Abschnitte,
 * Programmpunkte, Plätze, alles über Indizes. **T1 (Totalausfall in 30
 * Sprachen) hätte sie verhindert.**
 *
 * Sie einfach einzuschalten hätte knapp tausend Meldungen ergeben. Also läuft
 * sie hier gegen eine **Grundlinie**: je Datei die Zahl der noch geduldeten
 * Meldungen. Der Lauf schlägt an, wenn
 *
 *   - eine Datei **mehr** Meldungen bekommt als erlaubt, oder
 *   - eine Datei **neu** hinzukommt.
 *
 * Weniger ist immer willkommen — dann meldet der Lauf es und bittet darum, die
 * Grundlinie nachzuziehen:
 *
 *     node scripts/check-index-access.mjs --update
 *
 * So kann die Zahl nur fallen. Neue Dateien starten bei null und müssen die
 * Regel von Anfang an einhalten.
 *
 * **Kommt tsc gar nicht zum Prüfen** — nicht gefunden, abgestürzt, oder wegen
 * eines Syntaxfehlers ohne Typprüfung —, bricht der Lauf mit Rückgabewert 2 ab
 * und rührt die Grundlinie nicht an, auch nicht mit `--update`. Null
 * Meldungen von einem tsc, das nicht geprüft hat, sind kein Aufräumen
 * (`tscBefund`).
 *
 * **Warum keine zweite tsconfig mit `exclude`:** TypeScript zieht
 * ausgeschlossene Dateien über Importe trotzdem herein; `exclude` steuert nur
 * die Wurzelliste. Eine Grundlinie ist der einzige Weg zu echter
 * Datei-Granularität.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alsSkript, auszug, werkzeugPfad } from './gemeinsam.mjs'

const hier = dirname(fileURLToPath(import.meta.url))
const wurzel = join(hier, '..')
const grundlinieDatei = join(hier, 'index-access-baseline.json')

/** Meldungen je Datei zählen. Pfade mit `/`, damit die Grundlinie überall gleich aussieht. */
function zaehle(ausgabe) {
  const je = {}
  for (const zeile of ausgabe.split(/\r?\n/)) {
    const treffer = /^(.+?)\(\d+,\d+\): error TS\d+:/.exec(zeile)
    if (!treffer) continue
    const datei = treffer[1].replaceAll('\\', '/')
    je[datei] = (je[datei] ?? 0) + 1
  }
  return je
}

/**
 * Codes, die Parser und Scanner von TypeScript melden. Steht einer davon in
 * der Ausgabe, hat tsc die Typprüfung ausgelassen, und zwar für das **ganze**
 * Projekt, nicht nur für die Datei mit dem Fehler: `emitFilesAndReportErrors`
 * holt die semantischen Meldungen nur, wenn es keine syntaktischen gab.
 *
 * Gemessen am 26.9.2026 an TypeScript 6.0, in den Abschnitten
 * `src/compiler/parser.ts` und `scanner.ts` des Bündels: Fast alles liegt in
 * 1000–1999 oder 17000–17999, dazu kommen diese Einzelgänger. Einen ganzen
 * 18000er-Block darf die Liste nicht nehmen — TS18048 („… is possibly
 * 'undefined'") ist genau die Meldung, die die Sperrklinke zählt. Die Probe
 * hält die Liste gegen das installierte TypeScript, damit ein Update sie nicht
 * still veralten lässt.
 *
 * Manche 1000er meldet auch die Typprüfung selbst (etwa TS1308 zu `await`).
 * Die kommen nur vor, wenn auch `tsc -b` rot ist — und dann taugt die Zählung
 * ohnehin nichts.
 */
const SYNTAX_EINZELN = new Set([
  2427, 2457, 2458, 2657, 2754, 2809, 2819, 6188, 6189, 8033, 8034, 8039, 18009, 18016, 18026, 18029, 18030,
])

/** Lässt tsc bei diesem Code die Typprüfung aus? */
export function istSyntaxfehler(code) {
  return (code >= 1000 && code < 2000) || (code >= 17000 && code < 18000) || SYNTAX_EINZELN.has(code)
}

/**
 * **Hat tsc überhaupt geprüft?** Nur dann zählen seine Meldungen.
 *
 * Null Meldungen heißen entweder „alles sauber" oder „tsc lief gar nicht" —
 * und bis zum 26.9.2026 unterschied das Skript die beiden nicht. Es sah nur
 * auf `lauf.error`, also darauf, ob der Prozess **startet**. Node startet aber
 * auch, wenn es tsc nicht findet; es endet dann mit „Cannot find module" und
 * Rückgabewert 1. Genau das geschah in einem Worktree: null Meldungen gezählt,
 * alle 32 Dateien als aufgeräumt gemeldet, `--update` empfohlen. Das hätte die
 * Grundlinie geleert, und im Hauptcheckout wären danach alle 32 Dateien „neu"
 * gewesen.
 *
 * Deshalb zählt ein Lauf nur, wenn tsc bis zu seinem Befund kam. Sauber heißt
 * Rückgabewert 0; jeder andere braucht mindestens eine Meldung **zu einer
 * Datei** — mit solchen endet tsc mit 2. Ohne sie enden Node, wenn es
 * abstürzt, und tsc selbst, wenn es gar nicht erst zum Prüfen kam (fehlende
 * tsconfig: `error TS5058` ohne Datei), beide mit 1.
 *
 * **Und ein Syntaxfehler irgendwo** lässt tsc die Typprüfung im ganzen Projekt
 * auslassen (`istSyntaxfehler`). Gezählt würden dann nur die Syntaxfehler —
 * gemessen am 26.9.2026: `const = 1` an `hydrate.test.ts` gehängt ergab
 * „Aufgeräumt: 4 → 2, alle anderen → 0" samt der Bitte, `--update` zu fahren.
 * Die CI fängt das mit `npm run lint` vorher ab, ein Lauf von Hand nicht.
 *
 * `lauf` ist, was `spawnSync` zurückgibt. Rein, damit die Probe jeden dieser
 * Fälle nachstellen kann, ohne tsc zu starten. Ergebnis: `{ je }` mit den
 * Meldungen je Datei — oder `{ fehler }` mit dem Grund, warum es keine gibt.
 */
export function tscBefund(lauf) {
  if (lauf.error) return { fehler: `tsc konnte nicht gestartet werden: ${lauf.error.message}` }
  if (lauf.status === null) return { fehler: `tsc wurde abgebrochen (${lauf.signal}).` }

  const stdout = lauf.stdout ?? ''
  const stderr = lauf.stderr ?? ''
  // Nur stderr: Dorthin schreibt Node, wenn es beim Laden scheitert. tsc
  // meldet nach stdout, und ein „TS2307: Cannot find module './x'" ist dort
  // ein gewöhnlicher Befund, kein Absturz.
  const fehlt = stderr.split(/\r?\n/).find((z) => z.includes('Cannot find module'))
  if (fehlt) return { fehler: `tsc ist nicht gelaufen — Node fand ein Modul nicht:\n  ${fehlt.trim()}` }

  const ausgabe = `${stdout}${stderr}`
  const syntax = ausgabe.split(/\r?\n/).filter((z) => {
    const t = /\berror TS(\d+):/.exec(z)
    return t !== null && istSyntaxfehler(Number(t[1]))
  })
  if (syntax.length > 0) {
    return {
      fehler:
        'tsc hat die Typen nicht geprüft — bei einem Syntaxfehler lässt es die Typprüfung im ganzen Projekt aus:\n' +
        `${auszug(syntax.join('\n'))}\nErst den Syntaxfehler beheben, dann messen.`,
    }
  }

  const je = zaehle(ausgabe)
  if (lauf.status !== 0 && Object.keys(je).length === 0) {
    return {
      fehler: `tsc endete mit ${lauf.status}, aber ohne eine einzige Meldung zu einer Datei — geprüft hat es nicht:\n${auszug(ausgabe)}`,
    }
  }
  return { je }
}

/**
 * tsc mit der Regel laufen lassen und seinen Befund holen. Meldungen sind hier
 * der Normalfall, kein Absturz — deshalb `spawnSync`: es liefert Ausgabe
 * **und** Rückgabewert, ohne bei einem Fehlschlag zu werfen. `execFileSync`
 * würde je nach Plattform mal werfen und mal nicht, und eine Grundlinie, die
 * davon abhängt, ist keine.
 *
 * Wo tsc liegt, sucht `werkzeugPfad` (in `gemeinsam.mjs`) so, wie `npx` es
 * sucht. Bis zum 26.9.2026 stand hier der feste Pfad
 * `<wurzel>/node_modules/typescript/bin/tsc`, und im Worktree zeigte er ins
 * Leere — was daraus wurde, steht bei `tscBefund`.
 */
function messen() {
  let tsc
  try {
    tsc = werkzeugPfad(wurzel, 'typescript', 'tsc')
  } catch (err) {
    return { fehler: err.message }
  }
  const lauf = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.index.json', '--noEmit'], {
    cwd: wurzel,
    encoding: 'utf8',
  })
  return tscBefund(lauf)
}

/**
 * Ohne Befund weder vergleichen noch schreiben — und kein Hinweis auf
 * `--update`: Nachzuziehen gibt es nichts, gemessen wurde ja nicht.
 * Rückgabewert 2, damit der Abbruch nicht wie eine verletzte Grundlinie (1)
 * aussieht.
 */
function abbrechen(grund) {
  console.error(grund)
  console.error('\nNichts gemessen — die Grundlinie bleibt, wie sie ist.')
  process.exit(2)
}

async function main() {
  const aktualisieren = process.argv.includes('--update')
  const befund = messen()
  if (befund.fehler) abbrechen(befund.fehler)
  const jetzt = befund.je

  if (aktualisieren) {
    const sortiert = Object.fromEntries(Object.entries(jetzt).sort(([a], [b]) => a.localeCompare(b)))
    writeFileSync(grundlinieDatei, `${JSON.stringify(sortiert, null, 2)}\n`)
    const summe = Object.values(sortiert).reduce((n, x) => n + x, 0)
    console.log(`Grundlinie geschrieben: ${Object.keys(sortiert).length} Dateien, ${summe} Meldungen.`)
    process.exit(0)
  }

  const grundlinie = JSON.parse(readFileSync(grundlinieDatei, 'utf8'))

  const neu = []
  const gewachsen = []
  const geschrumpft = []

  for (const [datei, n] of Object.entries(jetzt)) {
    const erlaubt = grundlinie[datei]
    if (erlaubt === undefined) neu.push(`${datei} (${n})`)
    else if (n > erlaubt) gewachsen.push(`${datei}: ${erlaubt} → ${n}`)
    else if (n < erlaubt) geschrumpft.push(`${datei}: ${erlaubt} → ${n}`)
  }
  for (const [datei, erlaubt] of Object.entries(grundlinie)) {
    if (jetzt[datei] === undefined) geschrumpft.push(`${datei}: ${erlaubt} → 0`)
  }

  if (neu.length > 0) {
    console.error('Neue Dateien verletzen noUncheckedIndexedAccess:')
    for (const z of neu) console.error(`  ${z}`)
  }
  if (gewachsen.length > 0) {
    console.error('Mehr Meldungen als erlaubt:')
    for (const z of gewachsen) console.error(`  ${z}`)
  }
  if (neu.length > 0 || gewachsen.length > 0) {
    console.error('\nDie Grundlinie darf nur fallen. Bitte die Zugriffe absichern.')
    process.exit(1)
  }

  const offen = Object.values(jetzt).reduce((n, x) => n + x, 0)
  if (geschrumpft.length > 0) {
    console.log('Aufgeräumt — bitte die Grundlinie nachziehen:')
    for (const z of geschrumpft) console.log(`  ${z}`)
    console.log('\n  node scripts/check-index-access.mjs --update')
    process.exit(1)
  }
  console.log(`noUncheckedIndexedAccess: ${offen} Meldungen in ${Object.keys(jetzt).length} Dateien — unverändert.`)
}

alsSkript(import.meta.url, main)
