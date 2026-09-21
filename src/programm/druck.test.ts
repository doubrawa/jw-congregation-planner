/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { druckKennzeichen, monatDerWoche, monatsName, wochenDesMonats } from './druck'

/**
 * **Welche Wochen auf ein Monatsblatt gehören** (T105).
 *
 * Wochen und Monate gehen nicht auf. Die Regel: Zum Monat gehört jede Woche,
 * deren **Montag** in ihm liegt — so kommt jede Woche auf genau ein Blatt, und
 * das Oktober-Blatt beginnt nicht mit einer Woche, die schon im September hing.
 * Gerechnet wird aus `week.start`, nicht aus der Position im Bestand und nicht
 * aus der Überschrift, die in der Sprache der Versammlung steht.
 */

describe('monatDerWoche', () => {
  it('der Monat einer Woche ist der Monat ihres Montags', () => {
    expect(monatDerWoche({ start: '2026-09-14' })).toBe('2026-09')
  })

  it('eine Woche über den Monatswechsel gehört zu dem, in dem sie beginnt', () => {
    // 28. September bis 4. Oktober → September.
    expect(monatDerWoche({ start: '2026-09-28' })).toBe('2026-09')
  })

  it('ohne gültiges Datum gibt es keinen Monat — statt eines erfundenen', () => {
    expect(monatDerWoche({ start: '' })).toBeNull()
    expect(monatDerWoche({ start: '14.9.2026' })).toBeNull()
    expect(monatDerWoche(undefined)).toBeNull()
  })
})

describe('wochenDesMonats', () => {
  const bestand = [
    '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05',
  ].map((start) => ({ start }))

  it('liefert die Positionen der Wochen, deren Montag im Monat liegt — in ihrer Reihenfolge', () => {
    expect(wochenDesMonats(bestand, '2026-09')).toEqual([1, 2, 3, 4])
  })

  it('die Woche vom 31. August gehört zum August, die vom 5. Oktober zum Oktober', () => {
    expect(wochenDesMonats(bestand, '2026-08')).toEqual([0])
    expect(wochenDesMonats(bestand, '2026-10')).toEqual([5])
  })

  it('eine Lücke im Bestand bleibt eine Lücke — nichts wird nachgerechnet', () => {
    // Die Woche vom 14. fehlt (nicht importiert): Das Blatt hat dann drei
    // Wochen, und die Positionen sind die im Bestand, nicht erfundene.
    const mitLuecke = bestand.filter((w) => w.start !== '2026-09-14')
    expect(wochenDesMonats(mitLuecke, '2026-09')).toEqual([1, 2, 3])
    expect(wochenDesMonats(mitLuecke, '2026-09').map((i) => mitLuecke[i]!.start)).toEqual([
      '2026-09-07', '2026-09-21', '2026-09-28',
    ])
  })

  it('der Dezember des einen Jahres ist nicht der des nächsten', () => {
    const jahre = [{ start: '2026-12-28' }, { start: '2027-01-04' }, { start: '2027-12-27' }]
    expect(wochenDesMonats(jahre, '2026-12')).toEqual([0])
    expect(wochenDesMonats(jahre, '2027-12')).toEqual([2])
    expect(wochenDesMonats(jahre, '2027-01')).toEqual([1])
  })

  it('ein Monat ohne geladene Woche ergibt eine leere Liste', () => {
    expect(wochenDesMonats(bestand, '2027-03')).toEqual([])
    expect(wochenDesMonats([], '2026-09')).toEqual([])
  })
})

describe('monatsName', () => {
  it('nennt Monat und Jahr in der Sprache des Lesers', () => {
    expect(monatsName('2026-09', 'de')).toBe('September 2026')
    expect(monatsName('2026-09', 'en')).toBe('September 2026')
    expect(monatsName('2026-09', 'fr')).toBe('septembre 2026')
    expect(monatsName('2026-03', 'de')).toBe('März 2026')
  })

  it('auch in fremden Schriften — und ohne Absturz bei einem unbekannten Sprach-Tag', () => {
    expect(monatsName('2026-09', 'ar')).not.toContain('September')
    expect(monatsName('2026-09', 'ja')).toContain('2026')
    expect(() => monatsName('2026-09', 'xx-quatsch' as never)).not.toThrow()
  })
})

describe('druckKennzeichen: die Weiche zwischen den Ausdrucken', () => {
  afterEach(() => {
    delete document.documentElement.dataset.print
  })

  it('setzt das Kennzeichen für den Monat', () => {
    druckKennzeichen('monat')
    expect(document.documentElement.getAttribute('data-print')).toBe('monat')
  })

  it('ohne Kennzeichen druckt die Woche — auch ein fremdes wird abgeräumt', () => {
    document.documentElement.dataset.print = 's89'
    druckKennzeichen(null)
    expect(document.documentElement.hasAttribute('data-print')).toBe(false)
  })
})
