/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abgelehnteLesen, abgelehnteMerken, gesuchKennung } from './abgelehnte-gesuche'

/**
 * **„Nein, danke" auf ein Ersatzgesuch merkt sich das Gerät** (1.11.2026).
 * Was der Reducer damit macht, prüft `reducer.test.ts`; hier geht es um die
 * Kennung und den Speicher.
 */

const SPEICHER = 'abgelehnteGesuche'
const gesuch = { key: '2026-11-09|we|helper|ton|0', declinedBy: 'Max Platzhalter' }
/** Ein Tag als UTC-Mitternacht, wie `at` ihn trägt. */
const tag = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('gesuchKennung', () => {
  it('unterscheidet Person, Platz und den, der abgesagt hat', () => {
    const grund = gesuchKennung('p1', gesuch)
    expect(gesuchKennung('p1', { ...gesuch })).toBe(grund)
    expect(gesuchKennung('p2', gesuch)).not.toBe(grund)
    expect(gesuchKennung('p1', { ...gesuch, key: '2026-11-09|we|helper|ton|1' })).not.toBe(grund)
    expect(gesuchKennung('p1', { ...gesuch, declinedBy: 'Erika Muster' })).not.toBe(grund)
  })

  it('kein Trennzeichen kann zwei Gesuche verwechseln', () => {
    // Mit einem schlichten `a|b|c` wären diese beiden dieselbe Kennung.
    expect(gesuchKennung('p1|x', { key: 'k', declinedBy: 'n' })).not.toBe(gesuchKennung('p1', { key: 'x|k', declinedBy: 'n' }))
  })
})

describe('Speicher', () => {
  it('was gemerkt wurde, liest der nächste Start wieder', () => {
    const abgelehnt = { [gesuchKennung('p1', gesuch)]: tag('2026-11-15') }
    abgelehnteMerken(abgelehnt)
    expect(abgelehnteLesen(new Date('2026-11-01T10:00:00Z'))).toEqual(abgelehnt)
  })

  it('ein zweites Fenster der App löscht nicht, was das erste abgelehnt hat (Review 1.11.2026)', () => {
    // Jedes Fenster hat seinen eigenen Zustand; das zweite kennt die Ablehnung des ersten nicht.
    const erstes = { [gesuchKennung('p1', gesuch)]: tag('2099-01-11') }
    const zweites = { [gesuchKennung('p1', { ...gesuch, key: '2099-01-05|we|helper|ton|1' })]: tag('2099-01-11') }
    abgelehnteMerken(erstes)
    abgelehnteMerken(zweites)
    expect(abgelehnteLesen()).toEqual({ ...erstes, ...zweites })
  })

  it('vergangene Termine fallen beim Lesen heraus — der Speicher wächst nicht', () => {
    abgelehnteMerken({ vorbei: tag('2026-10-31'), heute: tag('2026-11-01'), spaeter: tag('2026-11-15'), ohneTermin: null })
    expect(abgelehnteLesen(new Date(2026, 10, 1, 10))).toEqual({
      heute: tag('2026-11-01'),
      spaeter: tag('2026-11-15'),
      ohneTermin: null,
    })
  })

  it('Unlesbares im Speicher ergibt eine leere Liste statt eines Absturzes', () => {
    for (const roh of ['{kaputt', '[1,2]', 'null', '"text"']) {
      localStorage.setItem(SPEICHER, roh)
      expect(abgelehnteLesen(), roh).toEqual({})
    }
    localStorage.setItem(SPEICHER, JSON.stringify({ gut: tag('2099-01-01'), schlecht: 'morgen' }))
    expect(abgelehnteLesen()).toEqual({ gut: tag('2099-01-01') })
  })

  it('ohne Speicher (privates Fenster) geht nichts kaputt', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('voll')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    expect(() => abgelehnteMerken({ a: 1 })).not.toThrow()
    expect(abgelehnteLesen()).toEqual({})
  })
})
