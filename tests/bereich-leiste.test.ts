import { describe, expect, it } from 'vitest'
import { cssDateien } from './css-quellen'

/**
 * **Die Bereiche des Predigtdienstes: groß, und bei jeder Schrift lesbar**
 * (Betreiber, 18.10.2026: „Das ist visuell etwas klein und wird leicht
 * übersehen" — den Trolley-Kalender hinter dem Reiter „Trolleys" hatte er
 * nicht gefunden).
 *
 * Die Leiste (`FsBereichTabs`) ist seitdem eine große Wahl über die ganze
 * Breite. Sie misst sich selbst (`container-type`), und ihre Schwellen stehen in
 * `em` ihrer Schrift — sie wandern mit der Schriftstufe:
 *
 *  - unter 20em untereinander, das Zeichen vor dem Namen,
 *  - dazwischen nebeneinander, das Zeichen über dem Namen,
 *  - ab 40em nebeneinander, das Zeichen vor dem Namen.
 *
 * Gemessen am 18.10.2026 im echten Chrome (mit Trennwörterbüchern) in allen
 * zwölf App-Sprachen, Ansehen und Planen, bei 320 und 375 px in allen vier
 * großen Schriftstufen, bei 768, 1024, 1180 und 1440 px mit 1 und 1,45: kein
 * Name ragt aus seinem Knopf, keiner bricht ohne Trennstrich mitten im Wort,
 * jede Fläche ist mindestens 52 px hoch. Untereinander stehen die Bereiche bei
 * 320 px immer, bei 375 px ab der Stufe 1,3.
 *
 * jsdom rechnet kein Layout. Gesichert ist hier, dass die Regeln dastehen, die
 * es im Browser richten — wie in `schmale-spalte.test.ts`.
 */

const CSS = Object.fromEntries(cssDateien())
const DATEI = 'components/components.css'

/**
 * Die Deklarationen der ersten Regel mit genau diesem Selektor — mit `nach`
 * erst ab dieser Stelle der Datei (etwa einem `@container`-Block).
 */
function deklarationen(selektor: string, nach = ''): string {
  const text = CSS[DATEI] ?? ''
  const ab = text.indexOf(nach)
  expect(ab, `„${nach}" in ${DATEI}`).toBeGreaterThanOrEqual(0)
  const zeilen = text.slice(ab).split('\n')
  const kopf = zeilen.findIndex((z) => z.trim() === `${selektor} {`)
  expect(kopf, `${selektor} in ${DATEI}`).toBeGreaterThanOrEqual(0)
  const rumpf = zeilen.slice(kopf + 1)
  return rumpf.slice(0, rumpf.findIndex((z) => z.trim() === '}')).join('\n')
}

const SCHMAL = '@container (max-width: 20em)'
const BREIT = '@container (min-width: 40em)'

describe('Die Bereiche des Predigtdienstes', () => {
  it('die Leiste misst sich selbst, und ihre Schwellen wachsen mit der Schriftstufe', () => {
    const leiste = deklarationen('.bereich-tabs')
    expect(leiste).toMatch(/container-type:\s*inline-size/)
    // Die Schwellen in `em` meinen diese Schrift — ohne `--fs` wanderten sie nicht mit.
    expect(leiste).toMatch(/font-size:\s*calc\(13\.5px \* var\(--fs\)\)/)
    expect(leiste).toMatch(/flex-wrap:\s*wrap/)
  })

  it('ist sie für die Schrift zu schmal, stehen die Bereiche untereinander, das Zeichen vor dem Namen', () => {
    const schmal = deklarationen('.bereich-tab', SCHMAL)
    expect(schmal).toMatch(/flex-basis:\s*100%/)
    expect(schmal).toMatch(/flex-direction:\s*row/)
    expect(deklarationen('.bereich-tab', BREIT)).toMatch(/flex-direction:\s*row/)
  })

  it('ein langer Name trennt, statt hinauszuragen — mitten im Wort bricht er nur zur Not', () => {
    const knopf = deklarationen('.bereich-tab')
    expect(knopf).toMatch(/\bhyphens:\s*auto/)
    expect(knopf).toMatch(/overflow-wrap:\s*anywhere/)
    // Gleich breite Knöpfe, die schmaler werden dürfen als ihr längstes Wort.
    expect(knopf).toMatch(/flex:\s*1 1 0/)
    expect(knopf).toMatch(/min-width:\s*0/)
    expect(knopf).not.toMatch(/white-space:\s*nowrap/)
  })

  it('jede Fläche bleibt groß genug zum Tippen, auch untereinander und am Desktop', () => {
    for (const rumpf of [deklarationen('.bereich-tab'), deklarationen('.bereich-tab', SCHMAL), deklarationen('.bereich-tab', BREIT)]) {
      const hoehe = /min-height:\s*(\d+)px/.exec(rumpf)
      expect(hoehe, rumpf).not.toBeNull()
      expect(Number(hoehe![1])).toBeGreaterThanOrEqual(44)
    }
  })

  it('der gewählte Bereich ist in der Textfarbe hinterlegt — er hängt an aria-pressed, das auch vorgelesen wird', () => {
    const gewaehlt = deklarationen(".bereich-tab[aria-pressed='true']")
    expect(gewaehlt).toMatch(/background:\s*var\(--text\)/)
    expect(gewaehlt).toMatch(/color:\s*var\(--grund\)/)
  })
})
