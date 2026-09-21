import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Der Anzeigename ist weg — überall** (T110).
 *
 * `Person.dn` überschrieb „Vorname Nachname" und war nötig, solange zwei
 * Personen gleich heißen konnten. Seit Vor- und Nachname je Versammlung
 * eindeutig sind (`persons_name_eindeutig`), gibt es das Feld nicht mehr.
 *
 * **Warum eine eigene Probe, wo doch der Typ es schon verbietet.** Der
 * Compiler deckt `src/` und die Edge Functions ab — aber nicht die Stellen,
 * an denen die Spalte als **Text** vorkommt, und genau dort saß sie:
 *
 *  - in den REST-Abfragen (`persons?select=id,fn,ln,dn`): ein Tippfehler in
 *    einer Zeichenkette, den niemand übersetzt. Eine Abfrage nach einer
 *    Spalte, die es nicht mehr gibt, beantwortet PostgREST mit 400 — der
 *    ganze Aufruf scheitert, nicht nur das Feld.
 *  - in den Wartungsskripten (`scripts/*.mjs`): JavaScript ohne Typen, dort
 *    ist `p.dn` still `undefined`.
 *  - in `schema.sql`: die Spalte selbst.
 *
 * Drei Sorten Stelle, eine Regel. Diese Probe ist damit vom selben Schlag wie
 * `alle-plaetze.test.ts` und `klassennamen.test.ts`: von den Daten her
 * gedacht, nicht von der Funktion — die häufigste Fehlerart hier ist die
 * zentral richtiggestellte Regel mit dem vergessenen Aufrufer.
 */

const WURZEL = fileURLToPath(new URL('../', import.meta.url))

/** Verzeichnisse, die überhaupt Quelltext enthalten. */
const ORTE = ['src', 'supabase', 'scripts', 'tests']

const ENDUNGEN = ['.ts', '.tsx', '.mjs', '.sql']

/** Jede Quelldatei unter `ORTE`, rekursiv. */
function quelldateien(): string[] {
  const out: string[] = []
  const gehe = (rel: string): void => {
    for (const eintrag of readdirSync(join(WURZEL, rel))) {
      if (eintrag === 'node_modules') continue
      const pfad = `${rel}/${eintrag}`
      if (statSync(join(WURZEL, pfad)).isDirectory()) gehe(pfad)
      else if (ENDUNGEN.some((e) => eintrag.endsWith(e))) out.push(pfad)
    }
  }
  for (const ort of ORTE) gehe(ort)
  return out
}

/**
 * Wie `dn` als Feld oder Spalte aussähe — nicht als Silbe in einem Wort.
 *
 * `\b` allein reicht nicht: Tschechisch schreibt „žádná", und in einer
 * UTF-8-Datei gilt das Wortende vor einem Akzentbuchstaben. Deshalb je Form
 * ein eigenes Muster mit dem Zeichen davor und danach.
 */
const MUSTER: Array<[string, RegExp]> = [
  ['als Eigenschaft gelesen (`x.dn`)', /\.dn\b(?![a-zA-Z0-9_])/],
  ['als Feld gesetzt (`dn:`)', /(^|[\s{(,])dn\s*:/m],
  ['in einer REST-Spaltenliste (`select=…,dn`)', /select=[\w,]*\bdn\b/],
  ['als Spalte im Schema', /^\s*dn\s+text/m],
]

describe('Kein Anzeigename mehr (T110)', () => {
  const dateien = quelldateien()

  it('findet überhaupt Quelldateien — sonst prüft die Probe nichts', () => {
    // Ohne diese Zusicherung wäre ein verrutschter Pfad eine grüne Prüfung
    // über null Dateien.
    expect(dateien.length).toBeGreaterThan(200)
  })

  it.each(MUSTER)('nirgends %s', (_beschreibung, muster) => {
    const treffer: string[] = []
    for (const datei of dateien) {
      // Diese Datei selbst trägt die Muster naturgemäß.
      if (datei.endsWith('kein-anzeigename.test.ts')) continue
      const text = readFileSync(join(WURZEL, datei), 'utf8')
      for (const [i, zeile] of text.split('\n').entries()) {
        // Ein Kommentar darf die Geschichte erzählen; geprüft wird Code.
        const ohneKommentar = zeile.replace(/^\s*(\*|\/\/|--).*/, '')
        if (muster.test(ohneKommentar)) treffer.push(`${datei}:${i + 1}: ${zeile.trim()}`)
      }
    }
    expect(treffer, 'Der Anzeigename ist mit T110 entfallen').toEqual([])
  })
})
