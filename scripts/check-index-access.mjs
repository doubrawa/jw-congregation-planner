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
 * **Warum keine zweite tsconfig mit `exclude`:** TypeScript zieht
 * ausgeschlossene Dateien über Importe trotzdem herein; `exclude` steuert nur
 * die Wurzelliste. Eine Grundlinie ist der einzige Weg zu echter
 * Datei-Granularität.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const hier = dirname(fileURLToPath(import.meta.url))
const wurzel = join(hier, '..')
const grundlinieDatei = join(hier, 'index-access-baseline.json')
const aktualisieren = process.argv.includes('--update')

/**
 * tsc mit der Regel laufen lassen. Meldungen sind hier der Normalfall, kein
 * Absturz — deshalb `spawnSync`: es liefert Ausgabe **und** Rückgabewert, ohne
 * bei einem Fehlschlag zu werfen. `execFileSync` würde je nach Plattform mal
 * werfen und mal nicht, und eine Grundlinie, die davon abhängt, ist keine.
 */
function tscAusgabe() {
  const tsc = join(wurzel, 'node_modules', 'typescript', 'bin', 'tsc')
  const lauf = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.index.json', '--noEmit'], {
    cwd: wurzel,
    encoding: 'utf8',
  })
  if (lauf.error) {
    console.error(`tsc konnte nicht gestartet werden: ${lauf.error.message}`)
    process.exit(2)
  }
  return `${lauf.stdout ?? ''}${lauf.stderr ?? ''}`
}

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

const jetzt = zaehle(tscAusgabe())

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
