import { describe, expect, it } from 'vitest'
import { buildAbsences, istAbwesend, istAbwesendAm } from './absence'
import { MEETING_TABS } from './helpers'

/** Fehlt jemand in dieser Woche — in mindestens einer Zusammenkunft? */
const inWocheAbwesend = (set: Parameters<typeof istAbwesend>[0], pid: string, wi: number) =>
  MEETING_TABS.some((tab) => istAbwesend(set, pid, wi, tab))
import type { Absence, Week } from './types'

/** Montag der Woche 0 = 7.9.2026; Zusammenkünfte Di 19:00 und So 10:00. */
const BASE = new Date(2026, 8, 7, 12)
const MEETINGS = 'Di 19:00 · So 10:00'

function woche(patch: Partial<Week> = {}): Week {
  const leer = { date: '', end: '', sections: [], helpers: {} }
  return { range: '', book: '', start: '2026-09-07', current: false, mid: { ...leer }, we: { ...leer }, ...patch }
}
/** Montag der Woche `i`, ab 7. September 2026. */
const montag = (i: number): string => new Date(Date.UTC(2026, 8, 7 + i * 7)).toISOString().slice(0, 10)
/**
 * `n` aufeinanderfolgende Wochen, beginnend mit der Woche `ab` (Index seit dem
 * 7.9.2026). Seit T66 trägt jede Woche ihr Startdatum — welche Kalenderwoche
 * ein Index meint, hängt davon ab, welche Wochen geladen sind, und genau das
 * prüft der letzte Test hier.
 */
const wochen = (n: number, ab = 0): Week[] =>
  Array.from({ length: n }, (_, i) => woche({ start: montag(ab + i) }))

function abw(patch: Partial<Absence> = {}): Absence {
  return { id: 'a', personId: 'p1', userId: 'u1', from: '', to: '', reason: '', ...patch }
}

describe('Abwesenheiten auf Wochen abbilden', () => {
  it('trifft die Woche, in der die Zusammenkünfte liegen', () => {
    // Woche 0: Di 8.9., So 13.9.
    const set = buildAbsences([abw({ from: '2026-09-07', to: '2026-09-13' })], wochen(3), BASE, MEETINGS)
    expect(istAbwesend(set, 'p1', 0, 'mid')).toBe(true)
    expect(istAbwesend(set, 'p1', 0, 'we')).toBe(true)
    expect(inWocheAbwesend(set, 'p1', 1)).toBe(false)
  })

  it('sperrt nur die getroffene Zusammenkunft, nicht die ganze Woche', () => {
    // Nur das Wochenende (12.–13.9.): der Dienstag bleibt frei.
    const set = buildAbsences([abw({ from: '2026-09-12', to: '2026-09-13' })], wochen(3), BASE, MEETINGS)
    expect(istAbwesend(set, 'p1', 0, 'mid')).toBe(false)
    expect(istAbwesend(set, 'p1', 0, 'we')).toBe(true)
  })

  it('deckt mehrere Wochen ab', () => {
    const set = buildAbsences([abw({ from: '2026-09-07', to: '2026-09-27' })], wochen(5), BASE, MEETINGS)
    for (const wi of [0, 1, 2]) expect(inWocheAbwesend(set, 'p1', wi)).toBe(true)
    expect(inWocheAbwesend(set, 'p1', 3)).toBe(false)
  })

  it('nimmt Anfangs- und Endtag mit (einschließlich)', () => {
    const nurDienstag = buildAbsences([abw({ from: '2026-09-08', to: '2026-09-08' })], wochen(2), BASE, MEETINGS)
    expect(istAbwesend(nurDienstag, 'p1', 0, 'mid')).toBe(true)
    expect(istAbwesend(nurDienstag, 'p1', 0, 'we')).toBe(false)
  })

  /**
   * Der Kern der Umstellung: der gespeicherte Zeitraum bleibt derselbe, egal
   * welche Wochen geladen sind. Früher war die Abwesenheit ein Wochenindex und
   * zeigte nach dem Verschieben der Wochen auf eine andere Woche.
   */
  it('bleibt am selben Datum, wenn andere Wochen geladen sind', () => {
    const eintrag = abw({ from: '2026-09-21', to: '2026-09-27' }) // Woche 2 ab dem 7.9.
    const abDerDrittenWoche = new Date(2026, 8, 21, 12) // Basis zwei Wochen später
    // Geladen sind jetzt die Wochen ab dem 21.9. — dieselbe Kalenderwoche wie
    // oben steht damit an Index 0 statt an Index 2.
    const spaeter = buildAbsences([eintrag], wochen(3, 2), abDerDrittenWoche, MEETINGS)
    // Dieselbe Kalenderwoche ist jetzt Index 0 — nicht mehr 2.
    expect(inWocheAbwesend(spaeter, 'p1', 0)).toBe(true)
    expect(inWocheAbwesend(spaeter, 'p1', 2)).toBe(false)
  })

  it('nutzt das ISO-Startdatum der Woche, wenn es eines gibt', () => {
    // Woche mit eigenem start: die Basis darf sie nicht verschieben.
    const importiert = [woche({ start: '2026-11-02' })] // Mo 2.11. → Di 3.11.
    const set = buildAbsences([abw({ from: '2026-11-03', to: '2026-11-03' })], importiert, BASE, MEETINGS)
    expect(istAbwesend(set, 'p1', 0, 'mid')).toBe(true)
  })

  it('folgt einem eigenen Termin der Woche (Gedächtnismahl)', () => {
    // Woche 0, Wochenende ausnahmsweise Samstag 12.9. statt Sonntag 13.9.
    const sonder = [woche({ we: { date: 'Samstag, 12. September · 19:30', end: '', sections: [], helpers: {} } })]
    const set = buildAbsences([abw({ from: '2026-09-12', to: '2026-09-12' })], sonder, BASE, MEETINGS)
    expect(istAbwesend(set, 'p1', 0, 'we')).toBe(true)
  })

  it('übergeht Einträge ohne verknüpfte Person', () => {
    const ohne = buildAbsences(
      [abw({ personId: null, from: '2026-09-07', to: '2026-09-13' })],
      wochen(2), BASE, MEETINGS,
    )
    expect(ohne.size).toBe(0)
  })

  it('trennt Personen sauber', () => {
    const set = buildAbsences(
      [abw({ personId: 'p1', from: '2026-09-07', to: '2026-09-13' })],
      wochen(2), BASE, MEETINGS,
    )
    expect(istAbwesend(set, 'p2', 0, 'mid')).toBe(false)
    expect(istAbwesend(set, undefined, 0, 'mid')).toBe(false)
  })
})

describe('Abwesend an einem bestimmten Tag (Treffpunkte)', () => {
  const liste = [abw({ from: '2026-09-10', to: '2026-09-14' })]

  it('erkennt Tage im Zeitraum, einschließlich der Ränder', () => {
    expect(istAbwesendAm(liste, 'p1', new Date(2026, 8, 10, 12))).toBe(true)
    expect(istAbwesendAm(liste, 'p1', new Date(2026, 8, 14, 12))).toBe(true)
    expect(istAbwesendAm(liste, 'p1', new Date(2026, 8, 12, 12))).toBe(true)
  })

  it('lässt Tage davor und danach frei', () => {
    expect(istAbwesendAm(liste, 'p1', new Date(2026, 8, 9, 12))).toBe(false)
    expect(istAbwesendAm(liste, 'p1', new Date(2026, 8, 15, 12))).toBe(false)
  })

  it('gilt nur für die eigene Person', () => {
    expect(istAbwesendAm(liste, 'p2', new Date(2026, 8, 12, 12))).toBe(false)
    expect(istAbwesendAm(liste, undefined, new Date(2026, 8, 12, 12))).toBe(false)
  })
})
