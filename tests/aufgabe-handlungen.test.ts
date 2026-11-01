import { describe, expect, it } from 'vitest'
import { deklarationen } from './css-quellen'

/**
 * **Unter einer bestätigten Aufgabe stehen die Knöpfe nebeneinander**
 * (1.11.2026). Der Stand („Bestätigt", „Verhindert") stand mit „Ich kann
 * nicht" in einer Zeile; am Handy des Betreibers rutschte „Tauschen" dann allein
 * in die zweite. Jetzt hat der Stand eine eigene Zeile, die Knöpfe teilen sich
 * die nächste — auf dem Start, unter „Meine Aufgaben" und im Blatt einer
 * Aufgabe, denn alle drei zeichnen dieselben Handlungen (`AufgabeHandlungen`).
 *
 * jsdom rechnet kein Layout; gesichert ist hier die Regel, gemessen wurde im
 * Browser.
 */
describe('Handlungen einer eigenen Aufgabe', () => {
  it('der Stand hat eine eigene Zeile', () => {
    expect(deklarationen('aufgaben/aufgaben.css', '.aufgabe-stand')).toMatch(/flex-basis:\s*100%/)
  })

  it('die Zeile darunter bricht um, wo die Knöpfe nicht nebeneinander passen', () => {
    // Bei großer Schrift oder langen Wörtern: lieber untereinander als hinaus.
    expect(deklarationen('aufgaben/aufgaben.css', '.aufgabe-handlungen')).toMatch(/flex-wrap:\s*wrap/)
  })
})
