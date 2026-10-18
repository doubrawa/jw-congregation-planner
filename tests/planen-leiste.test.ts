import { describe, expect, it } from 'vitest'
import { cssDateien } from './css-quellen'

/**
 * **Die Leiste beim Planen am Handy: nebeneinander, solange es passt — sonst
 * untereinander** (Fund vom 18.10.2026, gemessen im echten Chrome).
 *
 * Unten steht beim Planen „Automatisch" und „Plan senden" (`PlanenAktionen`),
 * beim Bearbeiten eines Plans „Drucken" und „Veröffentlichen"
 * (`PlanBearbeiten`). Bis dahin teilte ein Raster die Breite fest 1 : 1,1.
 * Fasste die Hälfte das längste Wort nicht — „Автоматически", „Automatycznie",
 * „Veröffentlichen", auf 320 px schon „Automatisch" ab Schriftstufe 1,15 —, lief
 * der zentrierte Inhalt zu beiden Seiten über: das Zeichen links aus dem Knopf,
 * bei 320 px über den Rand des Bildes, das Wort rechts unter den Nachbarn, der
 * es abschnitt. Betroffen waren 89 von 480 Lagen (320 und 375 px, Stufe 1 bis
 * 1,45), in zehn der zwölf Sprachen, schon bei Stufe 1.
 *
 * Jetzt eine Reihe, die umbricht: Jeder Knopf wächst von null aus, der zweite
 * etwas stärker, aber keiner wird schmaler als sein längstes Wort. Passen beide
 * so nicht nebeneinander, rutscht der zweite unter den ersten, und jeder nimmt
 * die ganze Breite — „was nicht mehr nebeneinander passt, steht untereinander"
 * (Entwurf, große Schrift). Die Leiste ist dann doppelt so hoch; die Meldung
 * darüber hängt deshalb an ihrer Oberkante statt an einer festen Höhe.
 *
 * Gemessen am 18.10.2026 im echten Chrome 155 (mit Trennwörterbüchern) in allen
 * zwölf App-Sprachen bei 320, 360, 375 und 412 px und den Stufen 1 bis 1,45, je
 * mit „Plan senden" samt Zahl, ohne Zahl, „Automatisch" allein, und beim Plan
 * als Entwurf und veröffentlicht — 960 Lagen, dazu 48 bei 600 px: nichts ragt
 * aus Knopf oder Leiste, kein Wort bricht. Die Meldung nach „Automatisch" stand
 * in 24 Lagen (de, ru, fr, ar; 320 bis 412 px; Stufe 1 und 1,45) 20 px über der
 * Leiste.
 *
 * jsdom rechnet kein Layout. Gesichert ist hier, dass die Regeln dastehen, die
 * es im Browser richten — wie in `bereich-leiste.test.ts`.
 */

const CSS = Object.fromEntries(cssDateien())
const DATEI = 'planen/planen.css'

/**
 * Die Deklarationen der ersten Regel mit genau diesem Selektor — mit `nach`
 * erst ab dieser Stelle der Datei (etwa einem `@supports`-Block).
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

const LEISTE = '.planen-leiste'
/** Die Knöpfe in der Leiste — die Regel steht für beide Rollen, gefunden wird sie an der letzten Zeile. */
const KNOPF = '.planen-leiste > .aktion-haupt'
const ANKER = '@supports (anchor-name: --planen-leiste)'

describe('Die Leiste beim Planen am Handy', () => {
  it('die Knöpfe stehen in einer Reihe, die umbricht — nicht in festen Spalten', () => {
    const leiste = deklarationen(LEISTE)
    expect(leiste).toMatch(/display:\s*flex/)
    expect(leiste).toMatch(/flex-wrap:\s*wrap/)
    // Feste Spalten ließen ein langes Wort aus dem Knopf ragen, statt umzubrechen.
    expect(leiste).not.toMatch(/grid-template-columns/)
  })

  it('jeder Knopf wächst von null aus, wird aber nie schmaler als sein längstes Wort', () => {
    const knopf = deklarationen(KNOPF)
    expect(knopf).toMatch(/flex:\s*1 1 0/)
    // Die Mindestbreite bleibt `auto`, also das längste Wort: Erst daran merkt
    // die Reihe, dass sie umbrechen muss. Mit 0 schrumpfte der Knopf darunter.
    expect(knopf).not.toMatch(/min-width/)
    expect(knopf).not.toMatch(/overflow:\s*hidden/)
  })

  it('der zweite Knopf ist etwas breiter, wie gezeichnet', () => {
    expect(deklarationen(`${LEISTE} > :nth-child(2)`)).toMatch(/flex-grow:\s*1\.1\b/)
  })

  it('ein Wort bricht in der Leiste nie, und nichts wird abgeschnitten', () => {
    // Chrome rechnet Trennstellen und `overflow-wrap: anywhere` in die
    // Mindestbreite ein: Die Knöpfe rutschten dann nie untereinander, sondern
    // brächen ihr Wort mitten durch („Автомати-чески").
    for (const rumpf of [deklarationen(LEISTE), deklarationen(KNOPF), deklarationen('.aktion-haupt')]) {
      expect(rumpf).not.toMatch(/hyphens:\s*auto/)
      expect(rumpf).not.toMatch(/overflow-wrap|word-break/)
      // Untereinander ist die ganze Breite da; ein Text in einer Zeile ragte darüber hinaus.
      expect(rumpf).not.toMatch(/white-space:\s*nowrap|text-overflow/)
    }
  })

  it('die Flächen bleiben groß genug zum Tippen, auch untereinander', () => {
    const hoehe = /min-height:\s*(\d+)px/.exec(deklarationen(KNOPF))
    expect(hoehe).not.toBeNull()
    expect(Number(hoehe![1])).toBeGreaterThanOrEqual(48)
  })

  it('eine Meldung steht über der Leiste — an ihrer Oberkante, wie hoch die Leiste auch ist', () => {
    expect(deklarationen(LEISTE)).toMatch(/anchor-name:\s*--planen-leiste/)
    const meldung = deklarationen('body:has(.planen-leiste) .toast', ANKER)
    expect(meldung).toMatch(/position-anchor:\s*--planen-leiste/)
    expect(meldung).toMatch(/bottom:\s*calc\(anchor\(top\b/)
    // Wo der Browser keine Anker kennt, steht sie über der einzeiligen Leiste.
    expect(deklarationen('body:has(.planen-leiste) .toast')).toMatch(/bottom:\s*calc\(.*\+ 86px\)/)
  })
})
