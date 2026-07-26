import { describe, expect, it } from 'vitest'
import { relativeDayLabel } from './relative-time'

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
