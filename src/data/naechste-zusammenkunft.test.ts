import { describe, expect, it } from 'vitest'
import { istVorbei, naechsteZusammenkunft } from './meeting-dates'
import type { Meeting, Week } from './types'

/**
 * T82 — Programm und Planen öffnen mit der nächsten Zusammenkunft.
 *
 * Gemessen wird auf den Tag, nicht auf die Minute: Wann eine Zusammenkunft
 * *vorbei* ist, weiß niemand — ein Umspringen um 20:47 wäre geraten.
 */

const MEETINGS = 'Di 19:00 · So 10:00'

function meeting(over: Partial<Meeting> = {}): Meeting {
  return { date: '', end: '', sections: [], helpers: {}, ...over }
}

function woche(start: string, over: Partial<Week> = {}): Week {
  return { range: '', book: '', start, current: false, mid: meeting(), we: meeting(), ...over }
}

/** Zwei aufeinanderfolgende Wochen ab Montag, 7. September 2026. */
const WOCHEN = [woche('2026-09-07'), woche('2026-09-14')]
const am = (iso: string) => new Date(`${iso}T12:00:00`)

describe('istVorbei (T77)', () => {
  /** UTC-Mitternacht eines Tages — so trägt `MyTask.at` seinen Termin. */
  const tag = (iso: string) => Date.parse(iso)

  it('am Tag selbst ist nichts vorbei — auch abends nicht', () => {
    expect(istVorbei(tag('2026-09-08'), new Date('2026-09-08T23:30:00'))).toBe(false)
  })

  it('am Tag danach schon', () => {
    expect(istVorbei(tag('2026-09-08'), new Date('2026-09-09T00:10:00'))).toBe(true)
  })

  it('Künftiges ist nie vorbei', () => {
    expect(istVorbei(tag('2026-09-20'), new Date('2026-09-08T12:00:00'))).toBe(false)
  })

  it('ohne Datum (Demo, Vorlagen) ist nichts vorbei', () => {
    // Diese Wochen liegen nirgends im Kalender — dort etwas verschwinden zu
    // lassen hieße raten.
    expect(istVorbei(null, new Date('2026-09-08T12:00:00'))).toBe(false)
    expect(istVorbei(undefined, new Date('2026-09-08T12:00:00'))).toBe(false)
  })
})

describe('naechsteZusammenkunft', () => {
  it('am Samstag steht das Wochenende an — nicht die schon gelaufene Wochenmitte', () => {
    expect(naechsteZusammenkunft(WOCHEN, MEETINGS, am('2026-09-12'))).toEqual({ wi: 0, tab: 'we' })
  })

  it('am Montag ist es die Wochenmitte derselben Woche', () => {
    expect(naechsteZusammenkunft(WOCHEN, MEETINGS, am('2026-09-07'))).toEqual({ wi: 0, tab: 'mid' })
  })

  it('der laufende Tag zählt mit', () => {
    // Sonntagvormittag: Wer hereinschaut, will den Sonntag sehen und nicht
    // schon die kommende Woche.
    expect(naechsteZusammenkunft(WOCHEN, MEETINGS, am('2026-09-13'))).toEqual({ wi: 0, tab: 'we' })
  })

  it('nach der letzten Zusammenkunft der Woche geht es in die nächste', () => {
    // Montag der Folgewoche wäre wieder mid — hier: Sonntagabend ist vorbei,
    // also gilt der Tag danach. Woche UND Reiter wechseln zusammen.
    expect(naechsteZusammenkunft(WOCHEN, MEETINGS, am('2026-09-14'))).toEqual({ wi: 1, tab: 'mid' })
  })

  it('nimmt die Wochentage aus den Einstellungen, nicht aus der Annahme', () => {
    // Mittwoch/Samstag statt Dienstag/Sonntag: am Freitag steht der Samstag an.
    const eigene = 'Mi 19:30 · Sa 17:00'
    expect(naechsteZusammenkunft(WOCHEN, eigene, am('2026-09-11'))).toEqual({ wi: 0, tab: 'we' })
    // Am Donnerstag ist die Wochenmitte schon vorbei.
    expect(naechsteZusammenkunft(WOCHEN, eigene, am('2026-09-10'))).toEqual({ wi: 0, tab: 'we' })
  })

  it('überspringt, was entfällt (T30)', () => {
    // Kongresswoche: beide Zusammenkünfte fallen aus → die nächste steht in
    // der Folgewoche, obwohl die Kongresswoche die laufende ist.
    const kongress = [
      woche('2026-09-07', {
        dev: { mid: { cancelled: true, reason: 'Kongress' }, we: { cancelled: true, reason: 'Kongress' } },
      }),
      woche('2026-09-14'),
    ]
    expect(naechsteZusammenkunft(kongress, MEETINGS, am('2026-09-07'))).toEqual({ wi: 1, tab: 'mid' })
  })

  it('ein eigener Termin in der Woche schlägt den Wochentag der Einstellungen', () => {
    // Gedächtnismahl am Samstagabend: es steht VOR dem Sonntag, obwohl es das
    // Wochenende ist — deshalb wird über beide Zusammenkünfte gesucht und nicht
    // die erste passende genommen.
    const mem = [
      woche('2026-09-07', {
        mid: meeting({ date: 'Dienstag, 8. September · 19:00' }),
        we: meeting({ date: 'Samstag, 12. September · 19:30' }),
      }),
    ]
    expect(naechsteZusammenkunft(mem, MEETINGS, am('2026-09-09'))).toEqual({ wi: 0, tab: 'we' })
  })

  it('ohne Startdatum (Demo, Vorlagen) und ohne Zukunft: null', () => {
    expect(naechsteZusammenkunft([woche('')], MEETINGS, am('2026-09-09'))).toBeNull()
    // Alles vorbei — dann bleibt die Ansicht, wo sie ist.
    expect(naechsteZusammenkunft(WOCHEN, MEETINGS, am('2026-10-01'))).toBeNull()
    expect(naechsteZusammenkunft([], MEETINGS, am('2026-09-09'))).toBeNull()
  })
})
