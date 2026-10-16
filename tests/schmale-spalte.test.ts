import { describe, expect, it } from 'vitest'
import { cssDateien } from './css-quellen'

/**
 * **In der schmalen Wochenspalte bricht nichts mitten im Wort und läuft nichts
 * unter etwas anderes** (Betreiber, 16.10.2026; Befunde A und B der
 * Fehlersuche). Gemessen im Browser bei 1440 px, in acht Sprachen bei
 * Schriftstufe 1.45:
 *
 *  - Die Spur einer Wochenkarte brach in der 260 px breiten Spalte ihre
 *    Schrittnamen mitten im Wort. Jetzt nur die Punkte, darunter der laufende
 *    Schritt (`Spur`, Form `punkte`) — die Unterschrift braucht dafür eine
 *    eigene Zeile, und die bekommt sie nur, wenn die Schritte nicht auf null
 *    schrumpfen dürfen.
 *  - Die Unterzeile einer Karte lief unter die Lage („Следующая неделя" unter
 *    „Проблем: 3"): Das Raster zwang beide nebeneinander.
 *  - Der Kopf des Plans schnitt „Автоматически" ab: Er brach nicht um.
 *
 * jsdom rechnet kein Layout. Gesichert ist hier, dass die Regeln dastehen, die
 * es im Browser richten.
 */

const CSS = Object.fromEntries(cssDateien())

/**
 * Die Deklarationen der ersten Regel mit genau diesem Selektor — mit `nach`
 * erst ab dieser Stelle der Datei (etwa einem `@media`-Block).
 */
function deklarationen(datei: string, selektor: string, nach = ''): string {
  const text = CSS[datei] ?? ''
  const ab = text.indexOf(nach)
  expect(ab, `„${nach}" in ${datei}`).toBeGreaterThanOrEqual(0)
  const zeilen = text.slice(ab).split('\n')
  const kopf = zeilen.findIndex((z) => z.trim() === `${selektor} {`)
  expect(kopf, `${selektor} in ${datei}`).toBeGreaterThanOrEqual(0)
  const rumpf = zeilen.slice(kopf + 1)
  return rumpf.slice(0, rumpf.findIndex((z) => z.trim() === '}')).join('\n')
}

describe('Die Wochenspalte am Desktop', () => {
  it('die Spur in Punkten: die Unterschrift in eigener Zeile, die Schritte nicht auf null', () => {
    expect(deklarationen('bausteine/bausteine.css', '.spur--punkte')).toMatch(/flex-wrap:\s*wrap/)
    expect(deklarationen('bausteine/bausteine.css', '.spur--punkte .spur-schritt')).toMatch(/min-width:\s*[1-9]/)
    expect(deklarationen('bausteine/bausteine.css', '.spur-unterschrift')).toMatch(/flex:\s*0 0 100%/)
  })

  it('Unterzeile und Lage einer Karte brechen um, statt sich zu überlagern', () => {
    const karte = deklarationen('planen/planen.css', '.wochen-spalte .wochen-karte')
    expect(karte).toMatch(/flex-flow:\s*row wrap/)
    expect(karte).not.toMatch(/grid-template/)
  })
})

describe('Der Kopf des Plans ab dem Tablet', () => {
  it('bricht um, statt das Angebot neben der Woche abzuschneiden', () => {
    expect(deklarationen('components/components.css', '.wochenwahl', '@media (min-width: 768px)')).toMatch(/flex-wrap:\s*wrap/)
  })
})
