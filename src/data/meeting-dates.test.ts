import { describe, expect, it } from 'vitest'
import {
  currentWeekIndex,
  deutschesDatum,
  meetingDateMs,
  meetingDateText,
  meetingDayOffsets,
  meetingOffset,
  meetingTime,
  meetingTimesOf,
  tageZwischen,
  weekEndMs,
} from './meeting-dates'
import type { Week } from './types'

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

describe('meetingTimesOf', () => {
  it('liest beide Uhrzeiten aus "Di 19:00 · So 10:00"', () => {
    expect(meetingTimesOf('Di 19:00 · So 10:00')).toEqual({ mid: '19:00', we: '10:00' })
  })

  it('füllt einstellige Stunden auf und nimmt auch den Punkt als Trenner', () => {
    expect(meetingTimesOf('Mi 9.30 · Sa 17.00')).toEqual({ mid: '09:30', we: '17:00' })
  })

  it('lässt fehlende Zeiten leer, statt etwas zu erfinden', () => {
    expect(meetingTimesOf('Di · So')).toEqual({ mid: '', we: '' })
    expect(meetingTimesOf('Di 19:00')).toEqual({ mid: '19:00', we: '' })
  })
})

/** Minimale Woche: nur, was die Datumsrechnung liest. */
function woche(start: string | undefined, midDate = '', weDate = ''): Week {
  const leer = { end: '', sections: [], helpers: {} }
  return {
    range: '',
    book: '',
    current: false,
    start,
    mid: { ...leer, date: midDate },
    we: { ...leer, date: weDate },
  }
}

const MEETINGS = 'Di 19:00 · So 10:00'
const MONTAG = '2026-09-07' // ISO-Montag

describe('meetingDateMs', () => {
  it('addiert den Wochentag-Versatz auf den Wochenstart', () => {
    // Montag + 1 Tag = Dienstag 2026-09-08
    expect(meetingDateMs(woche(MONTAG), 'mid', MEETINGS)).toBe(Date.parse('2026-09-08'))
    // Montag + 6 Tage = Sonntag 2026-09-13
    expect(meetingDateMs(woche(MONTAG), 'we', MEETINGS)).toBe(Date.parse('2026-09-13'))
  })

  it('null ohne Startdatum (Demo-/Vorlagen-Wochen) oder bei Unlesbarem', () => {
    expect(meetingDateMs(woche(undefined), 'mid', MEETINGS)).toBeNull()
    expect(meetingDateMs(woche('kein-datum'), 'mid', MEETINGS)).toBeNull()
  })

  it('folgt dem eigenen Termin der Woche statt dem Rhythmus', () => {
    // Der Countdown rechnete den Sondertermin früher NICHT mit: Zeitleiste und
    // Abwesenheitsprüfung nannten den Samstag, die Erinnerung den Dienstag.
    const gedaechtnismahl = woche(MONTAG, 'Samstag, 12. September · 19:30')
    expect(meetingDateMs(gedaechtnismahl, 'mid', MEETINGS)).toBe(Date.parse('2026-09-12'))
  })
})

describe('meetingOffset / meetingTime — eine Rangfolge für Tag und Zeit', () => {
  it('ohne eigenen Termin gelten die Einstellungen', () => {
    expect(meetingOffset(woche(MONTAG), 'mid', MEETINGS)).toBe(1)
    expect(meetingTime(woche(MONTAG), 'we', MEETINGS)).toBe('10:00')
  })

  it('mit eigenem Termin gilt dieser — für Tag UND Zeit', () => {
    const w = woche(MONTAG, 'Samstag, 12. September · 19:30')
    expect(meetingOffset(w, 'mid', MEETINGS)).toBe(5)
    expect(meetingTime(w, 'mid', MEETINGS)).toBe('19:30')
  })

  it('die Wochenspanne im date-Feld ist kein eigener Termin', () => {
    // Importierte Wochen tragen dort „7.–13. September" — kein Wochentag,
    // keine Uhrzeit. Daraus darf nichts abgeleitet werden.
    const w = woche(MONTAG, '7.–13. September')
    expect(meetingOffset(w, 'mid', MEETINGS)).toBe(1)
    expect(meetingTime(w, 'mid', MEETINGS)).toBe('19:00')
  })
})

describe('currentWeekIndex', () => {
  const wochen = [woche('2026-09-07'), woche('2026-09-14'), woche('2026-09-21')]

  it('findet die Woche, in die heute fällt', () => {
    expect(currentWeekIndex(wochen, new Date(2026, 8, 14, 12))).toBe(1) // Montag
    expect(currentWeekIndex(wochen, new Date(2026, 8, 20, 23))).toBe(1) // Sonntag
    expect(currentWeekIndex(wochen, new Date(2026, 8, 21, 0))).toBe(2)
  })

  it('−1, wenn heute außerhalb aller geladenen Wochen liegt', () => {
    expect(currentWeekIndex(wochen, new Date(2026, 7, 1))).toBe(-1)
    expect(currentWeekIndex(wochen, new Date(2026, 9, 1))).toBe(-1)
  })

  it('überspringt Platzhalter ohne Startdatum', () => {
    const mitLuecke = [woche(undefined), woche(undefined), ...wochen]
    expect(currentWeekIndex(mitLuecke, new Date(2026, 8, 15))).toBe(3)
  })

  it('fällt ohne jedes Startdatum auf das current-Flag zurück (Demo)', () => {
    const demo = [woche(undefined), { ...woche(undefined), current: true }, woche(undefined)]
    expect(currentWeekIndex(demo, new Date(2026, 8, 15))).toBe(1)
  })
})

describe('meetingDateText — Termin statt Wochenspanne', () => {
  it('rechnet aus dem Startdatum, wenn nur die Spanne dasteht', () => {
    // Der jw.org-Kopf liefert „7.–13. September": keine Jahreszahl, kein
    // Wochentag, keine Uhrzeit. Genau das stand in „Meine Aufgaben", im
    // S-89-Formular und im Erinnerungstext.
    const w = woche(MONTAG, '7.–13. September', '7.–13. September')
    expect(meetingDateText(w, 0, 'mid', MEETINGS)).toBe('Dienstag, 8. September · 19:00')
    expect(meetingDateText(w, 0, 'we', MEETINGS)).toBe('Sonntag, 13. September · 10:00')
  })

  it('lässt einen eigenen Termin stehen und kürzt nur den Ort weg', () => {
    const w = woche(MONTAG, 'Samstag, 12. September · 19:30 · Königreichssaal')
    expect(meetingDateText(w, 0, 'mid', MEETINGS)).toBe('Samstag, 12. September · 19:30')
  })

  it('ohne Startdatum bleibt stehen, was dasteht (Demo, Vorlagen)', () => {
    const w = woche(undefined, '7.–13. September')
    expect(meetingDateText(w, 0, 'mid', MEETINGS)).toBe('7.–13. September')
  })

  it('ohne hinterlegte Uhrzeit nur der Tag', () => {
    const w = woche(MONTAG, '7.–13. September')
    expect(meetingDateText(w, 0, 'mid', 'Di · So')).toBe('Dienstag, 8. September')
  })

  it('das Ergebnis ist kanonisch deutsch und damit übersetzbar', () => {
    // Die Datumsregeln in i18n/translate.ts greifen nur auf dieser Schreibweise.
    expect(deutschesDatum(new Date(2026, 8, 8))).toBe('Dienstag, 8. September')
    expect(deutschesDatum(new Date(2026, 2, 1))).toBe('Sonntag, 1. März')
  })
})

describe('weekEndMs', () => {
  it('liefert den Sonntag — das Ende der Kalenderwoche, nicht einen Termin', () => {
    expect(weekEndMs(MONTAG)).toBe(Date.parse('2026-09-13'))
  })
  it('null ohne oder mit unlesbarem Startdatum', () => {
    expect(weekEndMs(undefined)).toBeNull()
    expect(weekEndMs('kein-datum')).toBeNull()
  })
})

describe('tageZwischen', () => {
  it('zählt ganze Kalendertage, unabhängig von der Uhrzeit', () => {
    expect(tageZwischen(new Date(2026, 8, 7, 23, 59), new Date(2026, 8, 8, 0, 1))).toBe(1)
    expect(tageZwischen(new Date(2026, 8, 8), new Date(2026, 8, 7))).toBe(-1)
    expect(tageZwischen(new Date(2026, 8, 7, 6), new Date(2026, 8, 7, 20))).toBe(0)
  })
})
