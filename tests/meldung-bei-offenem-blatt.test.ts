import { describe, expect, it } from 'vitest'
import { deklarationen } from './css-quellen'

/**
 * **Bei offenem Blatt steht die Meldung oben.** Unten läge sie über dem Fuß
 * des Blatts: Nach „Bestätigen" im Blatt beim Öffnen deckte sie am Handy
 * (375 × 812) „Später" zu — die Meldung von 724 bis 784 px, der Knopf von 744
 * bis 792 —, und das zehn Sekunden lang, denn sie trägt „Rückgängig". Wer
 * gleich „Später" tippen wollte, nahm stattdessen die Zusage zurück.
 *
 * Oben ist Platz: Ein Blatt reicht höchstens bis 88 % der Höhe. Die Regel muss
 * auch die der Leiste beim Planen schlagen, die die Meldung über die Leiste
 * hebt (`planen-leiste.test.ts`) — ein Blatt liegt dort ebenfalls darüber.
 *
 * jsdom rechnet kein Layout. Gesichert ist hier, dass die Regeln dastehen;
 * gemessen ist es im Browser.
 */

const DATEI = 'app/shell.css'
const BEI_BLATT = "body:has([role='dialog'][aria-modal='true']) .toast"

describe('Die Meldung bei offenem Blatt', () => {
  it('steht oben und gibt den unteren Rand frei', () => {
    const regel = deklarationen(DATEI, BEI_BLATT)
    expect(regel).toMatch(/top:\s*max\(\d+px, env\(safe-area-inset-top\)\)/)
    expect(regel).toMatch(/bottom:\s*auto/)
  })

  it('wiegt mehr als die Regel der Leiste beim Planen — zwei Attribute im :has() gegen eine Klasse', () => {
    // Bei gleichem Gewicht entschiede die Reihenfolge der Dateien, und die der
    // Leiste lädt später: Die Meldung stünde wieder unten über dem Blatt.
    expect(BEI_BLATT).toMatch(/:has\(\[[^\]]+\]\[[^\]]+\]\)/)
    expect(deklarationen('planen/planen.css', 'body:has(.planen-leiste) .toast')).toMatch(/bottom:/)
  })

  it('Gegenprobe: ohne Blatt bleibt sie unten', () => {
    expect(deklarationen(DATEI, '.toast')).toMatch(/bottom:\s*max\(28px, env\(safe-area-inset-bottom\)\)/)
  })
})
