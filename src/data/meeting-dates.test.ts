import { describe, expect, it } from 'vitest'
import { meetingDateMs, meetingDayOffsets } from './meeting-dates'

describe('meetingDayOffsets', () => {
  it('liest beide Wochentage aus "Di 19:00 · So 10:00"', () => {
    expect(meetingDayOffsets('Di 19:00 · So 10:00')).toEqual({ mid: 1, we: 6 })
  })

  it('nimmt andere Wochentage', () => {
    expect(meetingDayOffsets('Mi 19:30 · Sa 17:00')).toEqual({ mid: 2, we: 5 })
  })

  it('fällt ohne erkennbare Tage auf Di/So zurück', () => {
    expect(meetingDayOffsets('')).toEqual({ mid: 1, we: 6 })
    expect(meetingDayOffsets('19:00 · 10:00')).toEqual({ mid: 1, we: 6 })
  })
})

describe('meetingDateMs', () => {
  const monday = '2026-09-07' // ISO-Montag

  it('addiert den Wochentag-Versatz auf den Wochenstart', () => {
    // Montag + 1 Tag = Dienstag 2026-09-08
    expect(meetingDateMs(monday, 1)).toBe(Date.parse('2026-09-08'))
    // Montag + 6 Tage = Sonntag 2026-09-13
    expect(meetingDateMs(monday, 6)).toBe(Date.parse('2026-09-13'))
  })

  it('null ohne Startdatum (Demo-/Vorlagen-Wochen) oder bei Unlesbarem', () => {
    expect(meetingDateMs(undefined, 1)).toBeNull()
    expect(meetingDateMs('kein-datum', 1)).toBeNull()
  })
})
