import { describe, expect, it } from 'vitest'
import { relativeDayLabel, relativeWeekLabel } from './relative-time'

// Fester „Jetzt"-Zeitpunkt, damit die Tage-Differenz deterministisch ist.
const NOW = Date.parse('2026-09-07') // Montag, 00:00 UTC
const day = 864e5

describe('relativeDayLabel', () => {
  it('formatiert künftige Tage in der App-Sprache', () => {
    expect(relativeDayLabel(NOW + 4 * day, 'de', NOW)).toBe('in 4 Tagen')
    expect(relativeDayLabel(NOW + 4 * day, 'en', NOW)).toBe('in 4 days')
  })

  it('nutzt "morgen"/"heute" statt "in 1 Tagen" (numeric: auto, korrekt)', () => {
    expect(relativeDayLabel(NOW + 1 * day, 'de', NOW)).toBe('morgen')
    expect(relativeDayLabel(NOW, 'de', NOW)).toBe('heute')
    expect(relativeDayLabel(NOW + 1 * day, 'en', NOW)).toBe('tomorrow')
  })

  it('zählt ganze Kalendertage, unabhängig von der Uhrzeit', () => {
    // "Jetzt" mittags, Ziel am nächsten Kalendertag früh → trotzdem "morgen".
    const noon = Date.parse('2026-09-07T12:00:00Z')
    const nextMorning = Date.parse('2026-09-08T06:00:00Z')
    expect(relativeDayLabel(nextMorning, 'de', noon)).toBe('morgen')
  })

  it('vergangene Aufgaben → "vor N Tagen"', () => {
    expect(relativeDayLabel(NOW - 3 * day, 'de', NOW)).toBe('vor 3 Tagen')
  })

  it('kein Zeitpunkt → leerer Chip', () => {
    expect(relativeDayLabel(null, 'de', NOW)).toBe('')
    expect(relativeDayLabel(undefined, 'de', NOW)).toBe('')
  })
})

describe('relativeWeekLabel', () => {
  it('formatiert den Wochenversatz in der App-Sprache', () => {
    expect(relativeWeekLabel(0, 'de')).toBe('diese Woche')
    expect(relativeWeekLabel(1, 'de')).toBe('nächste Woche')
    expect(relativeWeekLabel(-1, 'de')).toBe('letzte Woche')
    expect(relativeWeekLabel(2, 'de')).toBe('in 2 Wochen')
    expect(relativeWeekLabel(-2, 'de')).toBe('vor 2 Wochen')
  })

  it('nutzt die jeweilige Locale', () => {
    expect(relativeWeekLabel(1, 'en')).toBe('next week')
    expect(relativeWeekLabel(-2, 'en')).toBe('2 weeks ago')
  })
})

/**
 * **Ein Sprach-Tag, das die Laufzeitumgebung nicht kennt.**
 *
 * `Intl.RelativeTimeFormat` wirft dann — und der Wurf entstünde mitten im
 * Rendern des Dashboards bzw. der Aufgabenliste, also dort, wo die App
 * anschließend weiß bleibt. Beide Funktionen fangen ihn deshalb ab und liefern
 * lieber gar keinen Chip als einen kaputten. Geprüft mit einem Tag, das kein
 * gültiges BCP-47 ist; die 34 echten App-Sprachen laufen darüber hinweg.
 */
describe('Unbekannte Sprache: lieber kein Chip als ein Absturz', () => {
  const kaputt = 'x' as never

  it('relativeDayLabel bleibt leer, statt zu werfen', () => {
    expect(() => relativeDayLabel(NOW + day, kaputt, NOW)).not.toThrow()
    expect(relativeDayLabel(NOW + day, kaputt, NOW)).toBe('')
  })

  it('relativeWeekLabel ebenso', () => {
    expect(() => relativeWeekLabel(1, kaputt)).not.toThrow()
    expect(relativeWeekLabel(1, kaputt)).toBe('')
  })

  it('die echten App-Sprachen liefern sehr wohl etwas — sonst prüfte das hier nichts', () => {
    expect(relativeDayLabel(NOW + day, 'de', NOW)).not.toBe('')
    expect(relativeWeekLabel(1, 'de')).not.toBe('')
  })
})
