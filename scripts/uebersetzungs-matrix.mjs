/**
 * **Übersetzungs-Matrix fürs Review** — jeder seit `<basis>` neue oder geänderte
 * Schlüssel der App-Wörterbücher (samt Arbeitskopie), darunter Deutsch und alle
 * Overlays.
 *
 *   node scripts/uebersetzungs-matrix.mjs <basis> [präfix] > matrix.txt
 *
 * `<basis>` ist ein Git-Stand (`ad08902~1`, `origin/main`), `präfix` grenzt auf
 * Schlüssel ein, die so beginnen (`gb`, `oz`, `wp` …).
 *
 * Warum es das gibt (Betreiber, 5.10.2026): „die hatten schon sehr oft Fehler,
 * weil es nicht alles durchgeschaut wurde, sondern nur stichprobenartig." Die
 * Wörterbuch-Tests (`src/i18n/ui.test.ts`) prüfen Mechanik — Schlüssel,
 * Platzhalter, Schrift —, nicht Sinn, Anrede oder Fachwort. Am 5.10.2026 standen
 * in 112 neuen Schlüsseln so rund hundert falsche Werte, alle bei grünen Tests.
 * Untereinander gelesen fällt auf, wo eine Sprache aus der Reihe tanzt.
 *
 * Worauf beim Lesen achten:
 *  - **Anrede** wie im übrigen Wörterbuch der Sprache (`duMarker`,
 *    `nameDoppelt`): förmlich sind el, fa, id, ru, uk, ur, ja, ko.
 *  - **Genus**, wo Schwestern gemeint sein können (Zeugnisgeben, freie Plätze).
 *  - **Zitierte Knöpfe** in Hinweisen gegen den echten Schlüssel
 *    (`„Plan senden"` ↔ `planSenden`).
 *  - **Dasselbe Fachwort** für dieselbe Sache (`privZeugnis`, `tabFs` …).
 *  - **Bedeutungswandel** alter Schlüssel, die mitgemeint sind, ohne geändert
 *    zu sein — `tabFs` war bis T120 der Treffpunkt-Reiter, seitdem Titel des
 *    ganzen Predigtdienstes.
 *
 * Liest nur. Die Overlays stehen eine Zeile je Paar (`"schlüssel": "wert",`),
 * `de.ts` mehrere Paare je Zeile in einfachen Anführungszeichen.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { alsSkript } from './gemeinsam.mjs'

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OVERLAYS = 'src/i18n/overlays'

const ZEILE = /^\s*"([^"]+)":\s*("(?:[^"\\]|\\.)*"),?\s*$/

/** Die Paare eines Overlays (`"schlüssel": "wert"` je Zeile). */
export function overlayPaare(text) {
  const out = new Map()
  for (const zeile of text.split('\n')) {
    const m = ZEILE.exec(zeile)
    if (m) out.set(m[1], JSON.parse(m[2]))
  }
  return out
}

/** Die Paare von `de.ts` — mehrere je Zeile, Werte in einfachen Anführungszeichen. */
export function dePaare(text) {
  const out = new Map()
  for (const m of text.matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)) out.set(m[1], m[2])
  return out
}

/** Die Schlüssel, deren Zeile ein Diff hinzufügt — neu oder geändert. */
export function geaenderteSchluessel(diff) {
  const out = new Set()
  for (const zeile of diff.split('\n')) {
    if (!zeile.startsWith('+') || zeile.startsWith('+++')) continue
    const m = ZEILE.exec(zeile.slice(1))
    if (m) out.add(m[1])
  }
  return out
}

/** Die Matrix als Text: je Schlüssel ein Block mit `de:` und je Sprache eine Zeile. */
export function matrixText(schluessel, de, overlays) {
  let out = ''
  for (const key of [...schluessel].sort()) {
    out += `\n### ${key}\nde: ${de.get(key) ?? '(fehlt in de.ts)'}\n`
    for (const [lang, paare] of overlays) out += `${lang}: ${paare.get(key) ?? '(FEHLT)'}\n`
  }
  return `${out}\n${schluessel.size} Schlüssel, ${overlays.size} Sprachen\n`
}

export async function main(argv = process.argv.slice(2)) {
  const [basis, praefix = ''] = argv
  if (!basis) {
    console.error('Aufruf: node scripts/uebersetzungs-matrix.mjs <basis> [präfix]')
    process.exitCode = 2
    return
  }
  const sprachen = fs
    .readdirSync(path.join(wurzel, OVERLAYS))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.slice(0, -3))
    .sort()
  const schluessel = new Set()
  for (const lang of sprachen) {
    // Gegen die Arbeitskopie, nicht gegen HEAD: Geprüft wird meist vor dem Commit.
    const diff = execFileSync('git', ['diff', basis, '--', `${OVERLAYS}/${lang}.ts`], {
      cwd: wurzel,
      encoding: 'utf8',
    })
    for (const key of geaenderteSchluessel(diff)) if (key.startsWith(praefix)) schluessel.add(key)
  }
  const overlays = new Map(
    sprachen.map((lang) => [lang, overlayPaare(fs.readFileSync(path.join(wurzel, OVERLAYS, `${lang}.ts`), 'utf8'))]),
  )
  const de = dePaare(fs.readFileSync(path.join(wurzel, 'src/i18n/de.ts'), 'utf8'))
  process.stdout.write(matrixText(schluessel, de, overlays))
}

alsSkript(import.meta.url, main)
