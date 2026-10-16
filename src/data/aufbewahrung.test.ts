import { describe, expect, it } from 'vitest'
import { aufbewahrtAb, SONST_WOCHEN, VERTEILUNG_WOCHEN } from './aufbewahrung'

/**
 * **Die Fristen zählen ab dem Montag der laufenden Woche** (T125) — „das muss
 * nicht tagesgenau sein" (Betreiber). Jeder Tag einer Woche ergibt deshalb
 * dieselbe Grenze, und die Grenze ist immer ein Montag: So passt sie zu den
 * Kennungen der Wochen.
 */
describe('aufbewahrtAb', () => {
  it('ein Jahr und acht Wochen vor Montag, dem 7. September 2026', () => {
    const montag = new Date(2026, 8, 7, 9, 0)
    expect(aufbewahrtAb(VERTEILUNG_WOCHEN, montag)).toBe('2025-09-08')
    expect(aufbewahrtAb(SONST_WOCHEN, montag)).toBe('2026-07-13')
  })

  it('jeder Tag der Woche ergibt dieselbe Grenze — auch der Sonntag spät am Abend', () => {
    const grenzen = [7, 8, 9, 10, 11, 12, 13].map((tag) => aufbewahrtAb(SONST_WOCHEN, new Date(2026, 8, tag, 23, 30)))
    expect(new Set(grenzen)).toEqual(new Set(['2026-07-13']))
  })

  it('über den Jahreswechsel und die Zeitumstellung bleibt es ein Montag', () => {
    expect(aufbewahrtAb(SONST_WOCHEN, new Date(2027, 0, 6))).toBe('2026-11-09')
    expect(aufbewahrtAb(VERTEILUNG_WOCHEN, new Date(2026, 2, 30))).toBe('2025-03-31')
  })
})
