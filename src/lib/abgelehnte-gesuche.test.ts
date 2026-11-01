import { describe, expect, it } from 'vitest'
import { gesuchKennung } from './abgelehnte-gesuche'

/**
 * **„Nein, danke" auf ein Ersatzgesuch** (1.11.2026): die Kennung, unter der
 * das Konto es sich merkt. Was der Reducer damit macht, prüft
 * `reducer.test.ts`; Laden und Schreiben `data-load.test.ts` und
 * `data-save.test.ts`.
 */

const gesuch = { key: '2026-11-09|we|helper|ton|0', declinedBy: 'Max Platzhalter' }

describe('gesuchKennung', () => {
  it('unterscheidet Platz und den, der abgesagt hat', () => {
    const grund = gesuchKennung(gesuch)
    expect(gesuchKennung({ ...gesuch })).toBe(grund)
    expect(gesuchKennung({ ...gesuch, key: '2026-11-09|we|helper|ton|1' })).not.toBe(grund)
    expect(gesuchKennung({ ...gesuch, declinedBy: 'Erika Muster' })).not.toBe(grund)
  })

  it('kein Trennzeichen kann zwei Gesuche verwechseln', () => {
    // Mit einem schlichten `a|b` wären diese beiden dieselbe Kennung.
    expect(gesuchKennung({ key: 'k|x', declinedBy: 'n' })).not.toBe(gesuchKennung({ key: 'k', declinedBy: 'x|n' }))
  })
})
