import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { quelldateien, WURZEL } from './quelldateien'

/**
 * **Ein Datum mit Monatsnamen kommt aus `datum-anzeige.ts`** (T128).
 *
 * Dort steht jedes Format einmal gebaut, und `gebundenesDatum` und
 * `tageSpanne` binden Zahl und Wort („7. Oktober", „5 окт. 2026 г."). Wer
 * selbst formatiert — `datumsFormat(lang, 'tag').format(…)` oder ein eigenes
 * `Intl.DateTimeFormat` —, geht daran vorbei: So brachen bei 320 px
 * „5 окт. 2026 |г." in den Weiteren Plänen und „воскресенье, 20 |сентября" in
 * der Zeitleiste einer Person. Formate nur aus Zahlen und Wochentag („Di.,
 * 8.9.") bleiben frei.
 *
 * Gelesen über `node:fs`, wie die übrigen Quelltext-Proben unter `tests/`.
 */

const ANZEIGE = 'src/components/datum-anzeige.ts'
const lies = (pfad: string): string => readFileSync(join(WURZEL, pfad), 'utf8')

/** Die Formate aus `datum-anzeige.ts`, die einen Monat in Worten schreiben (`month: 'long'` oder `'short'`). */
function monatsFormate(): string[] {
  return [...lies(ANZEIGE).matchAll(/^\s*(\w+): \{[^}]*month: '(?:long|short)'/gm)].map((m) => m[1] ?? '')
}

/** Optionen mit einem Monat in Worten. */
const MONAT_IN_WORTEN = /month: '(?:long|short)'/

describe('Ein Datum mit Monatsnamen formt nur datum-anzeige.ts', () => {
  const formate = monatsFormate()
  const dateien = quelldateien({ orte: ['src'], endungen: ['.ts', '.tsx'], ohneTests: true })
    .filter((pfad) => pfad !== ANZEIGE)
    .map((pfad) => [pfad, lies(pfad)] as const)

  it('die Probe kennt die Formate — sonst prüfte sie nichts', () => {
    expect(formate).toEqual(expect.arrayContaining(['tag', 'kurzerWochentag', 'tagMonatJahr', 'tagKurzJahr', 'monatJahr']))
    // Zahlen und Wochentag allein sind frei.
    expect(formate).not.toContain('tagZahl')
    expect(formate).not.toContain('wochentagZahl')
  })

  it('niemand ruft ein solches Format selbst auf — `gebundenesDatum` oder `tageSpanne` binden', () => {
    const treffer = dateien.flatMap(([pfad, text]) =>
      [...text.matchAll(/datumsFormat\([^,()]+,\s*'(\w+)'\)/g)]
        .filter((m) => formate.includes(m[1] ?? ''))
        .map((m) => `${pfad}: ${m[0]}`),
    )
    expect(treffer).toEqual([])
  })

  it('kein eigenes Intl.DateTimeFormat und kein toLocaleDateString mit Monatsnamen', () => {
    const treffer = dateien.flatMap(([pfad, text]) =>
      [...text.matchAll(/(?:new Intl\.DateTimeFormat|\.toLocale(?:Date)?String)\(([^)]*)\)/g)]
        .filter((m) => MONAT_IN_WORTEN.test(m[1] ?? ''))
        .map((m) => `${pfad}: ${m[0].slice(0, 80)}`),
    )
    expect(treffer).toEqual([])
  })
})
