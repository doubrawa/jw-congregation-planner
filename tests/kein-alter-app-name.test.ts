import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * **Die App heißt „Versammlung.app" — auch außerhalb der Wörterbücher**
 * (T115).
 *
 * Den Namen trägt die App an zwei Sorten Ort: in den Übersetzungen, wo ihn
 * `src/i18n/produktname.test.ts` in allen 34 Sprachen einfordert — und in den
 * paar Dateien, die keine Sprache kennen: Seitentitel, Manifest, der Name auf
 * dem Startbildschirm eines installierten Geräts. Die stehen je einmal da und
 * werden bei einer Umbenennung genauso leicht übersehen.
 *
 * **Zwei Richtungen, und die eine reicht nicht.** Die Suche nach dem alten
 * Namen unten hätte den Befund, aus dem T115 entstand, *nicht* gefunden:
 * Persisch, Hebräisch und Urdu hatten „Congregation Planner" seinerzeit
 * übersetzt statt stehen gelassen, und die Umbenennung vom 20.9.2026 ersetzte
 * nur die lateinische Zeichenkette. Wer nach dem alten Namen sucht, findet nur
 * die Stellen, die ihn buchstabieren. Deshalb steht daneben die positive
 * Frage: Nennen die namenstragenden Dateien die App überhaupt beim Namen?
 *
 * Dieselbe Bauart wie `kein-anzeigename.test.ts` (T110) — vom Bestand her
 * gedacht statt von der Funktion, weil die häufigste Fehlerart hier die
 * zentral richtiggestellte Regel mit der vergessenen Kopie ist.
 */

/** Der Name, unter dem die App auftritt. */
const NAME = 'Versammlung.app'

/** Der Name davor — lateinisch, bis zum 20. September 2026. */
const ALTER_NAME = 'Congregation Planner'

const WURZEL = fileURLToPath(new URL('../', import.meta.url))

/**
 * Verzeichnisse mit Quelltext, dazu die Seite selbst.
 *
 * `docs/` bleibt draußen: Dort erzählt die Aufgabenliste die Geschichte der
 * Umbenennung und muss den alten Namen nennen dürfen.
 */
const ORTE = ['src', 'supabase', 'scripts', 'tests', 'public']
const EINZELN = ['index.html']

const ENDUNGEN = ['.ts', '.tsx', '.js', '.mjs', '.sql', '.html', '.webmanifest']

/** Jede Quelldatei unter `ORTE`, rekursiv. */
function quelldateien(): string[] {
  const out: string[] = [...EINZELN]
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

describe('Der alte App-Name kommt nicht wieder (T115)', () => {
  const dateien = quelldateien()

  it('findet überhaupt Quelldateien — sonst prüft die Probe nichts', () => {
    // Ohne diese Zusicherung wäre ein verrutschter Pfad eine grüne Prüfung
    // über null Dateien.
    expect(dateien.length).toBeGreaterThan(200)
  })

  it(`nirgends „${ALTER_NAME}"`, () => {
    const treffer: string[] = []
    for (const datei of dateien) {
      // Diese Datei selbst trägt ihn naturgemäß.
      if (datei.endsWith('kein-alter-app-name.test.ts')) continue
      const text = readFileSync(join(WURZEL, datei), 'utf8')
      for (const [i, zeile] of text.split('\n').entries()) {
        // Ein Kommentar darf die Geschichte erzählen; geprüft wird Code —
        // dieselbe Grenze wie in `kein-anzeigename.test.ts`.
        const ohneKommentar = zeile.replace(/^\s*(\*|\/\/|--).*/, '')
        if (ohneKommentar.includes(ALTER_NAME)) treffer.push(`${datei}:${i + 1}: ${zeile.trim()}`)
      }
    }
    expect(treffer, `die App heißt seit dem 20.9.2026 „${NAME}"`).toEqual([])
  })
})

/**
 * Die sprachlosen Stellen. Jede steht genau einmal da; eine vergessene
 * bedeutet, dass die App auf dem Startbildschirm oder im Browser-Tab noch
 * anders heißt als überall sonst.
 */
const NAMENSTRAEGER = ['index.html', 'public/manifest.webmanifest']

describe('Der Name steht auch dort, wo keine Sprache ihn übersetzt', () => {
  it.each(NAMENSTRAEGER)('%s nennt die App beim Namen', (datei) => {
    expect(readFileSync(join(WURZEL, datei), 'utf8')).toContain(NAME)
  })
})
